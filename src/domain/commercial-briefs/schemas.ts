import { z } from "zod";

// Deliberately separate from native-text processing and the Copilot policy.
export const briefPolicy = {
  version: "commercial-brief-1",
  maxPages: 12,
  maxCharacters: 30_000,
  maxSections: 40,
  maxFields: 30,
  maxJobsPerStore: 20,
  maxOutputTokens: 12_000,
  maxInputBytes: 60_000,
  timeoutMs: 90_000,
  leaseMs: 120_000,
  retentionMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const briefFieldLabels = {
  title: "Titre / thème",
  source_action: "Action indiquée par la centrale",
  product_label: "Produit",
  plu: "PLU",
  ean: "EAN",
  gencod: "Gencod",
  variety: "Variété",
  calibre: "Calibre",
  origin: "Origine",
  unit: "Unité de vente",
  packaging: "Conditionnement",
  purchase_price_cents: "Prix d’achat (€)",
  selling_price_cents: "Prix de vente (€)",
  price_qualifier: "Nature du prix",
  margin_ratio: "Marge annoncée (%)",
  promotional_mechanic: "Mécanique promotionnelle",
  publication_week: "Semaine de publication",
  coverage_start: "Début du document (AAAA-MM-JJ)",
  coverage_end: "Fin du document (AAAA-MM-JJ)",
  sale_start: "Début de vente (AAAA-MM-JJ)",
  sale_end: "Fin de vente (AAAA-MM-JJ)",
  delivery_start: "Début de livraison (AAAA-MM-JJ)",
  delivery_end: "Fin de livraison (AAAA-MM-JJ)",
  order_deadline: "Date limite de commande (AAAA-MM-JJ)",
  anticipation_week: "Semaine anticipée",
  note: "Information complémentaire",
} as const;
export const briefKindLabels = {
  promotion: "Promotion",
  tg_recommendation: "Recommandation TG",
  mass_display_recommendation: "Table de masse",
  advance_order_offer: "Offre anticipée",
  commercial_policy: "Politique commerciale",
  market_alert: "Alerte marché",
  communication_campaign: "Communication",
  other: "Autre",
} as const;
export const briefKeySchema = z.enum(
  Object.keys(briefFieldLabels) as [
    keyof typeof briefFieldLabels,
    ...(keyof typeof briefFieldLabels)[],
  ],
);
export const briefKindSchema = z.enum(
  Object.keys(briefKindLabels) as [
    keyof typeof briefKindLabels,
    ...(keyof typeof briefKindLabels)[],
  ],
);
const valueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.null(),
]);
const evidenceSchema = z
  .object({
    page: z.number().int().min(1).max(60),
    excerpt: z.string().min(1).max(1500),
  })
  .strict();
export const briefFieldSchema = z
  .object({
    key: briefKeySchema,
    value: valueSchema,
    evidence: evidenceSchema,
    confidence: z.enum(["low", "medium", "high", "unknown"]),
  })
  .strict();
export const briefSectionSchema = z
  .object({
    kind: briefKindSchema,
    evidence: evidenceSchema,
    fields: z.array(briefFieldSchema).min(1).max(briefPolicy.maxFields),
  })
  .strict();
// Plain JSON Schema for the provider. Cross-field checks are applied separately.
export const briefExtractionSchema = z
  .object({
    sections: z.array(briefSectionSchema).max(briefPolicy.maxSections),
  })
  .strict();
export type BriefExtraction = z.infer<typeof briefExtractionSchema>;
export type BriefField = z.infer<typeof briefFieldSchema>;
export const briefPagesSchema = z
  .array(
    z
      .object({
        page: z.number().int().min(1).max(60),
        text: z.string().min(1).max(20_000),
      })
      .strict(),
  )
  .min(1)
  .max(briefPolicy.maxPages)
  .superRefine((pages, ctx) => {
    if (
      new Set(pages.map((p) => p.page)).size !== pages.length ||
      pages.reduce((sum, p) => sum + p.text.length, 0) >
        briefPolicy.maxCharacters ||
      pages.some((p) => !p.text.trim())
    )
      ctx.addIssue({
        code: "custom",
        message: "Pages vides, répétées ou hors limites",
      });
  });
export type BriefPages = z.infer<typeof briefPagesSchema>;
export const briefUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    estimatedUsdCents: z.number().int().nonnegative(),
  })
  .strict();
export const briefReviewSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    section: z
      .number()
      .int()
      .min(0)
      .max(briefPolicy.maxSections - 1),
    decision: z.enum(["confirmed", "excluded"]),
    values: z
      .array(z.object({ key: briefKeySchema, value: valueSchema }).strict())
      .max(briefPolicy.maxFields),
  })
  .strict();
export const briefStatusSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    sourceId: z.string().regex(/^[a-f0-9]{24}$/),
    state: z.enum(["queued", "running", "draft", "reviewed", "failed"]),
    revision: z.number().int().nonnegative(),
    model: z.string().min(1).max(120),
    policyVersion: z.literal(briefPolicy.version),
    expiresAt: z.iso.datetime(),
    pages: briefPagesSchema,
    extraction: briefExtractionSchema.nullable(),
    reviews: z
      .array(
        z
          .object({
            section: z.number().int().nonnegative(),
            decision: z.enum(["confirmed", "excluded"]),
            values: z.array(
              z.object({ key: briefKeySchema, value: valueSchema }).strict(),
            ),
            actorId: z.string(),
            reviewedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(briefPolicy.maxSections),
    usage: briefUsageSchema.nullable(),
    error: z
      .enum([
        "provider_unavailable",
        "invalid_extraction",
        "source_unavailable",
        "interrupted",
      ])
      .nullable(),
  })
  .strict();
export type BriefStatus = z.infer<typeof briefStatusSchema>;
export const briefMatchSchema = z
  .object({
    section: z.number().int().nonnegative(),
    method: z.enum(["identifier", "label", "unresolved", "ambiguous"]),
    product: z
      .object({ id: z.string().regex(/^[a-f0-9]{24}$/), label: z.string() })
      .nullable(),
  })
  .strict();
