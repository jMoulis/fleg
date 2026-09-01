import "server-only";

import { Db, ObjectId } from "mongodb";

import type { SalesFactValue } from "@/domain/analytics/calculations";
import {
  analyticsConfigSchema,
  defaultAnalyticsConfig,
  type AnalyticsConfig,
} from "@/domain/analytics/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

interface SalesFactDocument {
  organizationId: string;
  storeId: ObjectId;
  productId: ObjectId;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export class AnalyticsRepository {
  private readonly salesFacts;
  private readonly products;
  private readonly stores;
  private readonly storeSettings;

  constructor(db: Db) {
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.products = db.collection<{ label: string }>("products");
    this.stores = db.collection<{ dataRevision: number }>("stores");
    this.storeSettings = db.collection<{ analytics?: Record<string, unknown> }>(
      "storeSettings",
    );
  }

  async findLatestPeriod(
    context: AuthorizedStoreContext,
  ): Promise<string | null> {
    const fact = await this.salesFacts.findOne(
      {
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      },
      { sort: { periodKey: -1 }, projection: { periodKey: 1 } },
    );

    return fact?.periodKey ?? null;
  }

  async findFacts(
    context: AuthorizedStoreContext,
    periodKeys: string[],
  ): Promise<SalesFactValue[]> {
    const facts = await this.salesFacts
      .find({
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
        periodKey: { $in: periodKeys },
      })
      .toArray();

    return facts.map((fact) => ({
      productId: fact.productId.toHexString(),
      periodKey: fact.periodKey,
      quantity: fact.quantity,
      revenueCents: fact.revenueCents,
      marginCents: fact.marginCents,
    }));
  }

  async findProductLabels(
    context: AuthorizedStoreContext,
    productIds: string[],
  ): Promise<Map<string, string>> {
    const products = await this.products
      .find(
        {
          _id: { $in: productIds.map((id) => new ObjectId(id)) },
          organizationId: context.organizationId,
          storeId: new ObjectId(context.storeId),
        },
        { projection: { label: 1 } },
      )
      .toArray();

    return new Map(
      products.map((product) => [product._id.toHexString(), product.label]),
    );
  }

  async getDataRevision(context: AuthorizedStoreContext): Promise<number> {
    const store = await this.stores.findOne(
      {
        _id: new ObjectId(context.storeId),
        organizationId: context.organizationId,
        active: true,
      },
      { projection: { dataRevision: 1 } },
    );

    if (!store) {
      throw new Error("Magasin introuvable ou accès refusé");
    }

    return store.dataRevision;
  }

  async getConfig(context: AuthorizedStoreContext): Promise<AnalyticsConfig> {
    const settings = await this.storeSettings.findOne(
      {
        organizationId: context.organizationId,
        storeId: new ObjectId(context.storeId),
      },
      { projection: { analytics: 1 } },
    );

    return analyticsConfigSchema.parse({
      ...defaultAnalyticsConfig,
      ...(settings?.analytics ?? {}),
    });
  }
}
