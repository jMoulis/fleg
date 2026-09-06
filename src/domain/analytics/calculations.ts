import {
  dashboardMetricsSchema,
  productMetricSchema,
  type AnalyticsConfig,
  type DashboardMetrics,
  type ProductMetric,
} from "@/domain/analytics/schemas";

export interface SalesFactValue {
  productId: string;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export function shiftMonth(periodKey: string, offset: number): string {
  const [year, month] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function safeRatio(
  numerator: number,
  denominator: number,
): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function calculateDashboard(input: {
  periodKey: string;
  facts: SalesFactValue[];
  priorYearFacts: SalesFactValue[];
  targetRevenueCents?: number | null;
  dataRevision: number;
  config: AnalyticsConfig;
}): DashboardMetrics | null {
  const {
    periodKey,
    facts,
    priorYearFacts,
    targetRevenueCents = null,
    dataRevision,
    config,
  } = input;

  if (facts.length === 0) {
    return null;
  }

  const totals = facts.reduce(
    (result, fact) => ({
      revenueCents: result.revenueCents + fact.revenueCents,
      marginCents: result.marginCents + fact.marginCents,
      quantity: result.quantity + fact.quantity,
    }),
    { revenueCents: 0, marginCents: 0, quantity: 0 },
  );
  const priorYearRevenueCents =
    priorYearFacts.length > 0
      ? priorYearFacts.reduce((sum, fact) => sum + fact.revenueCents, 0)
      : null;

  return dashboardMetricsSchema.parse({
    periodKey,
    ...totals,
    marginRatio: safeRatio(totals.marginCents, totals.revenueCents),
    productCount: new Set(facts.map((fact) => fact.productId)).size,
    priorYearRevenueCents,
    yearOverYearRatio:
      priorYearRevenueCents === null
        ? null
        : safeRatio(totals.revenueCents - priorYearRevenueCents, priorYearRevenueCents),
    targetRevenueCents,
    targetAttainmentRatio:
      targetRevenueCents === null
        ? null
        : safeRatio(totals.revenueCents, targetRevenueCents),
    dataRevision,
    calculationVersion: config.calculationVersion,
  });
}

interface ProductHistory {
  current: SalesFactValue;
  previousMonth?: SalesFactValue;
  priorYear?: SalesFactValue;
  priorYearPreviousMonth?: SalesFactValue;
}

function classifyConfidence(history: ProductHistory, config: AnalyticsConfig) {
  const hasSeasonalityPair =
    history.priorYear !== undefined && history.priorYearPreviousMonth !== undefined;
  const stableBase =
    (history.priorYearPreviousMonth?.revenueCents ?? 0) >=
    config.minimumSeasonalityBaseRevenueCents;

  if (hasSeasonalityPair && stableBase && history.previousMonth) {
    return "high" as const;
  }

  if (history.priorYear || history.previousMonth) {
    return "medium" as const;
  }

  return "low" as const;
}

function buildMetric(input: {
  label: string;
  history: ProductHistory;
  config: AnalyticsConfig;
}): Omit<ProductMetric, "abcClass" | "cumulativeRevenueShare"> {
  const { label, history, config } = input;
  const rawSeasonalityIndex = history.priorYearPreviousMonth
    ? safeRatio(
        history.priorYear?.revenueCents ?? 0,
        history.priorYearPreviousMonth.revenueCents,
      )
    : null;
  const seasonalityReliable =
    rawSeasonalityIndex !== null &&
    (history.priorYearPreviousMonth?.revenueCents ?? 0) >=
      config.minimumSeasonalityBaseRevenueCents;
  const retainedSeasonalityIndex = seasonalityReliable
    ? Math.min(
        config.retainedSeasonalityCeiling,
        Math.max(config.retainedSeasonalityFloor, rawSeasonalityIndex),
      )
    : 1;
  const forecastRevenueCents = history.previousMonth
    ? Math.round(
        history.previousMonth.revenueCents * retainedSeasonalityIndex,
      )
    : null;
  const evidence = [
    `CA observé ${history.current.periodKey}: ${history.current.revenueCents} centimes`,
  ];

  if (!seasonalityReliable) {
    evidence.push("Saisonnalité neutralisée : historique ou base insuffisante");
  } else {
    evidence.push(
      `Indice saisonnier brut ${rawSeasonalityIndex?.toFixed(3)}, retenu ${retainedSeasonalityIndex.toFixed(3)}`,
    );
  }

  return {
    productId: history.current.productId,
    label,
    periodKey: history.current.periodKey,
    quantity: history.current.quantity,
    revenueCents: history.current.revenueCents,
    marginCents: history.current.marginCents,
    marginRatio: safeRatio(
      history.current.marginCents,
      history.current.revenueCents,
    ),
    priorYearRevenueCents: history.priorYear?.revenueCents ?? null,
    yearOverYearRatio: history.priorYear
      ? safeRatio(
          history.current.revenueCents - history.priorYear.revenueCents,
          history.priorYear.revenueCents,
        )
      : null,
    rawSeasonalityIndex,
    retainedSeasonalityIndex,
    forecastRevenueCents,
    confidence: classifyConfidence(history, config),
    evidence,
  };
}

export function calculateProductMetrics(input: {
  periodKey: string;
  facts: SalesFactValue[];
  labelsByProductId: Map<string, string>;
  config: AnalyticsConfig;
}): ProductMetric[] {
  const { periodKey, facts, labelsByProductId, config } = input;
  const currentPeriod = periodKey;
  const previousMonth = shiftMonth(periodKey, -1);
  const priorYear = shiftMonth(periodKey, -12);
  const priorYearPreviousMonth = shiftMonth(periodKey, -13);
  const byProductAndPeriod = new Map(
    facts.map((fact) => [`${fact.productId}:${fact.periodKey}`, fact]),
  );
  const currentFacts = facts
    .filter((fact) => fact.periodKey === currentPeriod)
    .sort((a, b) => b.revenueCents - a.revenueCents);
  const totalRevenueCents = currentFacts.reduce(
    (sum, fact) => sum + fact.revenueCents,
    0,
  );
  let cumulativeRevenueCents = 0;

  return currentFacts.map((current) => {
    cumulativeRevenueCents += current.revenueCents;
    const cumulativeRevenueShare =
      totalRevenueCents === 0 ? 0 : cumulativeRevenueCents / totalRevenueCents;
    const abcClass =
      cumulativeRevenueShare <= config.abcAThreshold
        ? "A"
        : cumulativeRevenueShare <= config.abcBThreshold
          ? "B"
          : "C";
    const metric = buildMetric({
      label: labelsByProductId.get(current.productId) ?? "Produit sans libellé",
      history: {
        current,
        previousMonth: byProductAndPeriod.get(
          `${current.productId}:${previousMonth}`,
        ),
        priorYear: byProductAndPeriod.get(`${current.productId}:${priorYear}`),
        priorYearPreviousMonth: byProductAndPeriod.get(
          `${current.productId}:${priorYearPreviousMonth}`,
        ),
      },
      config,
    });

    return productMetricSchema.parse({
      ...metric,
      abcClass,
      cumulativeRevenueShare,
    });
  });
}
