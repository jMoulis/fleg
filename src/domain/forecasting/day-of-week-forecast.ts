import {
  assessDailyCoverage,
  type GranularDailyFactValue,
} from "@/domain/analytics/granular-sales";
import type {
  DayOfWeekForecastConfigSnapshot,
  DayOfWeekForecastProduct,
  DayOfWeekForecastWarning,
  ForecastWeekday,
} from "@/domain/forecasting/day-of-week-forecast-schemas";
import {
  enumerateBusinessDates,
  shiftBusinessDate,
} from "@/domain/imports/daily-dates";

interface ForecastProduct {
  id: string;
  label: string;
}

const weekdays: Array<{
  weekday: ForecastWeekday;
  isoWeekday: number;
}> = [
  { weekday: "monday", isoWeekday: 1 },
  { weekday: "tuesday", isoWeekday: 2 },
  { weekday: "wednesday", isoWeekday: 3 },
  { weekday: "thursday", isoWeekday: 4 },
  { weekday: "friday", isoWeekday: 5 },
  { weekday: "saturday", isoWeekday: 6 },
  { weekday: "sunday", isoWeekday: 7 },
];

function isoWeekdayFromBusinessDate(businessDate: string): number {
  const day = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function daysBetween(from: string, to: string): number {
  return (
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
    86_400_000
  );
}

function weightedMean(input: {
  facts: GranularDailyFactValue[];
  isoWeekday: number;
  referenceDate: string;
  minimumObservations: number;
  recencyDecay: number;
  blocked: boolean;
}) {
  const observations = input.facts.filter(
    (fact) => isoWeekdayFromBusinessDate(fact.businessDate) === input.isoWeekday,
  );
  if (
    input.blocked ||
    observations.length < input.minimumObservations
  ) {
    return {
      observationCount: observations.length,
      weightedMeanQuantity: null,
    };
  }

  let weightedQuantity = 0;
  let weightTotal = 0;
  for (const observation of observations) {
    const ageWeeks = Math.max(
      0,
      daysBetween(observation.businessDate, input.referenceDate) / 7,
    );
    const weight = input.recencyDecay ** ageWeeks;
    weightedQuantity += observation.quantity * weight;
    weightTotal += weight;
  }

  return {
    observationCount: observations.length,
    weightedMeanQuantity: weightedQuantity / weightTotal,
  };
}

function buildWeekdayModels(input: {
  facts: GranularDailyFactValue[];
  referenceDate: string;
  config: DayOfWeekForecastConfigSnapshot;
  blocked: boolean;
}) {
  return weekdays.map(({ weekday, isoWeekday }) => ({
    weekday,
    isoWeekday,
    ...weightedMean({
      facts: input.facts,
      isoWeekday,
      referenceDate: input.referenceDate,
      minimumObservations: input.config.minimumObservationsPerWeekday,
      recencyDecay: input.config.recencyDecay,
      blocked: input.blocked,
    }),
  }));
}

function calculateBacktestMetrics(
  points: Array<{
    actualQuantity: number;
    predictedQuantity: number | null;
  }>,
) {
  const eligible = points.filter(
    (point): point is { actualQuantity: number; predictedQuantity: number } =>
      point.predictedQuantity !== null,
  );
  if (eligible.length === 0) {
    return {
      eligibleObservationCount: 0,
      meanAbsoluteError: null,
      rootMeanSquaredError: null,
      meanError: null,
      weightedAbsolutePercentageError: null,
    };
  }

  const errors = eligible.map(
    ({ actualQuantity, predictedQuantity }) =>
      predictedQuantity - actualQuantity,
  );
  const absoluteErrors = errors.map(Math.abs);
  const actualTotal = eligible.reduce(
    (sum, { actualQuantity }) => sum + actualQuantity,
    0,
  );

  return {
    eligibleObservationCount: eligible.length,
    meanAbsoluteError:
      absoluteErrors.reduce((sum, error) => sum + error, 0) /
      eligible.length,
    rootMeanSquaredError: Math.sqrt(
      errors.reduce((sum, error) => sum + error ** 2, 0) /
        eligible.length,
    ),
    meanError:
      errors.reduce((sum, error) => sum + error, 0) / eligible.length,
    weightedAbsolutePercentageError:
      actualTotal === 0
        ? null
        : absoluteErrors.reduce((sum, error) => sum + error, 0) /
          actualTotal,
  };
}

function confidenceFor(input: {
  status: DayOfWeekForecastProduct["status"];
  negativeDemand: boolean;
  trainingCoverageStatus: "complete" | "partial" | "unknown";
  backtestCoverageStatus: "complete" | "partial" | "unknown";
  backtestEligibleCount: number;
  wape: number | null;
  config: DayOfWeekForecastConfigSnapshot;
}): DayOfWeekForecastProduct["confidence"] {
  if (
    input.negativeDemand ||
    input.status !== "forecastable" ||
    input.backtestEligibleCount < input.config.minimumBacktestObservations ||
    input.wape === null
  ) {
    return "low";
  }

  if (
    input.trainingCoverageStatus === "complete" &&
    input.backtestCoverageStatus === "complete" &&
    input.wape <= input.config.highConfidenceMaxWape
  ) {
    return "high";
  }

  return input.wape <= input.config.mediumConfidenceMaxWape
    ? "medium"
    : "low";
}

function calculateProductForecast(input: {
  product: ForecastProduct;
  facts: GranularDailyFactValue[];
  trainingFrom: string;
  asOf: string;
  backtestFrom: string;
  fitTo: string;
  forecastDates: string[];
  config: DayOfWeekForecastConfigSnapshot;
}): DayOfWeekForecastProduct {
  const facts = input.facts
    .filter(
      ({ businessDate }) =>
        businessDate >= input.trainingFrom && businessDate <= input.asOf,
    )
    .sort((left, right) => left.businessDate.localeCompare(right.businessDate));
  const trainingCoverage = assessDailyCoverage({
    from: input.trainingFrom,
    to: input.asOf,
    observedDates: facts.map(({ businessDate }) => businessDate),
  });
  const fitFacts = facts.filter(
    ({ businessDate }) => businessDate < input.backtestFrom,
  );
  const backtestFacts = facts.filter(
    ({ businessDate }) => businessDate >= input.backtestFrom,
  );
  const backtestCoverage = assessDailyCoverage({
    from: input.backtestFrom,
    to: input.asOf,
    observedDates: backtestFacts.map(({ businessDate }) => businessDate),
  });
  const negativeDemand = facts.some(({ quantity }) => quantity < 0);
  const correctedFactCount = facts.filter(({ version }) => version > 1).length;
  const weekdayModels = buildWeekdayModels({
    facts,
    referenceDate: input.asOf,
    config: input.config,
    blocked: negativeDemand,
  });
  const modelByWeekday = new Map(
    weekdayModels.map((model) => [model.isoWeekday, model]),
  );
  const forecastDays = input.forecastDates.map((businessDate) => {
    const isoWeekday = isoWeekdayFromBusinessDate(businessDate);
    const model = modelByWeekday.get(isoWeekday)!;
    return {
      businessDate,
      weekday: model.weekday,
      isoWeekday,
      predictedQuantity: model.weightedMeanQuantity,
      observationCount: model.observationCount,
    };
  });
  const predictedDayCount = forecastDays.filter(
    ({ predictedQuantity }) => predictedQuantity !== null,
  ).length;
  const status =
    predictedDayCount === forecastDays.length
      ? ("forecastable" as const)
      : predictedDayCount > 0
        ? ("partial" as const)
        : ("unavailable" as const);

  const backtestModels = buildWeekdayModels({
    facts: fitFacts,
    referenceDate: input.fitTo,
    config: input.config,
    blocked: negativeDemand,
  });
  const backtestModelByWeekday = new Map(
    backtestModels.map((model) => [model.isoWeekday, model]),
  );
  const backtestPoints = backtestFacts.map((fact) => {
    const isoWeekday = isoWeekdayFromBusinessDate(fact.businessDate);
    const model = backtestModelByWeekday.get(isoWeekday)!;
    const predictedQuantity = model.weightedMeanQuantity;
    const error =
      predictedQuantity === null ? null : predictedQuantity - fact.quantity;
    return {
      businessDate: fact.businessDate,
      weekday: model.weekday,
      isoWeekday,
      actualQuantity: fact.quantity,
      predictedQuantity,
      error,
      absoluteError: error === null ? null : Math.abs(error),
    };
  });
  const backtestMetrics = calculateBacktestMetrics(backtestPoints);
  const warnings: DayOfWeekForecastWarning[] = [];

  if (facts.length === 0) {
    warnings.push({
      code: "NO_DAILY_OBSERVATIONS",
      message: "Aucune demande journalière n’est observée pour cet article sur la fenêtre.",
    });
  }
  if (trainingCoverage.status !== "complete") {
    warnings.push({
      code: "INCOMPLETE_TRAINING_COVERAGE",
      message: `${trainingCoverage.missingDates.length} jour(s) d’apprentissage restent inconnus et ne sont pas assimilés à zéro.`,
    });
  }
  const unavailableWeekdayCount = weekdayModels.filter(
    ({ weightedMeanQuantity }) => weightedMeanQuantity === null,
  ).length;
  if (unavailableWeekdayCount > 0 && !negativeDemand) {
    warnings.push({
      code: "INSUFFICIENT_WEEKDAY_HISTORY",
      message: `${unavailableWeekdayCount} jour(s) de semaine n’atteignent pas le minimum de ${input.config.minimumObservationsPerWeekday} observations.`,
    });
  }
  if (backtestCoverage.status !== "complete") {
    warnings.push({
      code: "INCOMPLETE_BACKTEST_COVERAGE",
      message: `${backtestCoverage.missingDates.length} jour(s) du backtest restent inconnus.`,
    });
  }
  if (
    backtestMetrics.eligibleObservationCount <
    input.config.minimumBacktestObservations
  ) {
    warnings.push({
      code: "INSUFFICIENT_BACKTEST",
      message: `${backtestMetrics.eligibleObservationCount} point(s) de backtest exploitable(s), ${input.config.minimumBacktestObservations} requis.`,
    });
  }
  if (
    backtestMetrics.eligibleObservationCount >=
      input.config.minimumBacktestObservations &&
    backtestMetrics.weightedAbsolutePercentageError === null
  ) {
    warnings.push({
      code: "ZERO_BACKTEST_DEMAND",
      message: "La demande réelle du backtest est nulle ; le WAPE ne peut pas être calculé.",
    });
  }
  if (negativeDemand) {
    warnings.push({
      code: "NEGATIVE_DEMAND",
      message: "Une demande journalière négative non résolue bloque cette prévision.",
    });
  }
  if (correctedFactCount > 0) {
    warnings.push({
      code: "CORRECTED_FACTS",
      message: `${correctedFactCount} fait(s) actif(s) proviennent d’une correction versionnée.`,
    });
  }
  if (predictedDayCount < forecastDays.length) {
    warnings.push({
      code: "UNAVAILABLE_FORECAST_DAYS",
      message: `${forecastDays.length - predictedDayCount} jour(s) de l’horizon restent sans prévision.`,
    });
  }

  return {
    productId: input.product.id,
    label: input.product.label,
    status,
    confidence: confidenceFor({
      status,
      negativeDemand,
      trainingCoverageStatus: trainingCoverage.status,
      backtestCoverageStatus: backtestCoverage.status,
      backtestEligibleCount: backtestMetrics.eligibleObservationCount,
      wape: backtestMetrics.weightedAbsolutePercentageError,
      config: input.config,
    }),
    trainingCoverage,
    trainingObservationCount: facts.length,
    correctedFactCount,
    weekdayModels,
    forecastDays,
    forecastTotalQuantity:
      status === "forecastable"
        ? forecastDays.reduce(
            (sum, day) => sum + (day.predictedQuantity ?? 0),
            0,
          )
        : null,
    predictedDayCount,
    backtest: {
      method: "fixed_holdout",
      fitFrom: input.trainingFrom,
      fitTo: input.fitTo,
      from: input.backtestFrom,
      to: input.asOf,
      coverage: backtestCoverage,
      requiredObservationCount: input.config.minimumBacktestObservations,
      ...backtestMetrics,
      points: backtestPoints,
    },
    warnings,
  };
}

export function calculateDayOfWeekForecast(input: {
  products: ForecastProduct[];
  facts: GranularDailyFactValue[];
  asOf: string;
  horizonDays: number;
  config: DayOfWeekForecastConfigSnapshot;
}) {
  const trainingFrom = shiftBusinessDate(
    input.asOf,
    -(input.config.windowWeeks * 7 - 1),
  );
  const backtestFrom = shiftBusinessDate(
    input.asOf,
    -(input.config.backtestWeeks * 7 - 1),
  );
  const fitTo = shiftBusinessDate(backtestFrom, -1);
  const forecastDates = enumerateBusinessDates(
    shiftBusinessDate(input.asOf, 1),
    shiftBusinessDate(input.asOf, input.horizonDays),
  );
  const factsByProduct = new Map<string, GranularDailyFactValue[]>();
  for (const fact of input.facts) {
    const current = factsByProduct.get(fact.productId) ?? [];
    current.push(fact);
    factsByProduct.set(fact.productId, current);
  }

  return {
    trainingWindow: { from: trainingFrom, to: input.asOf },
    forecastWindow: {
      from: forecastDates[0]!,
      to: forecastDates.at(-1)!,
    },
    products: input.products.map((product) =>
      calculateProductForecast({
        product,
        facts: factsByProduct.get(product.id) ?? [],
        trainingFrom,
        asOf: input.asOf,
        backtestFrom,
        fitTo,
        forecastDates,
        config: input.config,
      }),
    ),
  };
}
