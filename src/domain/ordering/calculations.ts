import type { DayOfWeekForecastProduct } from "@/domain/forecasting/day-of-week-forecast-schemas";
import { shiftBusinessDate } from "@/domain/imports/daily-dates";
import type { StockSnapshot } from "@/domain/inventory/schemas";
import {
  orderCycleSchema,
  orderScheduleVersion,
  orderSuggestionLineSchema,
  type OrderCycle,
  type OrderSuggestionLine,
  type OrderWeekday,
} from "@/domain/ordering/schemas";
import type { ProductOption } from "@/domain/products/schemas";

const weekdays: OrderWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function roundedQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function calculateOrderCycle(orderDate: string): OrderCycle {
  const weekdayIndex = new Date(`${orderDate}T00:00:00.000Z`).getUTCDay();
  const orderWeekday = weekdays[weekdayIndex]!;
  const base = {
    orderDate,
    orderWeekday,
    scheduleVersion: orderScheduleVersion,
  };

  if (orderWeekday === "sunday") {
    return orderCycleSchema.parse({
      ...base,
      orderingAllowed: false,
      deliveryDate: null,
      coverageDates: [],
      explanation:
        "Le dimanche n’est pas un jour de commande ; la commande du samedi couvre la livraison du lundi.",
    });
  }

  if (orderWeekday === "friday") {
    const saturday = shiftBusinessDate(orderDate, 1);
    return orderCycleSchema.parse({
      ...base,
      orderingAllowed: true,
      deliveryDate: saturday,
      coverageDates: [saturday, shiftBusinessDate(orderDate, 2)],
      explanation:
        "La commande du vendredi est livrée samedi et couvre les ventes du samedi et du dimanche.",
    });
  }

  if (orderWeekday === "saturday") {
    const monday = shiftBusinessDate(orderDate, 2);
    return orderCycleSchema.parse({
      ...base,
      orderingAllowed: true,
      deliveryDate: monday,
      coverageDates: [monday],
      explanation:
        "La commande du samedi est livrée lundi ; aucune livraison n’a lieu le dimanche.",
    });
  }

  const nextDay = shiftBusinessDate(orderDate, 1);
  return orderCycleSchema.parse({
    ...base,
    orderingAllowed: true,
    deliveryDate: nextDay,
    coverageDates: [nextDay],
    explanation: "La commande est livrée le lendemain et couvre cette journée.",
  });
}

export function calculatePackOrder(input: {
  coveredDemandQuantity: number;
  morningOnHandQuantity: number;
  packSize: number;
  targetClosingStockRatio: number;
}) {
  const targetClosingStockQuantity = roundedQuantity(
    input.coveredDemandQuantity * input.targetClosingStockRatio,
  );
  const netNeedQuantity = roundedQuantity(
    Math.max(
      0,
      input.coveredDemandQuantity +
        targetClosingStockQuantity -
        input.morningOnHandQuantity,
    ),
  );
  const suggestedCaseCount =
    netNeedQuantity === 0
      ? 0
      : Math.ceil((netNeedQuantity - Number.EPSILON) / input.packSize);
  const suggestedOrderQuantity = roundedQuantity(
    suggestedCaseCount * input.packSize,
  );
  const projectedClosingStockQuantity = roundedQuantity(
    input.morningOnHandQuantity +
      suggestedOrderQuantity -
      input.coveredDemandQuantity,
  );

  return {
    targetClosingStockQuantity,
    netNeedQuantity,
    suggestedCaseCount,
    suggestedOrderQuantity,
    projectedClosingStockQuantity,
  };
}

export function buildOrderSuggestionLine(input: {
  product: ProductOption;
  stockSnapshot: StockSnapshot | null;
  forecast: DayOfWeekForecastProduct | null;
  coverageDates: string[];
  targetClosingStockRatio: number;
}): OrderSuggestionLine {
  const forecastDays = input.coverageDates.map((businessDate) => ({
    businessDate,
    predictedQuantity:
      input.forecast?.forecastDays.find(
        (day) => day.businessDate === businessDate,
      )?.predictedQuantity ?? null,
  }));
  const warnings: OrderSuggestionLine["warnings"] = [];

  if (!input.stockSnapshot) {
    warnings.push({
      code: "MISSING_EXACT_STOCK",
      message:
        "Aucun stock validé pour la date de commande ; une valeur plus ancienne n’est pas réutilisée.",
    });
  } else if (input.stockSnapshot.onHandQuantity < 0) {
    warnings.push({
      code: "NEGATIVE_ON_HAND",
      message: "Le stock observé est négatif et doit être vérifié avant commande.",
    });
  }

  const forecastComplete = forecastDays.every(
    ({ predictedQuantity }) => predictedQuantity !== null,
  );
  if (!input.forecast || !forecastComplete) {
    warnings.push({
      code: "FORECAST_UNAVAILABLE",
      message:
        "La prévision ne couvre pas tous les jours de vente requis ; aucune quantité n’est proposée.",
    });
  } else if (input.forecast.confidence === "low") {
    warnings.push({
      code: "LOW_FORECAST_CONFIDENCE",
      message:
        "La prévision est de confiance faible ; la proposition doit être contrôlée attentivement.",
    });
  }

  const blocked =
    !input.stockSnapshot ||
    input.stockSnapshot.onHandQuantity < 0 ||
    !input.forecast ||
    !forecastComplete;
  const base = {
    productId: input.product.id,
    productLabel: input.product.label,
    familyCode: input.stockSnapshot?.familyCode ?? null,
    stockUnit: input.stockSnapshot?.stockUnit ?? null,
    packSize: input.stockSnapshot?.packSize ?? null,
    stockSnapshotId: input.stockSnapshot?.id ?? null,
    stockBusinessDate: input.stockSnapshot?.businessDate ?? null,
    stockObservedAt: input.stockSnapshot?.observedAt ?? null,
    morningOnHandQuantity: input.stockSnapshot?.onHandQuantity ?? null,
    forecastConfidence: input.forecast?.confidence ?? null,
    forecastDays,
    forecastWarnings: input.forecast?.warnings ?? [],
  };

  if (blocked) {
    return orderSuggestionLineSchema.parse({
      ...base,
      status: "unavailable",
      coveredDemandQuantity: null,
      targetClosingStockQuantity: null,
      netNeedQuantity: null,
      suggestedCaseCount: null,
      suggestedOrderQuantity: null,
      projectedClosingStockQuantity: null,
      warnings,
    });
  }

  if (!input.stockSnapshot) {
    throw new Error("Le stock exact est requis pour calculer une commande");
  }

  const coveredDemandQuantity = roundedQuantity(
    forecastDays.reduce(
      (total, day) => total + (day.predictedQuantity ?? 0),
      0,
    ),
  );
  const calculation = calculatePackOrder({
    coveredDemandQuantity,
    morningOnHandQuantity: input.stockSnapshot.onHandQuantity,
    packSize: input.stockSnapshot.packSize,
    targetClosingStockRatio: input.targetClosingStockRatio,
  });
  if (
    calculation.suggestedOrderQuantity > calculation.netNeedQuantity
  ) {
    warnings.push({
      code: "PACK_ROUNDING_SURPLUS",
      message: `Le colisage impose ${roundedQuantity(calculation.suggestedOrderQuantity - calculation.netNeedQuantity)} unité(s) au-delà du besoin net.`,
    });
  }

  return orderSuggestionLineSchema.parse({
    ...base,
    status: calculation.suggestedCaseCount === 0 ? "no_order" : "ready",
    coveredDemandQuantity,
    ...calculation,
    warnings,
  });
}
