import "server-only";

import { Db, ObjectId, type WithId } from "mongodb";
import { z } from "zod";

import type {
  StoreIdentity,
  StoreMembershipIdentity,
} from "@/domain/stores/authorization";
import type {
  StorePermission,
  StoreRole,
  AuthorizedStoreContext,
} from "@/domain/stores/schemas";

export interface StoreListItem {
  id: string;
  organizationId: string;
  code: string;
  name: string;
}

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
  role: Exclude<StoreRole, "organization_admin">;
  permissions: StorePermission[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toStoreListItem(store: WithId<StoreDocument>): StoreListItem {
  return {
    id: store._id.toHexString(),
    organizationId: store.organizationId,
    code: store.code,
    name: store.name,
  };
}

export class StoreRepository {
  private readonly stores;
  private readonly memberships;

  constructor(db: Db) {
    this.stores = db.collection<StoreDocument>("stores");
    this.memberships = db.collection<StoreMembershipDocument>("storeMemberships");
  }

  async getOfflineReferenceMetadata(context: AuthorizedStoreContext) {
    const store = await this.stores.findOne({
      _id: new ObjectId(context.storeId),
      organizationId: context.organizationId,
      active: true,
    }, { projection: { name: 1, dataRevision: 1 } });
    if (!store) return null;
    return z.object({ name: z.string().min(1), dataRevision: z.number().int().nonnegative().default(0) }).parse(store);
  }

  async findIdentityById(storeId: string): Promise<StoreIdentity | null> {
    const store = await this.stores.findOne(
      { _id: new ObjectId(storeId) },
      { projection: { organizationId: 1, active: 1 } },
    );

    if (!store) {
      return null;
    }

    return {
      id: store._id.toHexString(),
      organizationId: store.organizationId,
      active: store.active,
    };
  }

  async findMembership(
    store: StoreIdentity,
    userId: string,
  ): Promise<StoreMembershipIdentity | null> {
    const membership = await this.memberships.findOne({
      organizationId: store.organizationId,
      storeId: new ObjectId(store.id),
      userId,
      active: true,
    });

    if (!membership) {
      return null;
    }

    return {
      organizationId: membership.organizationId,
      storeId: membership.storeId.toHexString(),
      userId: membership.userId,
      role: membership.role,
      permissions: membership.permissions,
      active: membership.active,
    };
  }

  async listForOrganization(organizationId: string): Promise<StoreListItem[]> {
    const stores = await this.stores
      .find({ organizationId, active: true })
      .sort({ name: 1 })
      .toArray();

    return stores.map(toStoreListItem);
  }

  async listForUser(userId: string): Promise<StoreListItem[]> {
    const memberships = await this.memberships
      .find({ userId, active: true })
      .project<{ storeId: ObjectId; organizationId: string }>({
        storeId: 1,
        organizationId: 1,
      })
      .toArray();

    if (memberships.length === 0) {
      return [];
    }

    const stores = await this.stores
      .find({
        $or: memberships.map(({ storeId, organizationId }) => ({
          _id: storeId,
          organizationId,
          active: true,
        })),
      })
      .sort({ name: 1 })
      .toArray();

    return stores.map(toStoreListItem);
  }
}
