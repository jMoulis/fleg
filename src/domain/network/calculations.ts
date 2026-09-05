import { safeRatio, shiftMonth } from "@/domain/analytics/calculations";
import {
  networkDashboardSchema,
  type NetworkDashboard,
} from "@/domain/network/schemas";

export interface NetworkSalesFact {
  storeId: string;
  productId: string;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export interface NetworkStoreInput {
  storeId: string;
  code: string;
  name: string;
  dataRevision: number;
  markdownCents: number | null;
  targetRevenueCents: number | null;
  effectiveCommercialWidthM: number | null;
  geometryConfirmed: boolean;
  prioritizedActionCount: number;
}

function roundedQuantity(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundedCentsPerMeter(cents: number, meters: number): number {
  return Math.round(cents / meters);
}

export function calculateNetworkDashboard(input: {
  organizationId: string;
  periodKey: string;
  stores: NetworkStoreInput[];
  facts: NetworkSalesFact[];
  calculationVersion?: string;
}): NetworkDashboard | null {
  const selectedStoreIds = new Set(input.stores.map(({ storeId }) => storeId));
  const hasCurrentFacts = input.facts.some(
    (fact) =>
      selectedStoreIds.has(fact.storeId) && fact.periodKey === input.periodKey,
  );
  if (!hasCurrentFacts) return null;

  const priorYearPeriod = shiftMonth(input.periodKey, -12);
  const stores = input.stores.map((store) => {
    const currentFacts = input.facts.filter(
      (fact) =>
        fact.storeId === store.storeId && fact.periodKey === input.periodKey,
    );
    const priorYearFacts = input.facts.filter(
      (fact) =>
        fact.storeId === store.storeId && fact.periodKey === priorYearPeriod,
    );
    const dataAvailable = currentFacts.length > 0;
    const revenueCents = dataAvailable
      ? currentFacts.reduce((sum, fact) => sum + fact.revenueCents, 0)
      : null;
    const marginCents = dataAvailable
      ? currentFacts.reduce((sum, fact) => sum + fact.marginCents, 0)
      : null;
    const quantity = dataAvailable
      ? roundedQuantity(
          currentFacts.reduce((sum, fact) => sum + fact.quantity, 0),
        )
      : null;
    const priorYearRevenueCents =
      priorYearFacts.length > 0
        ? priorYearFacts.reduce((sum, fact) => sum + fact.revenueCents, 0)
        : null;
    const yearOverYearRatio =
      revenueCents === null || priorYearRevenueCents === null
        ? null
        : safeRatio(
            revenueCents - priorYearRevenueCents,
            priorYearRevenueCents,
          );
    const markdownCents = dataAvailable ? store.markdownCents : null;
    const postMarkdownMarginCents =
      marginCents === null || markdownCents === null
        ? null
        : marginCents - markdownCents;
    const effectiveCommercialWidthM =
      store.geometryConfirmed &&
      store.effectiveCommercialWidthM !== null &&
      store.effectiveCommercialWidthM > 0
        ? store.effectiveCommercialWidthM
        : null;

    return {
      storeId: store.storeId,
      code: store.code,
      name: store.name,
      dataRevision: store.dataRevision,
      dataAvailable,
      revenueCents,
      marginCents,
      marginRatio:
        revenueCents === null || marginCents === null
          ? null
          : safeRatio(marginCents, revenueCents),
      quantity,
      priorYearRevenueCents,
      yearOverYearRatio,
      markdownCents,
      markdownRate:
        revenueCents === null || markdownCents === null
          ? null
          : safeRatio(markdownCents, revenueCents),
      postMarkdownMarginCents,
      targetRevenueCents: dataAvailable ? store.targetRevenueCents : null,
      targetAttainmentRatio:
        revenueCents === null || store.targetRevenueCents === null
          ? null
          : safeRatio(revenueCents, store.targetRevenueCents),
      effectiveCommercialWidthM,
      geometryConfirmed: store.geometryConfirmed,
      revenuePerEffectiveMeterCents:
        revenueCents === null || effectiveCommercialWidthM === null
          ? null
          : roundedCentsPerMeter(revenueCents, effectiveCommercialWidthM),
      postMarkdownMarginPerEffectiveMeterCents:
        postMarkdownMarginCents === null || effectiveCommercialWidthM === null
          ? null
          : roundedCentsPerMeter(
              postMarkdownMarginCents,
              effectiveCommercialWidthM,
            ),
      normalizedRank: null as number | null,
      prioritizedActionCount: store.prioritizedActionCount,
    };
  });

  const ranked = stores
    .filter(
      (store) => store.revenuePerEffectiveMeterCents !== null,
    )
    .sort(
      (left, right) =>
        (right.revenuePerEffectiveMeterCents ?? 0) -
          (left.revenuePerEffectiveMeterCents ?? 0) ||
        left.name.localeCompare(right.name, "fr"),
    );
  ranked.forEach((store, index) => {
    store.normalizedRank = index + 1;
  });
  const orderedStores = [...stores].sort((left, right) => {
    if (left.normalizedRank !== null && right.normalizedRank !== null) {
      return left.normalizedRank - right.normalizedRank;
    }
    if (left.normalizedRank !== null) return -1;
    if (right.normalizedRank !== null) return 1;
    return left.name.localeCompare(right.name, "fr");
  });
  const dataStores = stores.filter(({ dataAvailable }) => dataAvailable);
  const revenueCents = dataStores.reduce(
    (sum, store) => sum + (store.revenueCents ?? 0),
    0,
  );
  const marginCents = dataStores.reduce(
    (sum, store) => sum + (store.marginCents ?? 0),
    0,
  );
  const quantity = roundedQuantity(
    dataStores.reduce((sum, store) => sum + (store.quantity ?? 0), 0),
  );
  const priorYearCoverageStoreCount = dataStores.filter(
    ({ priorYearRevenueCents }) => priorYearRevenueCents !== null,
  ).length;
  const priorYearRevenueCents =
    dataStores.length > 0 && priorYearCoverageStoreCount === dataStores.length
      ? dataStores.reduce(
          (sum, store) => sum + (store.priorYearRevenueCents ?? 0),
          0,
        )
      : null;
  const markdownCoverageStoreCount = dataStores.filter(
    ({ markdownCents }) => markdownCents !== null,
  ).length;
  const markdownCents =
    dataStores.length > 0 && markdownCoverageStoreCount === dataStores.length
      ? dataStores.reduce(
          (sum, store) => sum + (store.markdownCents ?? 0),
          0,
        )
      : null;
  const targetCoverageStoreCount = dataStores.filter(
    ({ targetRevenueCents }) => targetRevenueCents !== null,
  ).length;
  const targetRevenueCents =
    dataStores.length > 0 && targetCoverageStoreCount === dataStores.length
      ? dataStores.reduce(
          (sum, store) => sum + (store.targetRevenueCents ?? 0),
          0,
        )
      : null;
  const eligibleStoreCount = ranked.length;
  const warnings: Array<{
    code:
      | "SINGLE_STORE"
      | "NORMALIZATION_COVERAGE_PARTIAL"
      | "MARKDOWN_COVERAGE_PARTIAL"
      | "TARGET_COVERAGE_PARTIAL"
      | "PRIOR_YEAR_COVERAGE_PARTIAL";
    message: string;
  }> = [];
  if (input.stores.length === 1) {
    warnings.push({
      code: "SINGLE_STORE",
      message:
        "Un seul magasin est sélectionné : les totaux sont disponibles, mais la comparaison réseau nécessite au moins deux magasins.",
    });
  }
  if (eligibleStoreCount < dataStores.length) {
    warnings.push({
      code: "NORMALIZATION_COVERAGE_PARTIAL",
      message:
        "Le classement exclut les magasins dont les dimensions commerciales ne sont pas confirmées.",
    });
  }
  if (markdownCoverageStoreCount < dataStores.length) {
    warnings.push({
      code: "MARKDOWN_COVERAGE_PARTIAL",
      message:
        "La démarque réseau reste indisponible tant que chaque magasin avec des ventes n’a pas de couverture sur la période.",
    });
  }
  if (targetCoverageStoreCount < dataStores.length) {
    warnings.push({
      code: "TARGET_COVERAGE_PARTIAL",
      message:
        "L’atteinte d’objectif réseau reste indisponible tant que chaque magasin avec des ventes n’a pas d’objectif.",
    });
  }
  if (priorYearCoverageStoreCount < dataStores.length) {
    warnings.push({
      code: "PRIOR_YEAR_COVERAGE_PARTIAL",
      message:
        "L’évolution réseau N-1 reste indisponible tant que chaque magasin n’a pas de période comparable.",
    });
  }

  return networkDashboardSchema.parse({
    organizationId: input.organizationId,
    periodKey: input.periodKey,
    calculationVersion: input.calculationVersion ?? "network-analytics-v1",
    storeCount: input.stores.length,
    storesWithData: dataStores.length,
    revenueCents,
    marginCents,
    marginRatio: safeRatio(marginCents, revenueCents),
    quantity,
    priorYearRevenueCents,
    yearOverYearRatio:
      priorYearRevenueCents === null
        ? null
        : safeRatio(revenueCents - priorYearRevenueCents, priorYearRevenueCents),
    priorYearCoverageStoreCount,
    markdownCents,
    markdownRate:
      markdownCents === null ? null : safeRatio(markdownCents, revenueCents),
    markdownCoverageStoreCount,
    postMarkdownMarginCents:
      markdownCents === null ? null : marginCents - markdownCents,
    targetRevenueCents,
    targetAttainmentRatio:
      targetRevenueCents === null ? null : safeRatio(revenueCents, targetRevenueCents),
    targetCoverageStoreCount,
    normalization: {
      basis: "effective_commercial_meter",
      eligibleStoreCount,
      rawRevenueFallbackUsed: false,
    },
    stores: orderedStores,
    warnings,
  });
}
