import "server-only";

import {
  allocationProductSchema,
  type AllocationBasis,
  type AllocationPlanCreateInput,
  type AllocationProduct,
} from "@/domain/space/allocation-schemas";
import {
  buildAllocationLimitations,
  flattenLayoutCapacity,
  summarizeAllocationEconomics,
} from "@/domain/space/allocations";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { AllocationRepository } from "@/server/repositories/allocation-repository";
import { MarkdownRepository } from "@/server/repositories/markdown-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { ProductSpacePolicyRepository } from "@/server/repositories/product-space-policy-repository";
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
          markdownCents: null,
        }),
      ),
      basis: {
        periodKey: null,
        calculationVersion: null,
        dataRevision: null,
        settingsRevision: 0,
        policyRevision: 0,
      },
    };
  }

  const metrics = await getProductMetrics(context, dashboard.periodKey);
  const markdownFacts = await new MarkdownRepository(db).findForPeriods({
    context,
    periodKeys: [metrics.periodKey],
    productIds: options.map((product) => product.id),
  });
  const markdownByProductId = new Map<string, number>();
  for (const fact of markdownFacts) {
    markdownByProductId.set(
      fact.productId,
      (markdownByProductId.get(fact.productId) ?? 0) + fact.amountCents,
    );
  }
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
        markdownCents: markdownByProductId.get(product.id) ?? null,
      });
    }),
    basis: {
      periodKey: metrics.periodKey,
      calculationVersion: metrics.calculationVersion,
      dataRevision: metrics.dataRevision,
      settingsRevision: 0,
      policyRevision: 0,
    },
  };
}

function buildAllocationEvidence(source: "manager" | "heuristic"): string[] {
  if (source === "manager") {
    return [
      "Répartition saisie ou ajustée manuellement par le manager.",
      "Les contraintes produit et la couverture de démarque sont figées avec ce brouillon.",
    ];
  }

  return [
    "Calcul déterministe classé sur la marge prévisionnelle après démarque connue.",
    "Les lignes verrouillées et les lignes de produits obligatoires déjà placées sont conservées.",
    "Les nouveaux produits obligatoires sont placés en priorité sur un mobilier compatible.",
  ];
}

export async function getAllocationWorkspace(
  context: AuthorizedStoreContext,
) {
  const db = await getAppDb();
  const [{ layout }, productWorkspace, settings, policySet] = await Promise.all([
    getCurrentStoreLayout(context),
    getAllocationProducts(context),
    new StoreConfigurationRepository(db).getSettings(context),
    new ProductSpacePolicyRepository(db).getForStore(context),
  ]);
  const basis = {
    ...productWorkspace.basis,
    settingsRevision: settings.revision,
    policyRevision: policySet.revision,
  };
  const economics = summarizeAllocationEconomics({
    products: productWorkspace.products,
    config: settings.space.allocation,
    periodKey: productWorkspace.basis.periodKey,
  });

  if (!layout) {
    return {
      layout: null,
      plan: null,
      capacities: [],
      ...productWorkspace,
      defaultConfig: settings.space.allocation,
      policySet,
      basis,
      economics,
      limitations: buildAllocationLimitations({
        products: productWorkspace.products,
        policies: policySet.policies,
      }),
    };
  }

  const repository = new AllocationRepository(db);
  const plan = await repository.getLatestForLayout(context, layout.id);

  return {
    layout,
    plan,
    capacities: flattenLayoutCapacity(layout),
    ...productWorkspace,
    defaultConfig: settings.space.allocation,
    policySet,
    basis,
    economics,
    limitations: buildAllocationLimitations({
      products: productWorkspace.products,
      policies: policySet.policies,
    }),
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
  const [productWorkspace, settings, policySet] = await Promise.all([
    getAllocationProducts(input.context),
    new StoreConfigurationRepository(db).getSettings(input.context),
    new ProductSpacePolicyRepository(db).getForStore(input.context),
  ]);
  const createInput = {
    ...input.createInput,
    modelVersion:
      input.createInput.source === "heuristic"
        ? ("space-allocation-heuristic-v2" as const)
        : ("manual-allocation-v1" as const),
    basis: {
      ...productWorkspace.basis,
      settingsRevision: settings.revision,
      policyRevision: policySet.revision,
    },
    evidence: buildAllocationEvidence(input.createInput.source),
    limitations: buildAllocationLimitations({
      products: productWorkspace.products,
      policies: policySet.policies,
    }),
    constraintSnapshot: {
      policyRevision: policySet.revision,
      policies: policySet.policies,
    },
    economics: summarizeAllocationEconomics({
      products: productWorkspace.products,
      config: input.createInput.config,
      periodKey: productWorkspace.basis.periodKey,
    }),
  } satisfies AllocationPlanCreateInput;

  return new AllocationRepository(db, client).createNextPlan({
    ...input,
    createInput,
  });
}
