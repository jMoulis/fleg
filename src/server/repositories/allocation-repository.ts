import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  allocationPlanSchema,
  type AllocationLine,
  type AllocationPlan,
  type AllocationPlanCreateInput,
  type AllocationValidationIssue,
} from "@/domain/space/allocation-schemas";
import {
  flattenLayoutCapacity,
  validateAllocationDraft,
} from "@/domain/space/allocations";
import { buildAllocationScope } from "@/domain/space/allocation-scope";
import {
  productSpacePolicySchema,
  type ProductSpacePolicy,
} from "@/domain/space/product-space-policy-schemas";
import {
  type FixtureType,
  layoutVersionSchema,
  type LayoutVersion,
} from "@/domain/space/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface AllocationLineDocument
  extends Omit<AllocationLine, "productId"> {
  productId: ObjectId;
}

interface AllocationPlanDocument
  extends Omit<
    AllocationPlan,
    | "id"
    | "storeId"
    | "departmentId"
    | "layoutVersionId"
    | "allocations"
    | "createdAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  layoutVersionId: ObjectId;
  allocations: AllocationLineDocument[];
  idempotencyKey: string;
  basedOnPlanVersion: number;
  createdAt: Date;
}

interface LayoutVersionDocument {
  organizationId: string;
  storeId: ObjectId;
  departmentId: ObjectId;
  departmentKey: "fruit_vegetable";
  version: number;
  createdAt: Date;
  [key: string]: unknown;
}

interface ProductSpacePolicySetDocument {
  organizationId: string;
  storeId: ObjectId;
  revision: number;
  policies: Array<{
    productId: ObjectId;
    mustStock: boolean;
    suitability: "unknown" | "restricted";
    allowedFixtureTypes: FixtureType[];
  }>;
}

export class AllocationPlanConflictError extends Error {
  readonly code = "ALLOCATION_PLAN_CONFLICT";

  constructor() {
    super("Le plan ou ses allocations ont changé depuis l'ouverture");
    this.name = "AllocationPlanConflictError";
  }
}

export class InvalidAllocationPlanError extends Error {
  readonly code = "INVALID_ALLOCATION_PLAN";

  constructor(readonly issues: AllocationValidationIssue[]) {
    super(issues[0]?.message ?? "Le plan d'allocation est invalide");
    this.name = "InvalidAllocationPlanError";
  }
}

function toLayoutVersion(
  document: WithId<LayoutVersionDocument>,
): LayoutVersion {
  return layoutVersionSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    createdAt: document.createdAt.toISOString(),
  });
}

function toAllocationPlan(
  document: WithId<AllocationPlanDocument>,
): AllocationPlan {
  return allocationPlanSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    layoutVersionId: document.layoutVersionId.toHexString(),
    allocations: document.allocations.map((allocation) => ({
      ...allocation,
      productId: allocation.productId.toHexString(),
    })),
    createdAt: document.createdAt.toISOString(),
  });
}

