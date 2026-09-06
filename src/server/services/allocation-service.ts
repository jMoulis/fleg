import "server-only";

import {
  allocationProductSchema,
  type AllocationBasis,
  type AllocationPlanCreateInput,
  type AllocationProduct,
} from "@/domain/space/allocation-schemas";
import { flattenLayoutCapacity } from "@/domain/space/allocations";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { AllocationRepository } from "@/server/repositories/allocation-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";
import {
  getDashboardMetrics,
  getProductMetrics,
} from "@/server/services/analytics-service";
import { getCurrentStoreLayout } from "@/server/services/layout-service";

async function getAllocationProducts(
  context: AuthorizedStoreContext,
): Promise<{ products: AllocationProduct[]; basis: AllocationBasis }> {
  const db = await getAppDb();
  const [options, dashboard] = await Promise.all([
    new ProductRepository(db).listOptions(context),
    getDashboardMetrics(context),
  ]);

  if (!dashboard) {
    return {
      products: options.map((product) =>
        allocationProductSchema.parse({
          ...product,
          revenueCents: null,
          marginCents: null,
          marginRatio: null,
          forecastRevenueCents: null,
          abcClass: null,
          confidence: null,
        }),
      ),
      basis: {
        periodKey: null,
        calculationVersion: null,
        dataRevision: null,
      },
    };
  }

  const metrics = await getProductMetrics(context, dashboard.periodKey);
  const metricByProductId = new Map(
    metrics.products.map((metric) => [metric.productId, metric]),
  );

  return {
    products: options.map((product) => {
      const metric = metricByProductId.get(product.id);
      return allocationProductSchema.parse({
        id: product.id,
        label: product.label,
        revenueCents: metric?.revenueCents ?? null,
        marginCents: metric?.marginCents ?? null,
        marginRatio: metric?.marginRatio ?? null,
        forecastRevenueCents: metric?.forecastRevenueCents ?? null,
        abcClass: metric?.abcClass ?? null,
        confidence: metric?.confidence ?? null,
      });
    }),
    basis: {
      periodKey: metrics.periodKey,
      calculationVersion: metrics.calculationVersion,
      dataRevision: metrics.dataRevision,
    },
  };
}

export async function getAllocationWorkspace(
  context: AuthorizedStoreContext,
) {
  const db = await getAppDb();
  const [{ layout }, productWorkspace, settings] = await Promise.all([
    getCurrentStoreLayout(context),
    getAllocationProducts(context),
    new StoreConfigurationRepository(db).getSettings(context),
  ]);

  if (!layout) {
    return {
      layout: null,
      plan: null,
      capacities: [],
      defaultConfig: settings.space.allocation,
      ...productWorkspace,
    };
  }

  const repository = new AllocationRepository(db);
  const plan = await repository.getLatestForLayout(context, layout.id);

  return {
    layout,
    plan,
    capacities: flattenLayoutCapacity(layout),
    defaultConfig: settings.space.allocation,
    ...productWorkspace,
  };
}

export async function getCurrentAllocationPlan(input: {
  context: AuthorizedStoreContext;
  layoutVersionId: string;
}) {
  return new AllocationRepository(await getAppDb()).getLatestForLayout(
    input.context,
    input.layoutVersionId,
  );
}

export async function createStoreAllocationPlan(input: {
  context: AuthorizedStoreContext;
  createInput: AllocationPlanCreateInput;
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new AllocationRepository(db, client).createNextPlan(input);
}
