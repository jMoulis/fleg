import "server-only";

import {
  type Db,
  type MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import { buildAllocationScope } from "@/domain/space/allocation-scope";
import {
  productSpacePolicySetSchema,
  type ProductSpacePolicy,
  type ProductSpacePolicySet,
  type ProductSpacePolicySetUpdateInput,
} from "@/domain/space/product-space-policy-schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface ProductSpacePolicyDocument
  extends Omit<ProductSpacePolicy, "productId"> {
  productId: ObjectId;
}

interface ProductSpacePolicySetDocument {
  organizationId: string;
  storeId: ObjectId;
  revision: number;
  policies: ProductSpacePolicyDocument[];
  updatedBy: string;
  updatedAt: Date;
}

interface ProductSpacePolicyCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  snapshot: ProductSpacePolicySet;
  createdAt: Date;
}

export class ProductSpacePolicyConflictError extends Error {
  readonly code = "PRODUCT_SPACE_POLICY_CONFLICT";

  constructor() {
    super("Les contraintes produits ont changé depuis l’ouverture de la page");
    this.name = "ProductSpacePolicyConflictError";
  }
}

export class ProductSpacePolicyReferenceError extends Error {
  readonly code = "PRODUCT_SPACE_POLICY_REFERENCE_INVALID";

  constructor() {
    super("Une contrainte référence un produit indisponible dans ce magasin");
    this.name = "ProductSpacePolicyReferenceError";
  }
}

function emptyPolicySet(context: AuthorizedStoreContext): ProductSpacePolicySet {
  return productSpacePolicySetSchema.parse({
    organizationId: context.organizationId,
    storeId: context.storeId,
    revision: 0,
    policies: [],
    updatedBy: null,
    updatedAt: null,
  });
}

function toPolicySet(
  document: WithId<ProductSpacePolicySetDocument>,
): ProductSpacePolicySet {
  return productSpacePolicySetSchema.parse({
    organizationId: document.organizationId,
    storeId: document.storeId.toHexString(),
    revision: document.revision,
    policies: document.policies.map((policy) => ({
      ...policy,
      productId: policy.productId.toHexString(),
    })),
    updatedBy: document.updatedBy,
    updatedAt: document.updatedAt.toISOString(),
  });
}

export class ProductSpacePolicyRepository {
  private readonly policySets;
  private readonly commands;
  private readonly products;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.policySets =
      db.collection<ProductSpacePolicySetDocument>("productSpacePolicySets");
    this.commands =
      db.collection<ProductSpacePolicyCommandDocument>(
        "productSpacePolicyCommands",
      );
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.auditLogs = db.collection("auditLogs");
  }

  async getForStore(
    context: AuthorizedStoreContext,
  ): Promise<ProductSpacePolicySet> {
    const scope = buildAllocationScope(context);
    const document = await this.policySets.findOne({
      organizationId: scope.organizationId,
      storeId: new ObjectId(scope.storeId),
    });

    return document ? toPolicySet(document) : emptyPolicySet(context);
  }

  async updateForStore(input: {
    context: AuthorizedStoreContext;
    updateInput: ProductSpacePolicySetUpdateInput;
    requestId: string;
  }): Promise<ProductSpacePolicySet> {
    const { context, updateInput, requestId } = input;
    const scope = buildAllocationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: updateInput.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate) {
      return productSpacePolicySetSchema.parse(duplicate.snapshot);
    }
    if (!this.client) {
      throw new Error("Client Mongo requis pour modifier les contraintes");
    }

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, {
          session,
        });
        if (repeated) {
          return productSpacePolicySetSchema.parse(repeated.snapshot);
        }

        const current = await this.policySets.findOne(
          { organizationId: scope.organizationId, storeId },
          { session },
        );
        if ((current?.revision ?? 0) !== updateInput.basedOnRevision) {
          throw new ProductSpacePolicyConflictError();
        }

        const productIds = updateInput.policies.map(
          (policy) => new ObjectId(policy.productId),
        );
        const productCount =
          productIds.length === 0
            ? 0
            : await this.products.countDocuments(
                {
                  _id: { $in: productIds },
                  organizationId: scope.organizationId,
                  storeId,
                  active: true,
                },
                { session },
              );
        if (productCount !== productIds.length) {
          throw new ProductSpacePolicyReferenceError();
        }

        const now = new Date();
        const revision = (current?.revision ?? 0) + 1;
        const document: ProductSpacePolicySetDocument = {
          organizationId: scope.organizationId,
          storeId,
          revision,
          policies: updateInput.policies.map((policy) => ({
            ...policy,
            productId: new ObjectId(policy.productId),
          })),
          updatedBy: context.userId,
          updatedAt: now,
        };
        await this.policySets.replaceOne(
          { organizationId: scope.organizationId, storeId },
          document,
          { upsert: true, session },
        );
        const saved = productSpacePolicySetSchema.parse({
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          revision,
          policies: updateInput.policies,
          updatedBy: context.userId,
          updatedAt: now.toISOString(),
        });
        const before = current ? toPolicySet(current) : emptyPolicySet(context);
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "space.product_policies.updated",
            entityType: "productSpacePolicySet",
            entityId: storeId,
            before,
            after: saved,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            snapshot: saved,
            createdAt: now,
          },
          { session },
        );

        return saved;
      });

      if (!result) {
        throw new Error("Les contraintes produits n’ont pas été enregistrées");
      }
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated) {
          return productSpacePolicySetSchema.parse(repeated.snapshot);
        }
        throw new ProductSpacePolicyConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