export class AllocationRepository {
  private readonly allocationPlans;
  private readonly layoutVersions;
  private readonly products;
  private readonly policySets;
  private readonly storeSettings;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.allocationPlans =
      db.collection<AllocationPlanDocument>("allocationPlans");
    this.layoutVersions = db.collection<LayoutVersionDocument>("layoutVersions");
    this.products = db.collection<{ organizationId: string; storeId: ObjectId; active: boolean }>(
      "products",
    );
    this.policySets =
      db.collection<ProductSpacePolicySetDocument>("productSpacePolicySets");
    this.storeSettings = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      revision: number;
    }>("storeSettings");
    this.stores = db.collection<{
      organizationId: string;
      dataRevision: number;
      active: boolean;
    }>("stores");
    this.auditLogs = db.collection("auditLogs");
  }

  async getLatestForLayout(
    context: AuthorizedStoreContext,
    layoutVersionId: string,
  ): Promise<AllocationPlan | null> {
    const scope = buildAllocationScope(context);
    const document = await this.allocationPlans.findOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        layoutVersionId: new ObjectId(layoutVersionId),
      },
      { sort: { version: -1, createdAt: -1 } },
    );

    return document ? toAllocationPlan(document) : null;
  }

  async createNextPlan(input: {
    context: AuthorizedStoreContext;
    createInput: AllocationPlanCreateInput;
    requestId: string;
  }): Promise<AllocationPlan> {
    const { context, createInput, requestId } = input;
    const scope = buildAllocationScope(context);
    const storeId = new ObjectId(scope.storeId);
    const layoutVersionId = new ObjectId(createInput.layoutVersionId);
    const idempotencyFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: createInput.idempotencyKey,
    };
    const existing = await this.allocationPlans.findOne(idempotencyFilter);

    if (existing) {
      return toAllocationPlan(existing);
    }

    if (!this.client) {
      throw new Error("Client Mongo requis pour créer un plan d'allocation");
    }

    const session = this.client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const latestLayoutDocument = await this.layoutVersions.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            departmentKey: "fruit_vegetable",
          },
          { sort: { version: -1, createdAt: -1 }, session },
        );

        if (
          !latestLayoutDocument ||
          !latestLayoutDocument._id.equals(layoutVersionId)
        ) {
          throw new AllocationPlanConflictError();
        }

        const latestPlan = await this.allocationPlans.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            layoutVersionId,
          },
          { sort: { version: -1, createdAt: -1 }, session },
        );
        const currentPlanVersion = latestPlan?.version ?? 0;

        if (currentPlanVersion !== createInput.basedOnPlanVersion) {
          throw new AllocationPlanConflictError();
        }

        const [policySetDocument, settingsDocument, storeDocument] =
          await Promise.all([
            this.policySets.findOne(
              { organizationId: scope.organizationId, storeId },
              { session },
            ),
            this.storeSettings.findOne(
              { organizationId: scope.organizationId, storeId },
              { projection: { revision: 1 }, session },
            ),
            this.stores.findOne(
              {
                _id: storeId,
                organizationId: scope.organizationId,
                active: true,
              },
              { projection: { dataRevision: 1 }, session },
            ),
          ]);
        const policyRevision = policySetDocument?.revision ?? 0;
        const settingsRevision = settingsDocument?.revision ?? 0;

        if (
          createInput.basis.policyRevision !== policyRevision ||
          createInput.constraintSnapshot.policyRevision !== policyRevision ||
          createInput.basis.settingsRevision !== settingsRevision ||
          (createInput.basis.dataRevision !== null &&
            createInput.basis.dataRevision !==
              (storeDocument?.dataRevision ?? 0))
        ) {
          throw new AllocationPlanConflictError();
        }

        const currentPolicies: ProductSpacePolicy[] = (
          policySetDocument?.policies ?? []
        ).map((policy) =>
          productSpacePolicySchema.parse({
            ...policy,
            productId: policy.productId.toHexString(),
          }),
        );

        const uniqueProductIds = [
          ...new Set(
            createInput.allocations.map((allocation) => allocation.productId),
          ),
        ];
        const productObjectIds = uniqueProductIds.map((id) => new ObjectId(id));
        const authorizedProducts = await this.products
          .find(
            {
              _id: { $in: productObjectIds },
              organizationId: scope.organizationId,
              storeId,
              active: true,
            },
            { projection: { _id: 1 }, session },
          )
          .toArray();
        const authorizedProductIds = new Set(
          authorizedProducts.map((product) => product._id.toHexString()),
        );
        const layout = toLayoutVersion(latestLayoutDocument);
        const validationIssues = validateAllocationDraft({
          capacities: flattenLayoutCapacity(layout),
          allocations: createInput.allocations,
          config: createInput.config,
          authorizedProductIds,
          policies: currentPolicies,
        });

        if (validationIssues.length > 0) {
          throw new InvalidAllocationPlanError(validationIssues);
        }

        const createdAt = new Date();
        const planId = new ObjectId();
        const nextPlan = allocationPlanSchema.parse({
          id: planId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          departmentId: layout.departmentId,
          layoutVersionId: createInput.layoutVersionId,
          version: currentPlanVersion + 1,
          name: createInput.name,
          status: "draft",
          source: createInput.source,
          modelVersion: createInput.modelVersion,
          config: createInput.config,
          basis: createInput.basis,
          evidence: createInput.evidence,
          limitations: createInput.limitations,
          constraintSnapshot: {
            policyRevision,
            policies: currentPolicies,
          },
          economics: createInput.economics,
          allocations: createInput.allocations,
          note: createInput.note?.trim() || null,
          createdBy: context.userId,
          createdAt: createdAt.toISOString(),
        });

        await this.allocationPlans.insertOne(
          {
            _id: planId,
            organizationId: nextPlan.organizationId,
            storeId,
            departmentId: latestLayoutDocument.departmentId,
            layoutVersionId,
            version: nextPlan.version,
            name: nextPlan.name,
            status: nextPlan.status,
            source: nextPlan.source,
            modelVersion: nextPlan.modelVersion,
            config: nextPlan.config,
            basis: nextPlan.basis,
            evidence: nextPlan.evidence,
            limitations: nextPlan.limitations,
            constraintSnapshot: nextPlan.constraintSnapshot,
            economics: nextPlan.economics,
            allocations: nextPlan.allocations.map((allocation) => ({
              ...allocation,
              productId: new ObjectId(allocation.productId),
            })),
            note: nextPlan.note,
            createdBy: nextPlan.createdBy,
            idempotencyKey: createInput.idempotencyKey,
            basedOnPlanVersion: createInput.basedOnPlanVersion,
            createdAt,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "allocation.plan.created",
            entityType: "allocationPlan",
            entityId: planId,
            before: latestPlan ? toAllocationPlan(latestPlan) : null,
            after: nextPlan,
            requestId,
            timestamp: createdAt,
            createdAt,
          },
          { session },
        );

        return nextPlan;
      });

      if (!result) {
        throw new Error("Le plan d'allocation n'a pas été créé");
      }

      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const duplicate = await this.allocationPlans.findOne(idempotencyFilter);

        if (duplicate) {
          return toAllocationPlan(duplicate);
        }

        throw new AllocationPlanConflictError();
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }
}
