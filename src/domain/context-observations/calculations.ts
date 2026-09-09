import { enumerateBusinessDates } from "@/domain/imports/daily-dates";
import {
  businessContextCalculationVersion,
  businessContextViewSchema,
  type PromotionObservation,
  type WeatherObservation,
} from "@/domain/context-observations/schemas";

function chronologyKey(observation: { id: string; recordedAt: string }): string {
  return `${observation.recordedAt}:${observation.id}`;
}

function after(
  observation: { id: string; recordedAt: string },
  boundary: { id: string; recordedAt: string } | undefined,
): boolean {
  return !boundary || chronologyKey(observation) > chronologyKey(boundary);
}

function buildPromotionFeature(input: {
  observations: PromotionObservation[];
  productId: string | null;
}) {
  const reset = input.observations
    .filter(({ state }) => state === "none")
    .sort((left, right) => chronologyKey(right).localeCompare(chronologyKey(left)))[0];
  const active = input.observations
    .filter(
      (observation) =>
        observation.state === "active" &&
        (input.productId === null ||
          observation.productIds.includes(input.productId)) &&
        after(observation, reset),
    )
    .sort((left, right) => chronologyKey(left).localeCompare(chronologyKey(right)));

  if (active.length > 0) {
    const discounts = active.flatMap(({ discountRate }) =>
      discountRate === null ? [] : [discountRate],
    );
    return {
      status: "observed" as const,
      active: true,
      observationIds: active.map(({ id }) => id),
      mechanics: [...new Set(active.flatMap(({ mechanic }) =>
        mechanic === null ? [] : [mechanic],
      ))],
      maximumDiscountRate:
        discounts.length > 0 ? Math.max(...discounts) : null,
    };
  }

  if (reset) {
    return {
      status: "observed" as const,
      active: false,
      observationIds: [reset.id],
      mechanics: [],
      maximumDiscountRate: null,
    };
  }

  return {
    status: "missing" as const,
    active: null,
    observationIds: [],
    mechanics: [],
    maximumDiscountRate: null,
  };
}

function buildWeatherFeature(observations: WeatherObservation[]) {
  const selected = [...observations].sort((left, right) =>
    chronologyKey(right).localeCompare(chronologyKey(left)),
  )[0];
  if (!selected) {
    return {
      status: "missing" as const,
      selectedObservationId: null,
      observationCount: 0,
      condition: null,
      minimumTemperatureC: null,
      maximumTemperatureC: null,
      precipitationMm: null,
      provenance: null,
    };
  }

  return {
    status: "observed" as const,
    selectedObservationId: selected.id,
    observationCount: observations.length,
    condition: selected.condition,
    minimumTemperatureC: selected.minimumTemperatureC,
    maximumTemperatureC: selected.maximumTemperatureC,
    precipitationMm: selected.precipitationMm,
    provenance: selected.provenance,
  };
}

export function calculateBusinessContextView(input: {
  from: string;
  to: string;
  productId: string | null;
  promotionObservations: PromotionObservation[];
  weatherObservations: WeatherObservation[];
  dataRevision: number;
}) {
  const expectedDates = enumerateBusinessDates(input.from, input.to);
  const promotions = input.promotionObservations.filter(
    ({ businessDate }) =>
      businessDate >= input.from && businessDate <= input.to,
  );
  const weather = input.weatherObservations.filter(
    ({ businessDate }) =>
      businessDate >= input.from && businessDate <= input.to,
  );
  const promotionsByDate = new Map<string, PromotionObservation[]>();
  const weatherByDate = new Map<string, WeatherObservation[]>();

  for (const observation of promotions) {
    const current = promotionsByDate.get(observation.businessDate) ?? [];
    current.push(observation);
    promotionsByDate.set(observation.businessDate, current);
  }
  for (const observation of weather) {
    const current = weatherByDate.get(observation.businessDate) ?? [];
    current.push(observation);
    weatherByDate.set(observation.businessDate, current);
  }

  const days = expectedDates.map((businessDate) => ({
    businessDate,
    promotion: buildPromotionFeature({
      observations: promotionsByDate.get(businessDate) ?? [],
      productId: input.productId,
    }),
    weather: buildWeatherFeature(weatherByDate.get(businessDate) ?? []),
  }));
  const completeDates = days
    .filter(
      ({ promotion, weather: weatherFeature }) =>
        promotion.status === "observed" && weatherFeature.status === "observed",
    )
    .map(({ businessDate }) => businessDate);
  const missingPromotionDates = days
    .filter(({ promotion }) => promotion.status === "missing")
    .map(({ businessDate }) => businessDate);
  const missingWeatherDates = days
    .filter(({ weather: weatherFeature }) => weatherFeature.status === "missing")
    .map(({ businessDate }) => businessDate);
  const observedFeatureCount = days.reduce(
    (count, day) =>
      count +
      Number(day.promotion.status === "observed") +
      Number(day.weather.status === "observed"),
    0,
  );

  return businessContextViewSchema.parse({
    from: input.from,
    to: input.to,
    productId: input.productId,
    days,
    coverage: {
      status:
        completeDates.length === expectedDates.length
          ? "complete"
          : observedFeatureCount === 0
            ? "unknown"
            : "partial",
      expectedDates,
      completeDates,
      missingPromotionDates,
      missingWeatherDates,
    },
    promotionObservations: promotions,
    weatherObservations: weather,
    dataRevision: input.dataRevision,
    calculationVersion: businessContextCalculationVersion,
  });
}
