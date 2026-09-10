import * as z from "zod";

import {
  dashboardMetricsSchema,
  productMetricSchema,
} from "@/domain/analytics/schemas";
import {
  commercialEventSchema,
  commercialEventStatusSchema,
} from "@/domain/commercial-events/schemas";
import { periodKeySchema } from "@/domain/imports/schemas";
import { markdownReasonSchema } from "@/domain/markdown/schemas";
import { networkDashboardSchema } from "@/domain/network/schemas";
import { recommendationDraftSchema } from "@/domain/recommendations/schemas";
import {
  allocationBasisSchema,
  allocationSummarySchema,
} from "@/domain/space/allocation-schemas";
import {
  layoutCapacitySummarySchema,
  layoutStatusSchema,
} from "@/domain/space/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const aiReadToolNameSchema = z.enum([
  "getStoreKpis",
  "getProductMetrics",
  "getProductHistory",
  "getMarkdownDrivers",
  "getSpaceAllocations",
  "getCommercialEvents",
  "compareAuthorizedStores",
  "explainRecommendation",
]);
export type AiReadToolName = z.infer<typeof aiReadToolNameSchema>;

export const aiEvidenceSourceSchema = z.enum([
  "salesFacts",
  "products",
  "markdownFacts",
  "layoutVersions",
  "allocationPlans",
  "commercialEvents",
  "recommendations",
  "periodTargets",
]);

export const aiEvidenceRefSchema = z.object({
  source: aiEvidenceSourceSchema,
  storeId: storeIdSchema,
  periodKeys: z.array(periodKeySchema).max(120),
  recordCount: z.number().int().nonnegative().nullable(),
  dataRevision: z.number().int().nonnegative().nullable(),
  calculationVersion: z.string().min(1).nullable(),
});
export type AiEvidenceRef = z.infer<typeof aiEvidenceRefSchema>;

export const aiDataSemanticsSchema = z.object({
  observed: z.array(z.string().min(1)),
  calculated: z.array(z.string().min(1)),
  inferred: z.array(z.string().min(1)),
});

export const aiToolLimitationSchema = z.object({
  code: z.enum([
    "NO_DATA",
    "MONTHLY_GRANULARITY",
    "PRIOR_YEAR_MISSING",
    "PRODUCT_NOT_FOUND",
    "HISTORY_PARTIAL",
    "MANUAL_MARKDOWN_ONLY",
    "LAYOUT_MISSING",
    "ALLOCATION_PLAN_MISSING",
    "NO_COMMERCIAL_EVENT",
    "RECOMMENDATION_UNAVAILABLE",
    "SINGLE_STORE_COMPARISON",
    "NORMALIZATION_COVERAGE_PARTIAL",
  ]),
  message: z.string().min(1),
});
export type AiToolLimitation = z.infer<typeof aiToolLimitationSchema>;

const resultBaseShape = {
  readOnly: z.literal(true),
  storeIds: z.array(storeIdSchema).min(1).max(50),
  evidence: z.array(aiEvidenceRefSchema),
  semantics: aiDataSemanticsSchema,
  limitations: z.array(aiToolLimitationSchema),
} as const;

export const getStoreKpisInputSchema = z
  .object({ period: periodKeySchema.optional() })
  .strict();
export const getProductMetricsInputSchema = z
  .object({
    period: periodKeySchema.optional(),
    productIds: z
      .array(mongoIdSchema)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Un produit ne peut être demandé qu’une fois",
      })
      .default([]),
    limit: z.number().int().min(1).max(100).default(10),
    orderBy: z
      .enum(["revenue", "margin", "forecast", "label"])
      .default("revenue"),
  })
  .strict();
export const getProductHistoryInputSchema = z
  .object({
    productId: mongoIdSchema,
    throughPeriod: periodKeySchema.optional(),
    months: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export const getMarkdownDriversInputSchema = z
  .object({
    period: periodKeySchema.optional(),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export const getSpaceAllocationsInputSchema = z.object({}).strict();
export const getCommercialEventsInputSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    statuses: z.array(commercialEventStatusSchema).min(1).max(4).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "La date de fin doit suivre la date de début",
      });
    }
  });
