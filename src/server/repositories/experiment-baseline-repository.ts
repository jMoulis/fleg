import "server-only";

import { Db, ObjectId } from "mongodb";

import {
  baselineSalesFactSchema,
  baselineEngineConfigSchema,
  defaultBaselineEngineConfig,
  type BaselineSalesFact,
  type BaselineEngineConfig,
} from "@/domain/experiments/baseline";
import { buildExperimentScope } from "@/domain/experiments/store-scope";
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

interface StoreSettingsDocument {
  organizationId: string;
  storeId: ObjectId;
  experiments?: {
    baseline?: Record<string, unknown>;
  };
}

export class ExperimentBaselineRepository {
  private readonly salesFacts;
  private readonly stores;
  private readonly storeSettings;

  constructor(db: Db) {
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.stores = db.collection<{
      organizationId: string;
      dataRevision: number;
      active: boolean;
    }>("stores");
    this.storeSettings =
      db.collection<StoreSettingsDocument>("storeSettings");
  }

  async findMonthlyFacts(
    context: AuthorizedStoreContext,
    periodKeys: string[],
  ): Promise<BaselineSalesFact[]> {
    if (periodKeys.length === 0) return [];
    const scope = buildExperimentScope(context);
    const facts = await this.salesFacts
      .find({
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
        periodKey: { $in: periodKeys },
      })
      .toArray();

    return facts.map((fact) =>
      baselineSalesFactSchema.parse({
        productId: fact.productId.toHexString(),
        periodKey: fact.periodKey,
        quantity: fact.quantity,
        revenueCents: fact.revenueCents,
        marginCents: fact.marginCents,
      }),
    );
  }

  async getDataRevision(context: AuthorizedStoreContext): Promise<number> {
    const scope = buildExperimentScope(context);
    const store = await this.stores.findOne(
      {
        _id: new ObjectId(scope.storeId),
        organizationId: scope.organizationId,
        active: true,
      },
      { projection: { dataRevision: 1 } },
    );
    if (!store) throw new Error("Magasin introuvable ou accès refusé");
    return store.dataRevision;
  }

  async getConfig(
    context: AuthorizedStoreContext,
  ): Promise<BaselineEngineConfig> {
    const scope = buildExperimentScope(context);
    const settings = await this.storeSettings.findOne(
      {
        organizationId: scope.organizationId,
        storeId: new ObjectId(scope.storeId),
      },
      { projection: { experiments: 1 } },
    );

    return baselineEngineConfigSchema.parse({
      ...defaultBaselineEngineConfig,
      ...(settings?.experiments?.baseline ?? {}),
    });
  }
}
