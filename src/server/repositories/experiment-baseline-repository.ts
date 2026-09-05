import "server-only";

import { Db, ObjectId } from "mongodb";

import {
  baselineSalesFactSchema,
  baselineEngineConfigSchema,
  defaultBaselineEngineConfig,
  type BaselineSalesFact,
  type BaselineEngineConfig,
} from "@/domain/experiments/baseline";
import type { ControlStoreBaselineInput } from "@/domain/experiments/control-baseline";
import { buildExperimentScope } from "@/domain/experiments/store-scope";
import { controlStoreSetMatches } from "@/domain/experiments/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
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
  private readonly products;
  private readonly storeSettings;

  constructor(db: Db) {
    this.salesFacts = db.collection<SalesFactDocument>("salesFacts");
    this.stores = db.collection<{
      organizationId: string;
      name: string;
      dataRevision: number;
      active: boolean;
    }>("stores");
    this.products = db.collection<{
      organizationId: string;
      storeId: ObjectId;
      normalizedLabel: string;
      active: boolean;
    }>("products");
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

  async findControlStoreInputs(input: {
    primaryContext: AuthorizedStoreContext;
    controlContexts: AuthorizedStoreContext[];
    primaryProductIds: string[];
    periodKeys: string[];
  }): Promise<ControlStoreBaselineInput[]> {
    if (
      !controlStoreSetMatches({
        primaryContext: input.primaryContext,
        controlContexts: input.controlContexts,
        requestedStoreIds: input.controlContexts.map(({ storeId }) => storeId),
      })
    ) {
      throw new StoreAccessDeniedError();
    }
    const primaryProducts = await this.products
      .find(
        {
          _id: {
            $in: input.primaryProductIds.map((id) => new ObjectId(id)),
          },
          organizationId: input.primaryContext.organizationId,
          storeId: new ObjectId(input.primaryContext.storeId),
          active: true,
        },
        { projection: { normalizedLabel: 1 } },
      )
      .toArray();
    if (primaryProducts.length !== input.primaryProductIds.length) {
      throw new Error("Le périmètre produit du test n’est plus disponible");
    }
    const normalizedLabels = [
      ...new Set(primaryProducts.map(({ normalizedLabel }) => normalizedLabel)),
    ];

    return Promise.all(
      input.controlContexts.map(async (context) => {
        const [store, products, facts, dataRevision] = await Promise.all([
          this.stores.findOne(
            {
              _id: new ObjectId(context.storeId),
              organizationId: context.organizationId,
              active: true,
            },
            { projection: { name: 1 } },
          ),
          this.products
            .find(
              {
                organizationId: context.organizationId,
                storeId: new ObjectId(context.storeId),
                normalizedLabel: { $in: normalizedLabels },
                active: true,
              },
              { projection: { normalizedLabel: 1 } },
            )
            .sort({ normalizedLabel: 1, _id: 1 })
            .toArray(),
          this.findMonthlyFacts(context, input.periodKeys),
          this.getDataRevision(context),
        ]);
        if (!store) throw new StoreAccessDeniedError();
        const productByLabel = new Map<string, string>();
        for (const product of products) {
          if (!productByLabel.has(product.normalizedLabel)) {
            productByLabel.set(
              product.normalizedLabel,
              product._id.toHexString(),
            );
          }
        }

        return {
          storeId: context.storeId,
          storeName: store.name,
          dataRevision,
          requestedProductCount: input.primaryProductIds.length,
          matchedProductIds: normalizedLabels
            .map((label) => productByLabel.get(label))
            .filter((id): id is string => id !== undefined),
          facts,
        };
      }),
    );
  }
}