export const explainRecommendationInputSchema = z
  .object({
    productId: mongoIdSchema,
    period: periodKeySchema.optional(),
  })
  .strict();
export const compareAuthorizedStoresInputSchema = z
  .object({ period: periodKeySchema.optional() })
  .strict();

export const storeAiReadToolRequestSchema = z.discriminatedUnion("tool", [
  z
    .object({ tool: z.literal("getStoreKpis"), input: getStoreKpisInputSchema })
    .strict(),
  z.object({
    tool: z.literal("getProductMetrics"),
    input: getProductMetricsInputSchema,
  }).strict(),
  z.object({
    tool: z.literal("getProductHistory"),
    input: getProductHistoryInputSchema,
  }).strict(),
  z.object({
    tool: z.literal("getMarkdownDrivers"),
    input: getMarkdownDriversInputSchema,
  }).strict(),
  z.object({
    tool: z.literal("getSpaceAllocations"),
    input: getSpaceAllocationsInputSchema,
  }).strict(),
  z.object({
    tool: z.literal("getCommercialEvents"),
    input: getCommercialEventsInputSchema,
  }).strict(),
  z.object({
    tool: z.literal("explainRecommendation"),
    input: explainRecommendationInputSchema,
  }).strict(),
]);
export const networkAiReadToolRequestSchema = z
  .object({
    tool: z.literal("compareAuthorizedStores"),
    input: compareAuthorizedStoresInputSchema,
  })
  .strict();
export const getStoreKpisResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getStoreKpis"),
  data: dashboardMetricsSchema.nullable(),
});

export const getProductMetricsResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getProductMetrics"),
  data: z
    .object({
      periodKey: periodKeySchema,
      calculationVersion: z.string().min(1),
      dataRevision: z.number().int().nonnegative(),
      products: z.array(productMetricSchema).max(100),
    })
    .nullable(),
});

export const aiProductHistoryPointSchema = z.object({
  periodKey: periodKeySchema,
  revenueCents: z.number().int().safe(),
  marginCents: z.number().int().safe(),
  quantity: z.number().finite(),
  marginRatio: z.number().finite().nullable(),
});

export const getProductHistoryResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getProductHistory"),
  data: z
    .object({
      productId: mongoIdSchema,
      productLabel: z.string().min(1),
      throughPeriod: periodKeySchema,
      requestedMonths: z.number().int().min(1).max(24),
      history: z.array(aiProductHistoryPointSchema).max(24),
    })
    .nullable(),
});

const markdownDriverSchema = z.object({
  label: z.string().min(1),
  amountCents: z.number().int().safe().nonnegative(),
  share: z.number().min(0).max(1).nullable(),
  recordCount: z.number().int().nonnegative(),
});

export const getMarkdownDriversResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getMarkdownDrivers"),
  data: z
    .object({
      periodKey: periodKeySchema,
      totalAmountCents: z.number().int().safe().nonnegative(),
      recordCount: z.number().int().nonnegative(),
      byReason: z.array(
        markdownDriverSchema.extend({ reason: markdownReasonSchema }),
      ),
      byProduct: z.array(
        markdownDriverSchema.extend({ productId: mongoIdSchema }),
      ),
    })
    .nullable(),
});

export const getSpaceAllocationsResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getSpaceAllocations"),
  data: z
    .object({
      layout: z.object({
        id: mongoIdSchema,
        version: z.number().int().positive(),
        name: z.string().min(1),
        status: layoutStatusSchema,
        geometryConfirmed: z.boolean(),
        capacity: layoutCapacitySummarySchema,
      }),
      plan: z
        .object({
          id: mongoIdSchema,
          version: z.number().int().positive(),
          name: z.string().min(1),
          status: z.literal("draft"),
          source: z.enum(["manager", "heuristic"]),
          modelVersion: z.string().min(1),
          basis: allocationBasisSchema,
          evidence: z.array(z.string().min(1)),
          allocations: z.array(
            z.object({
              productId: mongoIdSchema,
              productLabel: z.string().min(1),
              shelfId: z.string().min(1),
              facingWidthM: z.number().finite().positive(),
              locked: z.boolean(),
            }),
          ),
          summary: allocationSummarySchema,
        })
        .nullable(),
    })
    .nullable(),
});

