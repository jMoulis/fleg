import * as z from "zod";

import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const markdownReasonSchema = z.enum([
  "quality",
  "overripe",
  "damaged",
  "expiry",
  "price_reduction",
  "donation",
  "other",
]);
export type MarkdownReason = z.infer<typeof markdownReasonSchema>;

export const markdownReasonLabels: Record<MarkdownReason, string> = {
  quality: "Qualité insuffisante",
  overripe: "Surmaturité",
  damaged: "Produit abîmé",
  expiry: "Date courte",
  price_reduction: "Réduction de prix",
  donation: "Don",
  other: "Autre",
};

export const markdownFactSchema = z.object({
  id: mongoIdSchema,
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  departmentId: mongoIdSchema,
  productId: mongoIdSchema,
  occurredOn: z.iso.date(),
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountCents: z.number().int().safe().positive(),
  quantity: z.number().finite().positive().nullable(),
  reason: markdownReasonSchema,
  notes: z.string().trim().max(1_000).nullable(),
  source: z.literal("manual"),
  createdBy: z.string().min(1),
  createdAt: z.iso.datetime(),
});
export type MarkdownFact = z.infer<typeof markdownFactSchema>;

export const markdownCreateInputSchema = z.object({
  idempotencyKey: z.uuid(),
  productId: mongoIdSchema,
  occurredOn: z.iso.date(),
  amountCents: z.number().int().safe().positive(),
  quantity: z.number().finite().positive().nullable(),
  reason: markdownReasonSchema,
  notes: z.string().trim().max(1_000).nullable(),
});
export type MarkdownCreateInput = z.infer<typeof markdownCreateInputSchema>;

export const markdownListQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    productId: mongoIdSchema.optional(),
  })
  .superRefine((query, context) => {
    if (query.from && query.to && query.from > query.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "La date de fin doit suivre la date de début",
      });
    }
  });
export type MarkdownListQuery = z.infer<typeof markdownListQuerySchema>;

export const markdownResponseSchema = z.object({
  markdown: markdownFactSchema,
  requestId: z.uuid(),
});

export const markdownListResponseSchema = z.object({
  markdown: z.array(markdownFactSchema),
  requestId: z.uuid(),
});
