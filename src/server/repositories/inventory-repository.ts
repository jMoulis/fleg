import "server-only";

import {
  type Db,
  type MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import {
  calculateObservationAgeHours,
  isProfileConfigured,
  prepareStockObservations,
} from "@/domain/inventory/calculations";
import {
  inventoryCommitResultSchema,
  inventoryCountSchema,
  inventoryProductProfileSchema,
  inventoryWorkspaceSchema,
  stockSnapshotSchema,
  type InventoryCommitResult,
  type InventoryCount,
  type InventoryCountCreateInput,
  type InventoryCountLine,
  type InventoryCountUpdateInput,
  type InventoryProductProfile,
  type InventoryWorkspace,
  type StockSnapshot,
} from "@/domain/inventory/schemas";
import { buildInventoryScope } from "@/domain/inventory/store-scope";
import { planStockSnapshotVersions } from "@/domain/inventory/versioning";
import type { ProductOption } from "@/domain/products/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface InventoryProductProfileDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  familyCode: "3400" | "3402";
  stockUnit: "kg" | "piece";
  lastPackSize: number;
  revision: number;
  updatedBy: string;
  updatedAt: Date;
}

interface InventoryCountLineDocument
  extends Omit<InventoryCountLine, "productId"> {
  productId: ObjectId;
}

export interface InventoryCountDocument {
  organizationId: string;
  storeId: ObjectId;
  businessDate: string;
  version: number;
  revision: number;
  status: "draft" | "committed";
  lines: InventoryCountLineDocument[];
  supersedesCountId: ObjectId | null;
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
  committedBy: string | null;
  committedAt: Date | null;
}

interface StockSnapshotDocument
  extends Omit<
    StockSnapshot,
    | "id"
    | "storeId"
    | "productId"
    | "countId"
    | "supersedesSnapshotId"
    | "observedAt"
    | "createdAt"
  > {
  storeId: ObjectId;
  productId: ObjectId;
  countId: ObjectId;
  supersedesSnapshotId: ObjectId | null;
  observedAt: Date;
  createdAt: Date;
}

interface InventoryCommandDocument {
  organizationId: string;
  storeId: ObjectId;
  idempotencyKey: string;
  operation: "create" | "save" | "commit";
  countId: ObjectId;
  countSnapshot?: InventoryCount;
  commitResult?: InventoryCommitResult;
  createdAt: Date;
}

export class InventoryConflictError extends Error {
  readonly code = "INVENTORY_CONFLICT";

  constructor(message = "Le comptage a changé depuis l’ouverture de la page") {
    super(message);
    this.name = "InventoryConflictError";
  }
}

export class InventoryReferenceError extends Error {
  readonly code = "INVENTORY_REFERENCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "InventoryReferenceError";
  }
}

export class InventoryNotFoundError extends Error {
  readonly code = "INVENTORY_NOT_FOUND";

  constructor() {
    super("Comptage introuvable ou accès refusé");
    this.name = "InventoryNotFoundError";
  }
}

function toInventoryProfile(
  document: WithId<InventoryProductProfileDocument>,
): InventoryProductProfile {
  return inventoryProductProfileSchema.parse({
    productId: document.productId.toHexString(),
    familyCode: document.familyCode,
    stockUnit: document.stockUnit,
    lastPackSize: document.lastPackSize,
    revision: document.revision,
    updatedBy: document.updatedBy,
    updatedAt: document.updatedAt.toISOString(),
  });
}

export function toInventoryCount(
  document: WithId<InventoryCountDocument>,
): InventoryCount {
  return inventoryCountSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    lines: document.lines.map((line) => ({
      ...line,
      productId: line.productId.toHexString(),
    })),
    supersedesCountId: document.supersedesCountId?.toHexString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    committedAt: document.committedAt?.toISOString() ?? null,
  });
}

