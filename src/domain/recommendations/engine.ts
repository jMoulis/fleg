import { safeRatio } from "@/domain/analytics/calculations";
import type { ProductMetric } from "@/domain/analytics/schemas";
import {
  recommendationDraftSchema,
  type RecommendationConfig,
  type RecommendationDraft,
  type RecommendationType,
} from "@/domain/recommendations/schemas";

export function buildRecommendation(input: {
  organizationId: string;
  storeId: string;
  metric: ProductMetric;
  config: RecommendationConfig;
  calculationVersion: string;
  inputRevision: number;
  generatedAt: string;
}): RecommendationDraft {
  const {
    organizationId,
    storeId,
    metric,
    config,
    calculationVersion,
    inputRevision,
    generatedAt,
  } = input;
  const forecastGrowthRatio =
    metric.forecastRevenueCents === null
      ? null
      : safeRatio(
          metric.forecastRevenueCents - metric.revenueCents,
          metric.revenueCents,
        );
  const hasActionBase = metric.revenueCents >= config.minimumActionRevenueCents;
  let type: RecommendationType = "HOLD";

  if (
    hasActionBase &&
    metric.marginRatio !== null &&
    metric.marginRatio < config.marginWatchRatio &&
    metric.abcClass === "A"
  ) {
    type = "TRAFFIC_PROTECT";
  } else if (
    hasActionBase &&
    metric.marginRatio !== null &&
    metric.marginRatio < config.marginWatchRatio
  ) {
    type = "MARGIN_WATCH";
  } else if (
    metric.confidence !== "low" &&
    forecastGrowthRatio !== null &&
    forecastGrowthRatio >= config.pushForecastGrowthRatio
  ) {
    type = "PUSH";
  } else if (
    metric.confidence !== "low" &&
    forecastGrowthRatio !== null &&
    forecastGrowthRatio <= config.reduceForecastDeclineRatio
  ) {
    type = "REDUCE";
  }

  return recommendationDraftSchema.parse({
    organizationId,
    storeId,
    periodKey: metric.periodKey,
    productId: metric.productId,
    productLabel: metric.label,
    type,
    status: "draft",
    confidence: metric.confidence,
    expectedRevenueEffectCents:
      metric.forecastRevenueCents === null
        ? null
        : metric.forecastRevenueCents - metric.revenueCents,
    evidence: [
      {
        signal: "economic_weight",
        label: `Classe ABC ${metric.abcClass}`,
        value: metric.cumulativeRevenueShare,
        interpretation: "Poids économique cumulé dans le rayon.",
      },
      {
        signal: "margin_quality",
        label: "Taux de marge observé",
        value: metric.marginRatio,
        interpretation:
          metric.marginRatio === null
            ? "Chiffre d’affaires nul, taux non calculable."
            : `Seuil de vigilance configurable : ${config.marginWatchRatio}.`,
      },
      {
        signal: "seasonal_momentum",
        label: "Écart prévisionnel",
        value: forecastGrowthRatio,
        interpretation:
          forecastGrowthRatio === null
            ? "Prévision indisponible."
            : "Écart entre la prévision déterministe et le CA observé.",
      },
      {
        signal: "year_over_year",
        label: "Évolution annuelle",
        value: metric.yearOverYearRatio,
        interpretation: "Comparaison avec la même période de l’année précédente.",
      },
      {
        signal: "history_quality",
        label: `Confiance ${metric.confidence}`,
        value: null,
        interpretation: metric.evidence.join(" · "),
      },
    ],
    inputs: metric,
    modelVersion: config.modelVersion,
    calculationVersion,
    inputRevision,
    generatedAt,
  });
}
