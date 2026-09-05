import "server-only";

import { Db, ObjectId, type WithId } from "mongodb";
import * as z from "zod";

import type { NetworkSalesFact } from "@/domain/network/calculations";
import { buildNetworkScope } from "@/domain/network/store-scope";
import { summarizeLayoutCapacity } from "@/domain/space/calculations";
import {
  layoutVersionSchema,
  type LayoutVersion,
} from "@/domain/space/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface StoreDocument {
  organizationId: string;
  code: string;
  name: string;
  active: boolean;
  dataRevision: number;
}

interface SalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

interface MarkdownFactDocument {
  organizationId: string;
  storeId: ObjectId;
  periodKey: string;
  amountCents: number;
}

interface PeriodTargetDocument {
  organizationId: string;
  storeId: ObjectId;
  periodKey: string;
  targetRevenueCents: number;
}

interface LayoutVersionDocument
  extends Omit<
    LayoutVersion,
    "id" | "storeId" | "departmentId" | "createdAt"
  > {
  storeId: ObjectId;
  departmentId: ObjectId;
  createdAt: Date;
}

interface RecommendationDocument {
  organizationId: string;
  storeId: ObjectId;
  periodKey: string;
  inputRevision: number;
  type: string;
  status: string;
}

const networkStoreRecordSchema = z.object({
  storeId: z.string().regex(/^[a-f\d]{24}$/i),
  code: z.string().min(1),
  name: z.string().min(1),
  dataRevision: z.number().int().nonnegative(),
});
export type NetworkStoreRecord = z.infer<typeof networkStoreRecordSchema>;

const periodTargetDocumentSchema = z.object({
  targetRevenueCents: z.number().int().safe().nonnegative(),
});

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

export class NetworkAnalyticsRepository {
  private readonly stores;
  private readonly salesFacts;
  private readonly markdownFacts;
  private readonly periodTargets;
  private readonly layoutVersions;
  private readonly recommendations;

  constructor(db: Db) {
    this.stores = db.collection<StoreDocument>("stores");
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.markdownFacts =
      db.collection<MarkdownFactDocument>("markdownFacts");
    this.periodTargets =
      db.collection<PeriodTargetDocument>("periodTargets");
    this.layoutVersions =
      db.collection<LayoutVersionDocument>("layoutVersions");
    this.recommendations =
      db.collection<RecommendationDocument>("recommendations");
  }

  async findLatestPeriod(
    contexts: AuthorizedStoreContext[],
  ): Promise<string | null> {
    const scope = buildNetworkScope(contexts);
    const fact = await this.salesFacts.findOne(
      {
        organizationId: scope.organizationId,
        storeId: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
      },
      { sort: { periodKey: -1 }, projection: { periodKey: 1 } },
    );

    return fact?.periodKey ?? null;
  }

  async findStores(
    contexts: AuthorizedStoreContext[],
  ): Promise<NetworkStoreRecord[]> {
    const scope = buildNetworkScope(contexts);
    const documents = await this.stores
      .find({
        _id: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
        organizationId: scope.organizationId,
        active: true,
      })
      .toArray();

    if (documents.length !== scope.storeIds.length) {
      throw new Error("Un magasin du périmètre réseau n’est plus disponible");
    }

    return documents.map((document) =>
      networkStoreRecordSchema.parse({
        storeId: document._id.toHexString(),
        code: document.code,
        name: document.name,
        dataRevision: document.dataRevision,
      }),
    );
  }

  async findFacts(
    contexts: AuthorizedStoreContext[],
    periodKeys: string[],
  ): Promise<NetworkSalesFact[]> {
    const scope = buildNetworkScope(contexts);
    const documents = await this.salesFacts
      .find({
        organizationId: scope.organizationId,
        storeId: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
        periodKey: { $in: periodKeys },
      })
      .toArray();

    return documents.map((document) => ({
      storeId: document.storeId.toHexString(),
      productId: document.productId.toHexString(),
      periodKey: document.periodKey,
      quantity: document.quantity,
      revenueCents: document.revenueCents,
      marginCents: document.marginCents,
    }));
  }

  async findMarkdownByStore(
    contexts: AuthorizedStoreContext[],
    periodKey: string,
  ): Promise<Map<string, number>> {
    const scope = buildNetworkScope(contexts);
    const documents = await this.markdownFacts
      .find(
        {
          organizationId: scope.organizationId,
          storeId: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
          periodKey,
        },
        { projection: { storeId: 1, amountCents: 1 } },
      )
      .toArray();
    const totals = new Map<string, number>();

    for (const document of documents) {
      const storeId = document.storeId.toHexString();
      totals.set(storeId, (totals.get(storeId) ?? 0) + document.amountCents);
    }

    return totals;
  }

  async findTargetsByStore(
    contexts: AuthorizedStoreContext[],
    periodKey: string,
  ): Promise<Map<string, number>> {
    const scope = buildNetworkScope(contexts);
    const documents = await this.periodTargets
      .find(
        {
          organizationId: scope.organizationId,
          storeId: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
          periodKey,
        },
        { projection: { storeId: 1, targetRevenueCents: 1 } },
      )
      .toArray();

    return new Map(
      documents.map((document) => [
        document.storeId.toHexString(),
        periodTargetDocumentSchema.parse(document).targetRevenueCents,
      ]),
    );
  }

  async findLayoutCapacityByStore(
    contexts: AuthorizedStoreContext[],
  ): Promise<
    Map<
      string,
      { effectiveCommercialWidthM: number; geometryConfirmed: boolean }
    >
  > {
    const scope = buildNetworkScope(contexts);
    const documents = await this.layoutVersions
      .find({
        organizationId: scope.organizationId,
        storeId: { $in: scope.storeIds.map((id) => new ObjectId(id)) },
        departmentKey: "fruit_vegetable",
      })
      .sort({ version: -1, createdAt: -1 })
      .toArray();
    const capacities = new Map<
      string,
      { effectiveCommercialWidthM: number; geometryConfirmed: boolean }
    >();

    for (const document of documents) {
      const storeId = document.storeId.toHexString();
      if (capacities.has(storeId)) continue;
      const layout = toLayoutVersion(document);
      capacities.set(storeId, {
        effectiveCommercialWidthM:
          summarizeLayoutCapacity(layout).effectiveCommercialWidthM,
        geometryConfirmed: layout.geometryConfirmed,
      });
    }

    return capacities;
  }

  async findPrioritizedActionCountByStore(
    contexts: AuthorizedStoreContext[],
    periodKey: string,
    stores: NetworkStoreRecord[],
  ): Promise<Map<string, number>> {
    const scope = buildNetworkScope(contexts);
    const revisionByStoreId = new Map(
      stores.map((store) => [store.storeId, store.dataRevision]),
    );
    const documents = await this.recommendations
      .find(
        {
          organizationId: scope.organizationId,
          periodKey,
          status: "draft",
          type: { $ne: "HOLD" },
          $or: stores.map((store) => ({
            storeId: new ObjectId(store.storeId),
            inputRevision: store.dataRevision,
          })),
        },
        { projection: { storeId: 1, inputRevision: 1 } },
      )
      .toArray();
    const counts = new Map<string, number>();

    for (const document of documents) {
      const storeId = document.storeId.toHexString();
      if (document.inputRevision !== revisionByStoreId.get(storeId)) continue;
      counts.set(storeId, (counts.get(storeId) ?? 0) + 1);
    }

    return counts;
  }
}
