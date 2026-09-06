import "server-only";

import {
  type Db,
  type MongoClient,
  MongoServerError,
  ObjectId,
  type WithId,
} from "mongodb";

import referenceLayoutSource from "../../../schemas/reference-layout.json";
import {
  storeAdminSummarySchema,
  storeMembershipAdminSchema,
  type StoreAdminSummary,
  type StoreCreateInput,
  type StoreMembershipAdmin,
  type StoreMembershipWriteInput,
  type StoreUpdateInput,
} from "@/domain/admin/schemas";
import { buildReferenceLayoutVersion } from "@/domain/space/reference-seed";

interface StoreDocument {
  organizationId: string;
  code: string;
  name: string;
  active: boolean;
  dataRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StoreMembershipDocument {
  organizationId: string;
  storeId: ObjectId;
  userId: string;
  role: StoreMembershipAdmin["role"];
  permissions: StoreMembershipAdmin["permissions"];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StoreAdminCommandDocument {
  organizationId: string;
  idempotencyKey: string;
  action: "create" | "update";
  storeId: ObjectId;
  snapshot: StoreAdminSummary;
  createdAt: Date;
}

interface StoreMembershipCommandDocument {
  organizationId: string;
  idempotencyKey: string;
  storeId: ObjectId;
  userId: string;
  snapshot: StoreMembershipAdmin;
  createdAt: Date;
}

export class StoreAdminConflictError extends Error {
  readonly code = "STORE_ADMIN_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "StoreAdminConflictError";
  }
}

export class StoreAdminReferenceError extends Error {
  readonly code = "STORE_ADMIN_REFERENCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "StoreAdminReferenceError";
  }
}

function toStoreSummary(document: WithId<StoreDocument>): StoreAdminSummary {
  return storeAdminSummarySchema.parse({
    ...document,
    id: document._id.toHexString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  });
}

function toMembership(
  document: StoreMembershipDocument,
): StoreMembershipAdmin {
  return storeMembershipAdminSchema.parse({
    ...document,
    storeId: document.storeId.toHexString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  });
}

export class StoreAdminRepository {
  private readonly stores;
  private readonly departments;
  private readonly layoutVersions;
  private readonly memberships;
  private readonly storeCommands;
  private readonly membershipCommands;
  private readonly auditLogs;

  constructor(
    db: Db,
    private readonly client: MongoClient,
  ) {
    this.stores = db.collection<StoreDocument>("stores");
    this.departments = db.collection("departments");
    this.layoutVersions = db.collection("layoutVersions");
    this.memberships =
      db.collection<StoreMembershipDocument>("storeMemberships");
    this.storeCommands =
      db.collection<StoreAdminCommandDocument>("storeAdminCommands");
    this.membershipCommands =
      db.collection<StoreMembershipCommandDocument>(
        "storeMembershipCommands",
      );
    this.auditLogs = db.collection("auditLogs");
  }

  async listStores(organizationId: string): Promise<StoreAdminSummary[]> {
    const stores = await this.stores
      .find({ organizationId })
      .sort({ active: -1, name: 1 })
      .toArray();

    return stores.map(toStoreSummary);
  }

  async findStore(storeId: string): Promise<StoreAdminSummary | null> {
    if (!ObjectId.isValid(storeId)) return null;
    const store = await this.stores.findOne({ _id: new ObjectId(storeId) });
    return store ? toStoreSummary(store) : null;
  }

