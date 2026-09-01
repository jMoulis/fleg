import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const moneyCentsSchema = z.number().int().safe().nonnegative().nullable();

export const commercialEventStatusSchema = z.enum([
  "draft",
  "published",
  "completed",
  "cancelled",
]);
export type CommercialEventStatus = z.infer<
  typeof commercialEventStatusSchema
>;

const commercialEventFieldsSchema = z
  .object({
    layoutVersionId: mongoIdSchema,
    fixtureId: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(160),
    theme: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    productIds: z.array(mongoIdSchema).min(1).max(50),
    targetRevenueCents: moneyCentsSchema,
    targetMarginCents: moneyCentsSchema,
    actualRevenueCents: moneyCentsSchema,
    actualMarginCents: moneyCentsSchema,
    notes: z.string().trim().max(1_000).nullable(),
  })
  .superRefine((event, context) => {
    if (event.startsOn > event.endsOn) {
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "La date de fin doit suivre la date de début",
      });
    }

    if (new Set(event.productIds).size !== event.productIds.length) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Un produit ne peut être sélectionné qu'une fois",
      });
    }
  });

export const commercialEventSchema = commercialEventFieldsSchema.safeExtend({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  departmentId: mongoIdSchema,
  fixtureName: z.string().trim().min(1).max(160),
  status: commercialEventStatusSchema,
  createdBy: z.string().min(1),
  publishedBy: z.string().min(1).nullable(),
  completedBy: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type CommercialEvent = z.infer<typeof commercialEventSchema>;

export const commercialEventCreateInputSchema = commercialEventFieldsSchema
  .safeExtend({
    idempotencyKey: z.uuid(),
    action: z.enum(["save", "publish"]),
  })
  .superRefine((event, context) => {
    if (
      event.actualRevenueCents !== null ||
      event.actualMarginCents !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["actualRevenueCents"],
        message: "Le réalisé est renseigné à la clôture de l'opération",
      });
    }

    if (
      event.action === "publish" &&
      event.targetRevenueCents === null &&
      event.targetMarginCents === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetRevenueCents"],
        message: "Un objectif de CA ou de marge est requis avant publication",
      });
    }
  });
export type CommercialEventCreateInput = z.infer<
  typeof commercialEventCreateInputSchema
>;

export const commercialEventUpdateInputSchema = commercialEventFieldsSchema
  .safeExtend({
    idempotencyKey: z.uuid(),
    basedOnUpdatedAt: z.iso.datetime(),
    action: z.enum(["save", "publish", "complete", "cancel"]),
  })
  .superRefine((event, context) => {
    if (
      event.action !== "complete" &&
      (event.actualRevenueCents !== null || event.actualMarginCents !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["actualRevenueCents"],
        message: "Le réalisé ne peut être saisi qu'à la clôture",
      });
    }

    if (
      event.action === "publish" &&
      event.targetRevenueCents === null &&
      event.targetMarginCents === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetRevenueCents"],
        message: "Un objectif de CA ou de marge est requis avant publication",
      });
    }

    if (
      event.action === "complete" &&
      event.actualRevenueCents === null &&
      event.actualMarginCents === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["actualRevenueCents"],
        message: "Un résultat de CA ou de marge est requis pour terminer",
      });
    }
  });
export type CommercialEventUpdateInput = z.infer<
  typeof commercialEventUpdateInputSchema
>;

export const commercialEventResponseSchema = z.object({
  event: commercialEventSchema,
  requestId: z.uuid(),
});

export const commercialEventsResponseSchema = z.object({
  events: z.array(commercialEventSchema),
  requestId: z.uuid(),
});

export const endcapOptionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(160),
  commercialRole: z.string().trim().min(1).max(100).nullable(),
});
export type EndcapOption = z.infer<typeof endcapOptionSchema>;