function toStockSnapshot(
  document: WithId<StockSnapshotDocument>,
): StockSnapshot {
  return stockSnapshotSchema.parse({
    ...document,
    id: document._id.toHexString(),
    storeId: document.storeId.toHexString(),
    productId: document.productId.toHexString(),
    countId: document.countId.toHexString(),
    supersedesSnapshotId: document.supersedesSnapshotId?.toHexString() ?? null,
    observedAt: document.observedAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
  });
}

function lineFromProfile(
  profile: WithId<InventoryProductProfileDocument>,
): InventoryCountLineDocument {
  return {
    productId: profile.productId,
    familyCode: profile.familyCode,
    stockUnit: profile.stockUnit,
    packSize: profile.lastPackSize,
    reserveCaseCount: null,
    shelfQuantity: null,
  };
}

function lineFromSnapshot(
  snapshot: WithId<StockSnapshotDocument>,
): InventoryCountLineDocument {
  return {
    productId: snapshot.productId,
    familyCode: snapshot.familyCode,
    stockUnit: snapshot.stockUnit,
    packSize: snapshot.packSize,
    reserveCaseCount: snapshot.reserveCaseCount,
    shelfQuantity: snapshot.shelfQuantity,
    observedAt: snapshot.observedAt.toISOString(),
  };
}