  async createStore(input: {
    actorUserId: string;
    createInput: StoreCreateInput;
    requestId: string;
  }): Promise<StoreAdminSummary> {
    const duplicate = await this.storeCommands.findOne({
      organizationId: input.createInput.organizationId,
      idempotencyKey: input.createInput.idempotencyKey,
    });
    if (duplicate) return storeAdminSummarySchema.parse(duplicate.snapshot);

    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const repeated = await this.storeCommands.findOne(
          {
            organizationId: input.createInput.organizationId,
            idempotencyKey: input.createInput.idempotencyKey,
          },
          { session },
        );
        if (repeated) return storeAdminSummarySchema.parse(repeated.snapshot);

        const now = new Date();
        const storeId = new ObjectId();
        const departmentId = new ObjectId();
        const layoutId = new ObjectId();
        const layout = buildReferenceLayoutVersion({
          source: referenceLayoutSource,
          id: layoutId.toHexString(),
          organizationId: input.createInput.organizationId,
          storeId: storeId.toHexString(),
          departmentId: departmentId.toHexString(),
          createdBy: input.actorUserId,
          createdAt: now.toISOString(),
        });
        const snapshot = storeAdminSummarySchema.parse({
          id: storeId.toHexString(),
          organizationId: input.createInput.organizationId,
          code: input.createInput.code,
          name: input.createInput.name,
          active: true,
          dataRevision: 0,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
        const { id: ignoredLayoutId, ...layoutValues } = layout.layout;
        void ignoredLayoutId;

        await this.stores.insertOne(
          {
            _id: storeId,
            organizationId: snapshot.organizationId,
            code: snapshot.code,
            name: snapshot.name,
            active: true,
            dataRevision: 0,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        await this.departments.insertOne(
          {
            _id: departmentId,
            organizationId: snapshot.organizationId,
            storeId,
            key: "fruit_vegetable",
            name: "Fruits et légumes",
            active: true,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        await this.layoutVersions.insertOne(
          {
            _id: layoutId,
            ...layoutValues,
            storeId,
            departmentId,
            seedKey: layout.seedKey,
            createdAt: now,
          },
          { session },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: snapshot.organizationId,
            storeId,
            actorId: input.actorUserId,
            action: "store.created",
            entityType: "store",
            entityId: storeId,
            before: null,
            after: {
              store: snapshot,
              departmentId: departmentId.toHexString(),
              layoutId: layoutId.toHexString(),
            },
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.storeCommands.insertOne(
          {
            organizationId: snapshot.organizationId,
            idempotencyKey: input.createInput.idempotencyKey,
            action: "create",
            storeId,
            snapshot,
            createdAt: now,
          },
          { session },
        );

        return snapshot;
      });

      if (!result) throw new Error("Le magasin n'a pas été créé");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.storeCommands.findOne({
          organizationId: input.createInput.organizationId,
          idempotencyKey: input.createInput.idempotencyKey,
        });
        if (repeated) return storeAdminSummarySchema.parse(repeated.snapshot);
        throw new StoreAdminConflictError(
          "Ce code magasin est déjà utilisé dans l’organisation",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateStore(input: {
    actorUserId: string;
    organizationId: string;
    storeId: string;
    updateInput: StoreUpdateInput;
    requestId: string;
  }): Promise<StoreAdminSummary> {
    const duplicate = await this.storeCommands.findOne({
      organizationId: input.organizationId,
      idempotencyKey: input.updateInput.idempotencyKey,
    });
    if (duplicate) return storeAdminSummarySchema.parse(duplicate.snapshot);

    const storeId = new ObjectId(input.storeId);
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const current = await this.stores.findOne(
          { _id: storeId, organizationId: input.organizationId },
          { session },
        );
        if (!current) {
          throw new StoreAdminReferenceError(
            "Magasin introuvable ou accès refusé",
          );
        }
        if (
          current.updatedAt.toISOString() !== input.updateInput.basedOnUpdatedAt
        ) {
          throw new StoreAdminConflictError(
            "Le magasin a été modifié depuis l’ouverture de la page",
          );
        }

        const now = new Date();
        const updated = await this.stores.findOneAndUpdate(
          { _id: storeId, organizationId: input.organizationId },
          {
            $set: {
              code: input.updateInput.code,
              name: input.updateInput.name,
              active: input.updateInput.active,
              updatedAt: now,
            },
          },
          { session, returnDocument: "after" },
        );
        if (!updated) throw new Error("Le magasin n'a pas été mis à jour");
        const snapshot = toStoreSummary(updated);

        await this.auditLogs.insertOne(
          {
            organizationId: input.organizationId,
            storeId,
            actorId: input.actorUserId,
            action: "store.updated",
            entityType: "store",
            entityId: storeId,
            before: toStoreSummary(current),
            after: snapshot,
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.storeCommands.insertOne(
          {
            organizationId: input.organizationId,
            idempotencyKey: input.updateInput.idempotencyKey,
            action: "update",
            storeId,
            snapshot,
            createdAt: now,
          },
          { session },
        );
        return snapshot;
      });

      if (!result) throw new Error("Le magasin n'a pas été mis à jour");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.storeCommands.findOne({
          organizationId: input.organizationId,
          idempotencyKey: input.updateInput.idempotencyKey,
        });
        if (repeated) return storeAdminSummarySchema.parse(repeated.snapshot);
        throw new StoreAdminConflictError(
          "Ce code magasin est déjà utilisé dans l’organisation",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listMemberships(
    organizationId: string,
  ): Promise<StoreMembershipAdmin[]> {
    const memberships = await this.memberships
      .find({ organizationId })
      .sort({ storeId: 1, userId: 1 })
      .toArray();
    return memberships.map(toMembership);
  }

  async writeMembership(input: {
    actorUserId: string;
    organizationId: string;
    storeId: string;
    writeInput: StoreMembershipWriteInput;
    requestId: string;
  }): Promise<StoreMembershipAdmin> {
    const duplicate = await this.membershipCommands.findOne({
      organizationId: input.organizationId,
      idempotencyKey: input.writeInput.idempotencyKey,
    });
    if (duplicate) return storeMembershipAdminSchema.parse(duplicate.snapshot);

    const storeId = new ObjectId(input.storeId);
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const store = await this.stores.findOne(
          { _id: storeId, organizationId: input.organizationId },
          { session, projection: { _id: 1, active: 1 } },
        );
        const current = await this.memberships.findOne(
          {
            organizationId: input.organizationId,
            storeId,
            userId: input.writeInput.userId,
          },
          { session },
        );
        if (!store) {
          throw new StoreAdminReferenceError(
            "Magasin introuvable ou accès refusé",
          );
        }
        if (!store.active && input.writeInput.active) {
          throw new StoreAdminConflictError(
            "Réactivez le magasin avant d’attribuer un accès",
          );
        }
        if (!current && !input.writeInput.active) {
          throw new StoreAdminReferenceError("Cet accès magasin n’existe pas");
        }

        const now = new Date();
        const createdAt = current?.createdAt ?? now;
        const membership = storeMembershipAdminSchema.parse({
          storeId: input.storeId,
          userId: input.writeInput.userId,
          role: input.writeInput.role,
          permissions: input.writeInput.permissions,
          active: input.writeInput.active,
          createdAt: createdAt.toISOString(),
          updatedAt: now.toISOString(),
        });
        await this.memberships.updateOne(
          {
            organizationId: input.organizationId,
            storeId,
            userId: input.writeInput.userId,
          },
          {
            $set: {
              role: membership.role,
              permissions: membership.permissions,
              active: membership.active,
              updatedAt: now,
            },
            $setOnInsert: {
              organizationId: input.organizationId,
              storeId,
              userId: membership.userId,
              createdAt,
            },
          },
          { session, upsert: true },
        );
        await this.auditLogs.insertOne(
          {
            organizationId: input.organizationId,
            storeId,
            actorId: input.actorUserId,
            action: current
              ? membership.active
                ? "store_membership.updated"
                : "store_membership.deactivated"
              : "store_membership.created",
            entityType: "storeMembership",
            entityId: `${input.storeId}:${membership.userId}`,
            before: current ? toMembership(current) : null,
            after: membership,
            requestId: input.requestId,
            timestamp: now,
            createdAt: now,
          },
          { session },
        );
        await this.membershipCommands.insertOne(
          {
            organizationId: input.organizationId,
            idempotencyKey: input.writeInput.idempotencyKey,
            storeId,
            userId: membership.userId,
            snapshot: membership,
            createdAt: now,
          },
          { session },
        );
        return membership;
      });

      if (!result) throw new Error("L’accès magasin n'a pas été enregistré");
      return result;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const repeated = await this.membershipCommands.findOne({
          organizationId: input.organizationId,
          idempotencyKey: input.writeInput.idempotencyKey,
        });
        if (repeated) {
          return storeMembershipAdminSchema.parse(repeated.snapshot);
        }
        throw new StoreAdminConflictError(
          "Cet accès a été modifié simultanément",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
