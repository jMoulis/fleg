import "server-only";

import {
  Db,
  MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  markdownFactSchema,
  type MarkdownCreateInput,
  type MarkdownFact,
  type MarkdownListQuery,
} from "@/domain/markdown/schemas";
import { buildMarkdownScope } from "@/domain/markdown/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface MarkdownFactDocument
  extends Omit<
    MarkdownFact,
    "id" | "storeId" | "departmentId" | "productId" | "createdAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  productId: ObjectId;
  createdAt: Date;
}

interface MarkdownCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  markdownId: ObjectId;
  snapshot: MarkdownFact;
  createdAt: Date;
}

export class MarkdownReferenceError extends Error {
  readonly code = "MARKDOWN_REFERENCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "MarkdownReferenceError";
  }
}

function toMarkdownFact(
  document: WithId<MarkdownFactDocument>,
): MarkdownFact {
  return markdownFactSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    departmentId: document.departmentId.toHexString(),
    productId: document.productId.toHexString(),
    createdAt: document.createdAt.toISOString(),
  });
}

export class MarkdownRepository {
  private readonly markdownFacts;
  private readonly markdownCommands;
  private readonly products;
  private readonly departments;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.markdownFacts =
      db.collection<MarkdownFactDocument>("markdownFacts");
    this.markdownCommands =
      db.collection<MarkdownCommandDocument>("markdownCommands");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.departments = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      key: "fruit_vegetable";
      active: boolean;
    }>("departments");
    this.stores = db.collection<{
      organizationId: string;
      active: boolean;
      dataRevision: number;
    }>("stores");
    this.auditLogs = db.collection("auditLogs");
  }

  async listForStore(
    context: AuthorizedStoreContext,
    query: MarkdownListQuery,
  ): Promise<MarkdownFact[]> {
    const scope = buildMarkdownScope(context);
    const occurredOn =
      query.from || query.to
        ? {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          }
        : undefined;
    const documents = await this.markdownFacts
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        ...(occurredOn ? { occurredOn } : {}),
        ...(query.productId
          ? { productId: new ObjectId(query.productId) }
          : {}),
      })
      .sort({ occurredOn: -1, createdAt: -1 })
      .limit(1_000)
      .toArray();

    return documents.map(toMarkdownFact);
  }

  async findForPeriods(input: {
    context: AuthorizedStoreContext;
    periodKeys: string[];
    productIds: string[];
  }): Promise<MarkdownFact[]> {
    if (input.periodKeys.length === 0 || input.productIds.length === 0) return [];
    const scope = buildMarkdownScope(input.context);
    const documents = await this.markdownFacts
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        periodKey: { $in: input.periodKeys },
        productId: {
          $in: input.productIds.map((productId) => new ObjectId(productId)),
        },
      })
      .sort({ occurredOn: 1, createdAt: 1 })
      .toArray();
    return documents.map(toMarkdownFact);
  }

  async create(input: {
    context: AuthorizedStoreContext;
    createInput: MarkdownCreateInput;
    requestId: string;
  }): Promise<MarkdownFact> {
    const { context, createInput, requestId } = input;
    const scope = buildMarkdownScope(context);
    const storeId = new ObjectId(scope.storeId);
    const duplicate = await this.markdownCommands.findOne({
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: createInput.idempotencyKey,
    });
    if (duplicate) return markdownFactSchema.parse(duplicate.snapshot);
    if (!this.client) throw new Error("Client MongoDB requis pour cette opération");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const [product, department, store] = await Promise.all([
          this.products.findOne(
            {
              _id: new ObjectId(createInput.productId),
              organizationId: scope.organizationId,
              storeId,
              active: true,
            },
            { projection: { _id: 1 }, session },
          ),
          this.departments.findOne(
            {
              organizationId: scope.organizationId,
              storeId,
              key: "fruit_vegetable",
              active: true,
            },
            { projection: { _id: 1 }, session },
          ),
          this.stores.findOne(
            {
              _id: storeId,
              organizationId: scope.organizationId,
              active: true,
            },
            { projection: { _id: 1 }, session },
          ),
        ]);
        if (!product) {
          throw new MarkdownReferenceError(
            "Le produit n’appartient pas au magasin autorisé",
          );
        }
        if (!department || !store) {
          throw new MarkdownReferenceError(
            "Le rayon ou le magasin n’est pas disponible",
          );
        }

        const now = new Date();
        const markdownId = new ObjectId();
        const markdown = markdownFactSchema.parse({
          id: markdownId.toHexString(),
          organizationId: scope.organizationId,
          storeId: scope.storeId,
          departmentId: department._id.toHexString(),
          productId: createInput.productId,
          occurredOn: createInput.occurredOn,
          periodKey: createInput.occurredOn.slice(0, 7),
          amountCents: createInput.amountCents,
          quantity: createInput.quantity,
          reason: createInput.reason,
          notes: createInput.notes,
          source: "manual",
          createdBy: context.userId,
          createdAt: now.toISOString(),
        });

        await this.markdownFacts.insertOne(
          {
            _id: markdownId,
            organizationId: markdown.organizationId,
            storeId,
            departmentId: department._id,
            productId: new ObjectId(markdown.productId),
            occurredOn: markdown.occurredOn,
            periodKey: markdown.periodKey,
            amountCents: markdown.amountCents,
            quantity: markdown.quantity,
            reason: markdown.reason,
            notes: markdown.notes,
            source: "manual",
            createdBy: markdown.createdBy,
            createdAt: now,
          },
          { session },
        );
        await this.markdownCommands.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            idempotencyKey: createInput.idempotencyKey,
            markdownId,
            snapshot: markdown,
            createdAt: now,
          },
          { session },
        );
        await this.stores.updateOne(
          {
            _id: storeId,
            organizationId: scope.organizationId,
            active: true,
          },
          { $inc: { dataRevision: 1 } },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "markdown.created",
            entityType: "markdown",
            entityId: markdownId,
            before: null,
            after: markdown,
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        return markdown;
      });
      if (!result) throw new Error("La démarque n’a pas été enregistrée");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.markdownCommands.findOne({
          organizationId: scope.organizationId,
          storeId,
          idempotencyKey: createInput.idempotencyKey,
        });
        if (existing) return markdownFactSchema.parse(existing.snapshot);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