export class InventoryRepository {
  private readonly profiles;
  private readonly counts;
  private readonly snapshots;
  private readonly commands;
  private readonly products;
  private readonly stores;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client?: MongoClient,
  ) {
    this.profiles = db.collection<InventoryProductProfileDocument>(
      "inventoryProductProfiles",
    );
    this.counts = db.collection<InventoryCountDocument>("inventoryCounts");
    this.snapshots = db.collection<StockSnapshotDocument>("stockSnapshots");
    this.commands =
      db.collection<InventoryCommandDocument>("inventoryCommands");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      active: boolean;
    }>("products");
    this.stores = db.collection<{
      organizationId: string;
      active: boolean;
      dataRevision: number;
    }>("stores");
    this.auditLogs = db.collection("auditLogs");
  }

  async getWorkspace(input: {
    context: AuthorizedStoreContext;
    businessDate: string;
    products: ProductOption[];
    now?: Date;
  }): Promise<InventoryWorkspace> {
    const scope = buildInventoryScope(input.context);
    const storeId = new ObjectId(scope.storeId);
    const productIds = input.products.map(({ id }) => new ObjectId(id));
    const [countDocument, profileDocuments, dayDocuments, latestDocuments] =
      await Promise.all([
        this.counts.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            businessDate: input.businessDate,
          },
          { sort: { version: -1 } },
        ),
        productIds.length === 0
          ? []
          : this.profiles
              .find({
                organizationId: scope.organizationId,
                storeId,
                productId: { $in: productIds },
              })
              .toArray(),
        productIds.length === 0
          ? []
          : this.snapshots
              .find({
                organizationId: scope.organizationId,
                storeId,
                productId: { $in: productIds },
                businessDate: input.businessDate,
                active: true,
              })
              .toArray(),
        productIds.length === 0
          ? []
          : this.snapshots
              .aggregate<WithId<StockSnapshotDocument>>([
                {
                  $match: {
                    organizationId: scope.organizationId,
                    storeId,
                    productId: { $in: productIds },
                    active: true,
                  },
                },
                { $sort: { productId: 1, observedAt: -1 } },
                {
                  $group: {
                    _id: "$productId",
                    snapshot: { $first: "$$ROOT" },
                  },
                },
                { $replaceRoot: { newRoot: "$snapshot" } },
              ])
              .toArray(),
      ]);

    const profileByProduct = new Map(
      profileDocuments.map((profile) => [
        profile.productId.toHexString(),
        toInventoryProfile(profile),
      ]),
    );
    const dayByProduct = new Map(
      dayDocuments.map((snapshot) => [
        snapshot.productId.toHexString(),
        toStockSnapshot(snapshot),
      ]),
    );
    const latestByProduct = new Map<string, StockSnapshot>();
    for (const snapshot of latestDocuments) {
      const productId = snapshot.productId.toHexString();
      if (!latestByProduct.has(productId)) {
        latestByProduct.set(productId, toStockSnapshot(snapshot));
      }
    }
    const now = input.now ?? new Date();

    return inventoryWorkspaceSchema.parse({
      businessDate: input.businessDate,
      count: countDocument ? toInventoryCount(countDocument) : null,
      products: input.products.map((product) => {
        const latest = latestByProduct.get(product.id) ?? null;
        return {
          ...product,
          profile: profileByProduct.get(product.id) ?? null,
          daySnapshot: dayByProduct.get(product.id) ?? null,
          latestAvailability: latest
            ? {
                snapshot: latest,
                observationAgeHours: calculateObservationAgeHours(
                  latest.observedAt,
                  now,
                ),
                isStockout: latest.onHandQuantity === 0,
              }
            : null,
        };
      }),
    });
  }

  async createDraft(input: {
    context: AuthorizedStoreContext;
    createInput: InventoryCountCreateInput;
    requestId: string;
  }): Promise<InventoryCount> {
    const { context, createInput, requestId } = input;
    const scope = buildInventoryScope(context);
    const storeId = new ObjectId(scope.storeId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: createInput.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate?.countSnapshot) {
      return inventoryCountSchema.parse(duplicate.countSnapshot);
    }
    if (!this.client) throw new Error("Client Mongo requis pour le comptage");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, {
          session,
        });
        if (repeated?.countSnapshot) {
          return inventoryCountSchema.parse(repeated.countSnapshot);
        }

        const currentDraft = await this.counts.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            businessDate: createInput.businessDate,
            status: "draft",
          },
          { session },
        );
        if (currentDraft) {
          const count = toInventoryCount(currentDraft);
          await this.commands.insertOne(
            {
              ...commandFilter,
              operation: "create",
              countId: currentDraft._id,
              countSnapshot: count,
              createdAt: new Date(),
            },
            { session },
          );
          return count;
        }

        const latest = await this.counts.findOne(
          {
            organizationId: scope.organizationId,
            storeId,
            businessDate: createInput.businessDate,
          },
          { sort: { version: -1 }, session },
        );
        const [profiles, daySnapshots] = await Promise.all([
          this.profiles
            .find(
              { organizationId: scope.organizationId, storeId },
              { session },
            )
            .toArray(),
          this.snapshots
            .find(
              {
                organizationId: scope.organizationId,
                storeId,
                businessDate: createInput.businessDate,
                active: true,
              },
              { session },
            )
            .toArray(),
        ]);
        const activeProducts = await this.products
          .find(
            {
              organizationId: scope.organizationId,
              storeId,
              active: true,
              _id: {
                $in: [
                  ...profiles.map(({ productId }) => productId),
                  ...daySnapshots.map(({ productId }) => productId),
                ],
              },
            },
            { projection: { _id: 1 }, session },
          )
          .toArray();
        const activeProductIds = new Set(
          activeProducts.map(({ _id }) => _id.toHexString()),
        );
        const linesByProduct = new Map<string, InventoryCountLineDocument>();
        for (const profile of profiles) {
          if (activeProductIds.has(profile.productId.toHexString())) {
            linesByProduct.set(
              profile.productId.toHexString(),
              lineFromProfile(profile),
            );
          }
        }
        for (const snapshot of daySnapshots) {
          if (activeProductIds.has(snapshot.productId.toHexString())) {
            linesByProduct.set(
              snapshot.productId.toHexString(),
              lineFromSnapshot(snapshot),
            );
          }
        }

        const now = new Date();
        const countId = new ObjectId();
        const document: InventoryCountDocument = {
          organizationId: scope.organizationId,
          storeId,
          businessDate: createInput.businessDate,
          version: (latest?.version ?? 0) + 1,
          revision: 0,
          status: "draft",
          lines: [...linesByProduct.values()],
          supersedesCountId: latest?._id ?? null,
          createdBy: context.userId,
          createdAt: now,
          updatedBy: context.userId,
          updatedAt: now,
          committedBy: null,
          committedAt: null,
        };
        await this.counts.insertOne({ _id: countId, ...document }, { session });
        const count = toInventoryCount({ _id: countId, ...document });
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "inventory.count.started",
            entityType: "inventoryCount",
            entityId: countId,
            before: latest
              ? { countId: latest._id, version: latest.version }
              : null,
            after: {
              countId,
              businessDate: count.businessDate,
              version: count.version,
            },
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            operation: "create",
            countId,
            countSnapshot: count,
            createdAt: now,
          },
          { session },
        );
        return count;
      });
      if (!result) throw new Error("Le brouillon n’a pas été créé");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated?.countSnapshot) {
          return inventoryCountSchema.parse(repeated.countSnapshot);
        }
        const existing = await this.counts.findOne({
          organizationId: scope.organizationId,
          storeId,
          businessDate: createInput.businessDate,
          status: "draft",
        });
        if (existing) return toInventoryCount(existing);
        throw new InventoryConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async saveDraft(input: {
    context: AuthorizedStoreContext;
    countId: string;
    updateInput: InventoryCountUpdateInput;
    requestId: string;
  }): Promise<InventoryCount> {
    const { context, updateInput, requestId } = input;
    const scope = buildInventoryScope(context);
    const storeId = new ObjectId(scope.storeId);
    if (!ObjectId.isValid(input.countId)) {
      throw new InventoryNotFoundError();
    }
    const countId = new ObjectId(input.countId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: updateInput.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate?.countSnapshot) {
      return inventoryCountSchema.parse(duplicate.countSnapshot);
    }
    if (!this.client) throw new Error("Client Mongo requis pour le comptage");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, {
          session,
        });
        if (repeated?.countSnapshot) {
          return inventoryCountSchema.parse(repeated.countSnapshot);
        }
        const current = await this.counts.findOne(
          {
            _id: countId,
            organizationId: scope.organizationId,
            storeId,
          },
          { session },
        );
        if (!current) throw new InventoryNotFoundError();
        if (current.status !== "draft") {
          throw new InventoryConflictError(
            "Un comptage validé est immuable ; créez une correction",
          );
        }
        if (current.revision !== updateInput.basedOnRevision) {
          throw new InventoryConflictError();
        }

        const productIds = updateInput.lines.map(
          ({ productId }) => new ObjectId(productId),
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
          throw new InventoryReferenceError(
            "Un article n’appartient pas au magasin autorisé",
          );
        }

        const now = new Date();
        const lines = updateInput.lines.map((line) => {
          const previous = current.lines.find(
            (value) => value.productId.toHexString() === line.productId,
          );
          const unchanged =
            previous &&
            (
              [
                "familyCode",
                "stockUnit",
                "packSize",
                "reserveCaseCount",
                "shelfQuantity",
              ] as const
            ).every((key) => previous[key] === line[key]);
          // Never trust an observation timestamp supplied through the connected editor.
          // Preserve an offline timestamp only while its values are unchanged.
          return {
            ...line,
            productId: new ObjectId(line.productId),
            observedAt: unchanged
              ? (previous.observedAt ?? null)
              : line.reserveCaseCount !== null || line.shelfQuantity !== null
                ? now.toISOString()
                : null,
          };
        });
        const revision = current.revision + 1;
        await this.counts.updateOne(
          {
            _id: countId,
            organizationId: scope.organizationId,
            storeId,
            status: "draft",
            revision: current.revision,
          },
          {
            $set: {
              lines,
              revision,
              updatedBy: context.userId,
              updatedAt: now,
            },
          },
          { session },
        );
        const saved = toInventoryCount({
          ...current,
          lines,
          revision,
          updatedBy: context.userId,
          updatedAt: now,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "inventory.count.draft_saved",
            entityType: "inventoryCount",
            entityId: countId,
            before: {
              revision: current.revision,
              lineCount: current.lines.length,
            },
            after: { revision, lineCount: lines.length },
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            operation: "save",
            countId,
            countSnapshot: saved,
            createdAt: now,
          },
          { session },
        );
        return saved;
      });
      if (!result) throw new Error("Le brouillon n’a pas été enregistré");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated?.countSnapshot) {
          return inventoryCountSchema.parse(repeated.countSnapshot);
        }
        throw new InventoryConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async commitDraft(input: {
    context: AuthorizedStoreContext;
    countId: string;
    basedOnRevision: number;
    idempotencyKey: string;
    requestId: string;
  }): Promise<InventoryCommitResult> {
    const { context, requestId } = input;
    const scope = buildInventoryScope(context);
    const storeId = new ObjectId(scope.storeId);
    if (!ObjectId.isValid(input.countId)) {
      throw new InventoryNotFoundError();
    }
    const countId = new ObjectId(input.countId);
    const commandFilter = {
      organizationId: scope.organizationId,
      storeId,
      idempotencyKey: input.idempotencyKey,
    };
    const duplicate = await this.commands.findOne(commandFilter);
    if (duplicate?.commitResult) {
      return inventoryCommitResultSchema.parse(duplicate.commitResult);
    }
    if (!this.client) throw new Error("Client Mongo requis pour le comptage");

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.commands.findOne(commandFilter, {
          session,
        });
        if (repeated?.commitResult) {
          return inventoryCommitResultSchema.parse(repeated.commitResult);
        }
        const current = await this.counts.findOne(
          {
            _id: countId,
            organizationId: scope.organizationId,
            storeId,
          },
          { session },
        );
        if (!current) throw new InventoryNotFoundError();
        if (current.status !== "draft") {
          throw new InventoryConflictError(
            "Ce comptage est déjà validé et ne peut plus être modifié",
          );
        }
        if (current.revision !== input.basedOnRevision) {
          throw new InventoryConflictError();
        }

        const publicLines = toInventoryCount(current).lines;
        const observations = prepareStockObservations(publicLines);
        const productIds = publicLines.map(
          ({ productId }) => new ObjectId(productId),
        );
        const productCount = await this.products.countDocuments(
          {
            _id: { $in: productIds },
            organizationId: scope.organizationId,
            storeId,
            active: true,
          },
          { session },
        );
        if (productCount !== productIds.length) {
          throw new InventoryReferenceError(
            "Un article n’appartient plus au magasin autorisé",
          );
        }

        const observationProductIds = observations.map(
          ({ productId }) => new ObjectId(productId),
        );
        const activeDocuments = await this.snapshots
          .find(
            {
              organizationId: scope.organizationId,
              storeId,
              businessDate: current.businessDate,
              productId: { $in: observationProductIds },
              active: true,
            },
            { session },
          )
          .toArray();
        const plan = planStockSnapshotVersions({
          observations,
          activeSnapshots: activeDocuments.map((document) => ({
            id: document._id.toHexString(),
            productId: document.productId.toHexString(),
            familyCode: document.familyCode,
            stockUnit: document.stockUnit,
            reserveCaseCount: document.reserveCaseCount,
            packSize: document.packSize,
            shelfQuantity: document.shelfQuantity,
            onHandQuantity: document.onHandQuantity,
            anomalies: document.anomalies,
            version: document.version,
          })),
        });
        const now = new Date();
        if (plan.changed.length > 0) {
          const supersededIds = plan.changed
            .map(({ supersedesSnapshotId }) => supersedesSnapshotId)
            .filter((id): id is string => id !== null)
            .map((id) => new ObjectId(id));
          if (supersededIds.length > 0) {
            await this.snapshots.updateMany(
              {
                _id: { $in: supersededIds },
                organizationId: scope.organizationId,
                storeId,
                active: true,
              },
              { $set: { active: false } },
              { session },
            );
          }
        }

        const insertedSnapshots = plan.changed.map((planned) => {
          const snapshotId = new ObjectId();
          const document: StockSnapshotDocument = {
            organizationId: scope.organizationId,
            storeId,
            productId: new ObjectId(planned.observation.productId),
            businessDate: current.businessDate,
            observedAt: new Date(
              publicLines.find(
                (line) => line.productId === planned.observation.productId,
              )?.observedAt ?? now,
            ),
            familyCode: planned.observation.familyCode,
            stockUnit: planned.observation.stockUnit,
            reserveCaseCount: planned.observation.reserveCaseCount,
            packSize: planned.observation.packSize,
            shelfQuantity: planned.observation.shelfQuantity,
            onHandQuantity: planned.observation.onHandQuantity,
            onOrderQuantity: null,
            reservedQuantity: null,
            source: "manual_count",
            anomalies: planned.observation.anomalies,
            countId,
            version: planned.version,
            active: true,
            supersedesSnapshotId: planned.supersedesSnapshotId
              ? new ObjectId(planned.supersedesSnapshotId)
              : null,
            createdBy: context.userId,
            createdAt: now,
          };
          return { _id: snapshotId, ...document };
        });
        if (insertedSnapshots.length > 0) {
          await this.snapshots.insertMany(insertedSnapshots, { session });
        }

        const configuredLines = publicLines.filter(isProfileConfigured);
        if (configuredLines.length > 0) {
          await this.profiles.bulkWrite(
            configuredLines.map((line) => ({
              updateOne: {
                filter: {
                  organizationId: scope.organizationId,
                  storeId,
                  productId: new ObjectId(line.productId),
                },
                update: {
                  $set: {
                    familyCode: line.familyCode,
                    stockUnit: line.stockUnit,
                    lastPackSize: line.packSize,
                    updatedBy: context.userId,
                    updatedAt: now,
                  },
                  $inc: { revision: 1 },
                  $setOnInsert: {
                    organizationId: scope.organizationId,
                    storeId,
                    productId: new ObjectId(line.productId),
                  },
                },
                upsert: true,
              },
            })),
            { session },
          );
        }

        const committedRevision = current.revision + 1;
        await this.counts.updateOne(
          {
            _id: countId,
            organizationId: scope.organizationId,
            storeId,
            status: "draft",
            revision: current.revision,
          },
          {
            $set: {
              status: "committed",
              revision: committedRevision,
              updatedBy: context.userId,
              updatedAt: now,
              committedBy: context.userId,
              committedAt: now,
            },
          },
          { session },
        );
        if (plan.changed.length > 0) {
          await this.stores.updateOne(
            {
              _id: storeId,
              organizationId: scope.organizationId,
              active: true,
            },
            { $inc: { dataRevision: 1 } },
            { session },
          );
        }

        const count = toInventoryCount({
          ...current,
          status: "committed",
          revision: committedRevision,
          updatedBy: context.userId,
          updatedAt: now,
          committedBy: context.userId,
          committedAt: now,
        });
        const snapshots = insertedSnapshots.map(toStockSnapshot);
        const commitResult = inventoryCommitResultSchema.parse({
          count,
          snapshots,
          changedSnapshotCount: snapshots.length,
          unchangedSnapshotCount: plan.unchangedCount,
          configuredProfileCount: configuredLines.length,
        });
        await this.auditLogs.insertOne(
          {
            organizationId: scope.organizationId,
            storeId,
            actorId: context.userId,
            action: "inventory.count.committed",
            entityType: "inventoryCount",
            entityId: countId,
            before: {
              status: current.status,
              revision: current.revision,
              supersededSnapshotIds: plan.changed
                .map(({ supersedesSnapshotId }) => supersedesSnapshotId)
                .filter((id) => id !== null),
            },
            after: {
              businessDate: current.businessDate,
              countVersion: current.version,
              revision: committedRevision,
              snapshotIds: snapshots.map(({ id }) => id),
              configuredProfileCount: configuredLines.length,
            },
            requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.commands.insertOne(
          {
            ...commandFilter,
            operation: "commit",
            countId,
            commitResult,
            createdAt: now,
          },
          { session },
        );
        return commitResult;
      });
      if (!result) throw new Error("Le comptage n’a pas été validé");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.commands.findOne(commandFilter);
        if (repeated?.commitResult) {
          return inventoryCommitResultSchema.parse(repeated.commitResult);
        }
        throw new InventoryConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
