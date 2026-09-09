import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const businessContextCalculationVersion = "business-context-v1";
export const businessContextDefaultRangeDays = 14;
export const businessContextMaximumRangeDays = 92;

export const promotionMechanicSchema = z.enum([
  "display",
  "price_reduction",
  "multibuy",
  "coupon",
  "sampling",
  "other",
]);
export type PromotionMechanic = z.infer<typeof promotionMechanicSchema>;

export const promotionMechanicLabels: Record<PromotionMechanic, string> = {
  display: "Mise en avant",
  price_reduction: "Réduction de prix",
  multibuy: "Lot / multi-achat",
  coupon: "Coupon",
  sampling: "Dégustation",
  other: "Autre",
};

export const weatherConditionSchema = z.enum([
  "clear",
  "cloudy",
  "rain",
  "heavy_rain",
  "storm",
  "wind",
  "frost",
  "snow",
  "heatwave",
  "other",
]);
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

export const weatherConditionLabels: Record<WeatherCondition, string> = {
  clear: "Dégagé",
  cloudy: "Couvert",
  rain: "Pluie",
  heavy_rain: "Forte pluie",
  storm: "Orage",
  wind: "Vent fort",
  frost: "Gel",
  snow: "Neige",
  heatwave: "Forte chaleur",
  other: "Autre",
};

export const promotionProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z
    .object({
      kind: z.literal("commercial_event"),
      commercialEventId: mongoIdSchema,
    })
    .strict(),
]);
export type PromotionProvenance = z.infer<
  typeof promotionProvenanceSchema
>;

export const weatherProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z
    .object({
      kind: z.literal("provider"),
      provider: z.string().trim().min(1).max(80),
      reference: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export type WeatherProvenance = z.infer<typeof weatherProvenanceSchema>;

const promotionValueSchema = z
  .object({
    businessDate: z.iso.date(),
    state: z.enum(["active", "none"]),
    productIds: z.array(mongoIdSchema).max(50),
    mechanic: promotionMechanicSchema.nullable(),
    label: z.string().trim().min(1).max(160).nullable(),
    discountRate: z.number().finite().min(0).max(1).nullable(),
    provenance: promotionProvenanceSchema,
    notes: z.string().trim().max(1_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.productIds).size !== value.productIds.length) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Un produit ne peut être sélectionné qu’une fois",
      });
    }

    if (value.state === "active") {
      if (value.productIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["productIds"],
          message: "Une promotion active doit concerner au moins un produit",
        });
      }
      if (value.mechanic === null) {
        context.addIssue({
          code: "custom",
          path: ["mechanic"],
          message: "La mécanique promotionnelle est requise",
        });
      }
      if (value.label === null) {
        context.addIssue({
          code: "custom",
          path: ["label"],
          message: "Le libellé de la promotion est requis",
        });
      }
    } else {
      if (
        value.productIds.length > 0 ||
        value.mechanic !== null ||
        value.label !== null ||
        value.discountRate !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["state"],
          message: "Une absence observée de promotion ne porte aucun détail promotionnel",
        });
      }
      if (value.provenance.kind !== "manual") {
        context.addIssue({
          code: "custom",
          path: ["provenance"],
          message: "Une absence de promotion est constatée manuellement",
        });
      }
    }
  });

export const promotionObservationCreateInputSchema = promotionValueSchema.safeExtend({
  idempotencyKey: z.uuid(),
});
export type PromotionObservationCreateInput = z.infer<
  typeof promotionObservationCreateInputSchema
>;

export const promotionObservationSchema = promotionValueSchema.safeExtend({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  departmentId: mongoIdSchema,
  recordedBy: z.string().min(1),
  recordedAt: z.iso.datetime(),
});
export type PromotionObservation = z.infer<
  typeof promotionObservationSchema
>;

const weatherValueSchema = z
  .object({
    businessDate: z.iso.date(),
    condition: weatherConditionSchema,
    minimumTemperatureC: z.number().finite().min(-50).max(60).nullable(),
    maximumTemperatureC: z.number().finite().min(-50).max(60).nullable(),
    precipitationMm: z.number().finite().min(0).max(500).nullable(),
    provenance: weatherProvenanceSchema,
    notes: z.string().trim().max(1_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minimumTemperatureC !== null &&
      value.maximumTemperatureC !== null &&
      value.minimumTemperatureC > value.maximumTemperatureC
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumTemperatureC"],
        message: "La température maximale doit être supérieure ou égale au minimum",
      });
    }
  });

