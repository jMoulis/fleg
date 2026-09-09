import {
  calculateWeeklySalesView,
  type GranularDailyFactValue,
} from "@/domain/analytics/granular-sales";
import {
  type TrueXyzClass,
  type TrueXyzConfigSnapshot,
  type TrueXyzProductResult,
  type TrueXyzWarning,
} from "@/domain/analytics/true-xyz-schemas";

interface XyzProduct {
  id: string;
  label: string;
}

function populationStandardDeviation(values: number[], mean: number): number {
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function classifyCoefficient(
  coefficientOfVariation: number,
  config: TrueXyzConfigSnapshot,
): TrueXyzClass {
  if (coefficientOfVariation <= config.xMaxCoefficientOfVariation) return "X";
  if (coefficientOfVariation <= config.yMaxCoefficientOfVariation) return "Y";
  return "Z";
}

function calculateProductXyz(input: {
  product: XyzProduct;
  facts: GranularDailyFactValue[];
  from: string;
  to: string;
  config: TrueXyzConfigSnapshot;
}): TrueXyzProductResult {
  const weekly = calculateWeeklySalesView({
    from: input.from,
    to: input.to,
    facts: input.facts,
  });
  const weeks = weekly.weeks.map((week) => ({
    isoWeekKey: week.isoWeekKey,
    startsOn: week.startsOn,
    endsOn: week.endsOn,
    observedDates: week.coverage.observedDates,
    missingDates: week.coverage.missingDates,
    coverageStatus: week.coverage.status,
    observedQuantity: week.totals.quantity,
    correctedFactCount: week.correctedFactCount,
    includedInCalculation:
      week.coverage.status === "complete" && week.totals.quantity >= 0,
  }));
  const completeWeeks = weeks.filter(
    ({ coverageStatus }) => coverageStatus === "complete",
  );
  const incompleteWeekCount = weeks.length - completeWeeks.length;
  const hasNegativeWeeklyDemand = completeWeeks.some(
    ({ observedQuantity }) => observedQuantity < 0,
  );
  const correctedFactCount = weeks.reduce(
    (sum, week) => sum + week.correctedFactCount,
    0,
  );
  const warnings: TrueXyzWarning[] = [];

  if (input.facts.length === 0) {
    warnings.push({
      code: "NO_DAILY_OBSERVATIONS",
      message: "Aucune demande journalière n’est observée pour cet article sur la fenêtre.",
    });
  }
  if (incompleteWeekCount > 0) {
    warnings.push({
      code: "INCOMPLETE_WEEKS_EXCLUDED",
      message: `${incompleteWeekCount} semaine(s) incomplète(s) sont exclues sans compléter les jours manquants par zéro.`,
    });
  }
  if (completeWeeks.length < input.config.minimumCompleteWeeks) {
    warnings.push({
      code: "INSUFFICIENT_COMPLETE_WEEKS",
      message: `${completeWeeks.length} semaine(s) complète(s) disponible(s), ${input.config.minimumCompleteWeeks} requise(s).`,
    });
  }
  if (hasNegativeWeeklyDemand) {
    warnings.push({
      code: "NEGATIVE_WEEKLY_DEMAND",
      message: "Une semaine complète présente une demande nette négative non résolue.",
    });
  }
  if (correctedFactCount > 0) {
    warnings.push({
      code: "CORRECTED_FACTS",
      message: `${correctedFactCount} fait(s) journalier(s) actif(s) proviennent d’une correction versionnée.`,
    });
  }

  let meanWeeklyQuantity: number | null = null;
  let populationDeviation: number | null = null;
  let coefficientOfVariation: number | null = null;
  if (completeWeeks.length > 0 && !hasNegativeWeeklyDemand) {
    const quantities = completeWeeks.map(({ observedQuantity }) => observedQuantity);
    meanWeeklyQuantity =
      quantities.reduce((sum, quantity) => sum + quantity, 0) /
      quantities.length;
    if (meanWeeklyQuantity <= 0) {
      warnings.push({
        code: "NON_POSITIVE_MEAN_DEMAND",
        message: "La demande hebdomadaire moyenne est nulle ou négative.",
      });
    } else {
      populationDeviation = populationStandardDeviation(
        quantities,
        meanWeeklyQuantity,
      );
      coefficientOfVariation = populationDeviation / meanWeeklyQuantity;
      if (meanWeeklyQuantity < input.config.minimumMeanWeeklyQuantity) {
        warnings.push({
          code: "SMALL_MEAN_DEMAND",
          message: `La moyenne hebdomadaire (${meanWeeklyQuantity.toFixed(3)}) reste sous le minimum configurable (${input.config.minimumMeanWeeklyQuantity}).`,
        });
      }
    }
  }

  const eligible =
    completeWeeks.length >= input.config.minimumCompleteWeeks &&
    !hasNegativeWeeklyDemand &&
    meanWeeklyQuantity !== null &&
    meanWeeklyQuantity >= input.config.minimumMeanWeeklyQuantity &&
    coefficientOfVariation !== null;
  const xyzClass = eligible && coefficientOfVariation !== null
    ? classifyCoefficient(coefficientOfVariation, input.config)
    : null;

  return {
    productId: input.product.id,
    label: input.product.label,
    status: xyzClass ? "classified" : "unclassified",
    xyzClass,
    meanWeeklyQuantity,
    populationStandardDeviation: populationDeviation,
    coefficientOfVariation,
    completeWeekCount: completeWeeks.length,
    requiredCompleteWeekCount: input.config.minimumCompleteWeeks,
    candidateWeekCount: weeks.length,
    weeks,
    warnings,
  };
}

export function calculateTrueXyz(input: {
  products: XyzProduct[];
  facts: GranularDailyFactValue[];
  from: string;
  to: string;
  config: TrueXyzConfigSnapshot;
}): TrueXyzProductResult[] {
  const factsByProduct = new Map<string, GranularDailyFactValue[]>();
  for (const fact of input.facts) {
    const current = factsByProduct.get(fact.productId) ?? [];
    current.push(fact);
    factsByProduct.set(fact.productId, current);
  }

  return input.products.map((product) =>
    calculateProductXyz({
      product,
      facts: factsByProduct.get(product.id) ?? [],
      from: input.from,
      to: input.to,
      config: input.config,
    }),
  );
}