export const getCommercialEventsResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("getCommercialEvents"),
  data: z.object({ events: z.array(commercialEventSchema).max(500) }),
});

export const explainRecommendationResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("explainRecommendation"),
  data: recommendationDraftSchema.nullable(),
});

export const compareAuthorizedStoresResultSchema = z.object({
  ...resultBaseShape,
  tool: z.literal("compareAuthorizedStores"),
  data: networkDashboardSchema.nullable(),
});

export const storeAiReadToolResultSchema = z.discriminatedUnion("tool", [
  getStoreKpisResultSchema,
  getProductMetricsResultSchema,
  getProductHistoryResultSchema,
  getMarkdownDriversResultSchema,
  getSpaceAllocationsResultSchema,
  getCommercialEventsResultSchema,
  explainRecommendationResultSchema,
]);
export type StoreAiReadToolResult = z.infer<
  typeof storeAiReadToolResultSchema
>;
export type NetworkAiReadToolResult = z.infer<
  typeof compareAuthorizedStoresResultSchema
>;

interface AiReadToolDefinition {
  scope: "store" | "network";
  description: string;
  inputSchema: z.ZodType;
  resultSchema: z.ZodType;
}

export const aiReadToolDefinitions = {
  getStoreKpis: {
    scope: "store",
    description:
      "Retourne les KPI mensuels observés et calculés du magasin autorisé.",
    inputSchema: getStoreKpisInputSchema,
    resultSchema: getStoreKpisResultSchema,
  },
  getProductMetrics: {
    scope: "store",
    description:
      "Classe et filtre les métriques produits du magasin autorisé.",
    inputSchema: getProductMetricsInputSchema,
    resultSchema: getProductMetricsResultSchema,
  },
  getProductHistory: {
    scope: "store",
    description:
      "Retourne jusqu’à 24 mois d’historique pour un produit du magasin autorisé.",
    inputSchema: getProductHistoryInputSchema,
    resultSchema: getProductHistoryResultSchema,
  },
  getMarkdownDrivers: {
    scope: "store",
    description:
      "Agrège les démarques manuelles par cause et par produit.",
    inputSchema: getMarkdownDriversInputSchema,
    resultSchema: getMarkdownDriversResultSchema,
  },
  getSpaceAllocations: {
    scope: "store",
    description:
      "Décrit le dernier plan magasin et ses allocations sans les modifier.",
    inputSchema: getSpaceAllocationsInputSchema,
    resultSchema: getSpaceAllocationsResultSchema,
  },
  getCommercialEvents: {
    scope: "store",
    description:
      "Liste les opérations commerciales autorisées selon dates et statuts.",
    inputSchema: getCommercialEventsInputSchema,
    resultSchema: getCommercialEventsResultSchema,
  },
  compareAuthorizedStores: {
    scope: "network",
    description:
      "Compare uniquement l’ensemble de magasins préautorisé côté serveur.",
    inputSchema: compareAuthorizedStoresInputSchema,
    resultSchema: compareAuthorizedStoresResultSchema,
  },
  explainRecommendation: {
    scope: "store",
    description:
      "Reconstruit sans écriture une recommandation et ses preuves versionnées.",
    inputSchema: explainRecommendationInputSchema,
    resultSchema: explainRecommendationResultSchema,
  },
} as const satisfies Record<AiReadToolName, AiReadToolDefinition>;

export const aiReadToolCatalog = aiReadToolNameSchema.options.map((name) => ({
  name,
  scope: aiReadToolDefinitions[name].scope,
  description: aiReadToolDefinitions[name].description,
}));