export const weatherObservationCreateInputSchema = weatherValueSchema.safeExtend({
  idempotencyKey: z.uuid(),
});
export type WeatherObservationCreateInput = z.infer<
  typeof weatherObservationCreateInputSchema
>;

export const weatherObservationSchema = weatherValueSchema.safeExtend({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  departmentId: mongoIdSchema,
  recordedBy: z.string().min(1),
  recordedAt: z.iso.datetime(),
});
export type WeatherObservation = z.infer<typeof weatherObservationSchema>;

export const businessContextRangeQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    productId: mongoIdSchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.from && !query.to) || (!query.from && query.to)) {
      context.addIssue({
        code: "custom",
        path: [query.from ? "to" : "from"],
        message: "Les dates de début et de fin doivent être renseignées ensemble",
      });
      return;
    }
    if (query.from && query.to) {
      if (query.from > query.to) {
        context.addIssue({
          code: "custom",
          path: ["to"],
          message: "La date de fin doit suivre la date de début",
        });
        return;
      }
      const dayCount =
        (new Date(`${query.to}T00:00:00.000Z`).getTime() -
          new Date(`${query.from}T00:00:00.000Z`).getTime()) /
          86_400_000 +
        1;
      if (dayCount > businessContextMaximumRangeDays) {
        context.addIssue({
          code: "custom",
          path: ["to"],
          message: `La plage ne peut pas dépasser ${businessContextMaximumRangeDays} jours`,
        });
      }
    }
  });
export type BusinessContextRangeQuery = z.infer<
  typeof businessContextRangeQuerySchema
>;

export const promotionContextFeatureSchema = z.object({
  status: z.enum(["observed", "missing"]),
  active: z.boolean().nullable(),
  observationIds: z.array(mongoIdSchema),
  mechanics: z.array(promotionMechanicSchema),
  maximumDiscountRate: z.number().finite().min(0).max(1).nullable(),
});

export const weatherContextFeatureSchema = z.object({
  status: z.enum(["observed", "missing"]),
  selectedObservationId: mongoIdSchema.nullable(),
  observationCount: z.number().int().nonnegative(),
  condition: weatherConditionSchema.nullable(),
  minimumTemperatureC: z.number().finite().min(-50).max(60).nullable(),
  maximumTemperatureC: z.number().finite().min(-50).max(60).nullable(),
  precipitationMm: z.number().finite().min(0).max(500).nullable(),
  provenance: weatherProvenanceSchema.nullable(),
});

export const dailyBusinessContextFeatureSchema = z.object({
  businessDate: z.iso.date(),
  promotion: promotionContextFeatureSchema,
  weather: weatherContextFeatureSchema,
});
export type DailyBusinessContextFeature = z.infer<
  typeof dailyBusinessContextFeatureSchema
>;

export const businessContextCoverageSchema = z.object({
  status: z.enum(["complete", "partial", "unknown"]),
  expectedDates: z.array(z.iso.date()),
  completeDates: z.array(z.iso.date()),
  missingPromotionDates: z.array(z.iso.date()),
  missingWeatherDates: z.array(z.iso.date()),
});

export const businessContextViewSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  productId: mongoIdSchema.nullable(),
  days: z.array(dailyBusinessContextFeatureSchema),
  coverage: businessContextCoverageSchema,
  promotionObservations: z.array(promotionObservationSchema),
  weatherObservations: z.array(weatherObservationSchema),
  dataRevision: z.number().int().nonnegative(),
  calculationVersion: z.literal(businessContextCalculationVersion),
});
export type BusinessContextView = z.infer<typeof businessContextViewSchema>;

export const businessContextResponseSchema = z.object({
  context: businessContextViewSchema,
  requestId: z.uuid(),
});

export const promotionObservationResponseSchema = z.object({
  observation: promotionObservationSchema,
  requestId: z.uuid(),
});

export const weatherObservationResponseSchema = z.object({
  observation: weatherObservationSchema,
  requestId: z.uuid(),
});
