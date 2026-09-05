import "server-only";

import {
  buildAiProductHistory,
  filterAiCommercialEvents,
  selectAiProductMetrics,
  summarizeAiMarkdownDrivers,
} from "@/domain/ai/calculations";
import {
  buildAuthorizedAiNetworkScope,
  assertStoreAiReadAccess,
} from "@/domain/ai/authorization";
import {
  compareAuthorizedStoresResultSchema,
  getCommercialEventsResultSchema,
  getMarkdownDriversResultSchema,
  getProductHistoryResultSchema,
  getProductMetricsResultSchema,
  getSpaceAllocationsResultSchema,
  getStoreKpisResultSchema,
  explainRecommendationResultSchema,
  networkAiReadToolRequestSchema,
  storeAiReadToolRequestSchema,
  type AiEvidenceRef,
  type AiToolLimitation,
  type NetworkAiReadToolResult,
  type StoreAiReadToolResult,
} from "@/domain/ai/tools";
import { shiftMonth } from "@/domain/analytics/calculations";
import { summarizeAllocations } from "@/domain/space/allocations";
import { summarizeLayoutCapacity } from "@/domain/space/calculations";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { AnalyticsRepository } from "@/server/repositories/analytics-repository";
import { ProductRepository } from "@/server/repositories/product-repository";
import { getAllocationWorkspace } from "@/server/services/allocation-service";
import { getDashboardMetrics, getProductMetrics } from "@/server/services/analytics-service";
import { listCommercialEvents } from "@/server/services/commercial-event-service";
import { listMarkdown } from "@/server/services/markdown-service";
import { getNetworkDashboard } from "@/server/services/network-analytics-service";
import { previewRecommendation } from "@/server/services/recommendation-service";

const monthlyGranularity: AiToolLimitation = {
  code: "MONTHLY_GRANULARITY",
  message:
    "Les ventes disponibles sont mensuelles ; aucune conclusion journalière ou hebdomadaire ne peut être déduite.",
};

function evidence(input: AiEvidenceRef): AiEvidenceRef {
  return input;
}

async function resolvePeriod(
  repository: AnalyticsRepository,
  context: AuthorizedStoreContext,
  requestedPeriod?: string,
) {
  return requestedPeriod ?? repository.findLatestPeriod(context);
}

function monthDateRange(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);
  return { from: `${periodKey}-01`, to: lastDay };
}

async function executeGetStoreKpis(
  context: AuthorizedStoreContext,
  input: { period?: string },
) {
  const data = await getDashboardMetrics(context, input.period);
  const limitations: AiToolLimitation[] = [monthlyGranularity];
  if (!data) {
    limitations.push({
      code: "NO_DATA",
      message: "Aucune donnée de vente n’est disponible pour la période demandée.",
    });
  } else if (data.priorYearRevenueCents === null) {
    limitations.push({
      code: "PRIOR_YEAR_MISSING",
      message:
        "La période N-1 est absente ; l’évolution annuelle reste indisponible.",
    });
  }

  return getStoreKpisResultSchema.parse({
    tool: "getStoreKpis",
    readOnly: true,
    storeIds: [context.storeId],
    data,
    evidence: data
      ? [
          evidence({
            source: "salesFacts",
            storeId: context.storeId,
            periodKeys: [
              data.periodKey,
              shiftMonth(data.periodKey, -12),
            ],
            recordCount: null,
            dataRevision: data.dataRevision,
            calculationVersion: data.calculationVersion,
          }),
        ]
      : [],
    semantics: {
      observed: [
        "data.revenueCents",
        "data.marginCents",
        "data.quantity",
        "data.productCount",
        "data.priorYearRevenueCents",
      ],
      calculated: ["data.marginRatio", "data.yearOverYearRatio"],
      inferred: [],
    },
    limitations,
  });
}

async function executeGetProductMetrics(
  context: AuthorizedStoreContext,
  input: {
    period?: string;
    productIds: string[];
    limit: number;
    orderBy: "revenue" | "margin" | "forecast" | "label";
  },
) {
  const repository = new AnalyticsRepository(await getAppDb());
  const periodKey = await resolvePeriod(repository, context, input.period);
  const limitations: AiToolLimitation[] = [monthlyGranularity];
  const metrics = periodKey
    ? await getProductMetrics(context, periodKey)
    : null;
  const products = metrics
    ? selectAiProductMetrics({
        products: metrics.products,
        productIds: input.productIds,
        limit: input.limit,
        orderBy: input.orderBy,
      })
    : [];
  const availableSelectedProductCount = metrics
    ? metrics.products.filter(({ productId }) =>
        input.productIds.includes(productId),
      ).length
    : 0;
  if (!metrics) {
    limitations.push({
      code: "NO_DATA",
      message: "Aucune métrique produit n’est disponible.",
    });
  }
  if (
    input.productIds.length > 0 &&
    availableSelectedProductCount < input.productIds.length
  ) {
    limitations.push({
      code: "PRODUCT_NOT_FOUND",
      message:
        "Au moins un produit demandé n’appartient pas au magasin autorisé ou n’a pas de donnée sur cette période.",
    });
  }

  return getProductMetricsResultSchema.parse({
    tool: "getProductMetrics",
    readOnly: true,
    storeIds: [context.storeId],
    data:
      metrics && periodKey
        ? {
            periodKey,
            calculationVersion: metrics.calculationVersion,
            dataRevision: metrics.dataRevision,
            products,
          }
        : null,
    evidence:
      metrics && periodKey
        ? [
            evidence({
              source: "salesFacts",
              storeId: context.storeId,
              periodKeys: [
                periodKey,
                shiftMonth(periodKey, -1),
                shiftMonth(periodKey, -12),
                shiftMonth(periodKey, -13),
              ],
              recordCount: null,
              dataRevision: metrics.dataRevision,
              calculationVersion: metrics.calculationVersion,
            }),
          ]
        : [],
    semantics: {
      observed: [
        "data.products[].revenueCents",
        "data.products[].marginCents",
        "data.products[].quantity",
        "data.products[].priorYearRevenueCents",
      ],
      calculated: [
        "data.products[].marginRatio",
        "data.products[].yearOverYearRatio",
        "data.products[].abcClass",
        "data.products[].forecastRevenueCents",
      ],
      inferred: ["data.products[].confidence"],
    },
    limitations,
  });
}

async function executeGetProductHistory(
  context: AuthorizedStoreContext,
  input: { productId: string; throughPeriod?: string; months: number },
) {
  const repository = new AnalyticsRepository(await getAppDb());
  const throughPeriod = await resolvePeriod(
    repository,
    context,
    input.throughPeriod,
  );
  const limitations: AiToolLimitation[] = [monthlyGranularity];
  const periodKeys = throughPeriod
    ? Array.from({ length: input.months }, (_, index) =>
        shiftMonth(throughPeriod, index - input.months + 1),
      )
    : [];
  const [labels, facts, dataRevision] = throughPeriod
    ? await Promise.all([
        repository.findProductLabels(context, [input.productId]),
        repository.findFacts(context, periodKeys),
        repository.getDataRevision(context),
      ])
    : [new Map<string, string>(), [], null];
  const productLabel = labels.get(input.productId);
  const history = productLabel
    ? buildAiProductHistory({
        facts,
        productId: input.productId,
        periodKeys,
      })
    : [];
  if (!throughPeriod) {
    limitations.push({
      code: "NO_DATA",
      message: "Aucune période de vente n’est disponible.",
    });
  } else if (!productLabel) {
    limitations.push({
      code: "PRODUCT_NOT_FOUND",
      message: "Le produit n’appartient pas au magasin autorisé.",
    });
  } else if (history.length < input.months) {
    limitations.push({
      code: "HISTORY_PARTIAL",
      message: `${history.length}/${input.months} mois demandés possèdent une observation.`,
    });
  }

  return getProductHistoryResultSchema.parse({
    tool: "getProductHistory",
    readOnly: true,
    storeIds: [context.storeId],
    data:
      throughPeriod && productLabel
        ? {
            productId: input.productId,
            productLabel,
            throughPeriod,
            requestedMonths: input.months,
            history,
          }
        : null,
    evidence:
      throughPeriod && dataRevision !== null
        ? [
            evidence({
              source: "salesFacts",
              storeId: context.storeId,
              periodKeys,
              recordCount: history.length,
              dataRevision,
              calculationVersion: null,
            }),
          ]
        : [],
    semantics: {
      observed: [
        "data.history[].revenueCents",
        "data.history[].marginCents",
        "data.history[].quantity",
      ],
      calculated: ["data.history[].marginRatio"],
      inferred: [],
    },
    limitations,
  });
}

async function executeGetMarkdownDrivers(
  context: AuthorizedStoreContext,
  input: { period?: string; limit: number },
) {
  const db = await getAppDb();
  const repository = new AnalyticsRepository(db);
  const periodKey = await resolvePeriod(repository, context, input.period);
  const limitations: AiToolLimitation[] = [
    {
      code: "MANUAL_MARKDOWN_ONLY",
      message:
        "La synthèse couvre uniquement les démarques manuelles enregistrées dans l’application.",
    },
  ];
  if (!periodKey) {
    limitations.push({
      code: "NO_DATA",
      message: "Aucune période n’est disponible pour analyser la démarque.",
    });
  }
  const dateRange = periodKey ? monthDateRange(periodKey) : null;
  const [facts, products, dataRevision] = dateRange
    ? await Promise.all([
        listMarkdown({ context, query: dateRange }),
        new ProductRepository(db).listOptions(context),
        repository.getDataRevision(context),
      ])
    : [[], [], null];
  const data = periodKey
    ? summarizeAiMarkdownDrivers({
        facts,
        productLabels: new Map(
          products.map((product) => [product.id, product.label]),
        ),
        periodKey,
        limit: input.limit,
      })
    : null;

  return getMarkdownDriversResultSchema.parse({
    tool: "getMarkdownDrivers",
    readOnly: true,
    storeIds: [context.storeId],
    data,
    evidence:
      data && dataRevision !== null
        ? [
            evidence({
              source: "markdownFacts",
              storeId: context.storeId,
              periodKeys: [data.periodKey],
              recordCount: data.recordCount,
              dataRevision,
              calculationVersion: null,
            }),
          ]
        : [],
    semantics: {
      observed: ["data.totalAmountCents", "data.recordCount"],
      calculated: ["data.byReason[]", "data.byProduct[]"],
      inferred: [],
    },
    limitations,
  });
}

async function executeGetSpaceAllocations(
  context: AuthorizedStoreContext,
) {
  const workspace = await getAllocationWorkspace(context);
  const limitations: AiToolLimitation[] = [];
  if (!workspace.layout) {
    limitations.push({
      code: "LAYOUT_MISSING",
      message: "Aucune version de plan magasin n’est disponible.",
    });
  } else if (!workspace.plan) {
    limitations.push({
      code: "ALLOCATION_PLAN_MISSING",
      message: "Le plan existe, mais aucune allocation produit n’est enregistrée.",
    });
  }
  const productLabelById = new Map(
    workspace.products.map((product) => [product.id, product.label]),
  );
  const data = workspace.layout
    ? {
        layout: {
          id: workspace.layout.id,
          version: workspace.layout.version,
          name: workspace.layout.name,
          status: workspace.layout.status,
          geometryConfirmed: workspace.layout.geometryConfirmed,
          capacity: summarizeLayoutCapacity(workspace.layout),
        },
        plan: workspace.plan
          ? {
              id: workspace.plan.id,
              version: workspace.plan.version,
              name: workspace.plan.name,
              status: workspace.plan.status,
              source: workspace.plan.source,
              modelVersion: workspace.plan.modelVersion,
              basis: workspace.plan.basis,
              evidence: workspace.plan.evidence,
              allocations: workspace.plan.allocations.map((allocation) => ({
                ...allocation,
                productLabel:
                  productLabelById.get(allocation.productId) ??
                  "Produit non disponible",
              })),
              summary: summarizeAllocations({
                capacities: workspace.capacities,
                allocations: workspace.plan.allocations,
              }),
            }
          : null,
      }
    : null;

  return getSpaceAllocationsResultSchema.parse({
    tool: "getSpaceAllocations",
    readOnly: true,
    storeIds: [context.storeId],
    data,
    evidence: [
      ...(workspace.layout
        ? [
            evidence({
              source: "layoutVersions",
              storeId: context.storeId,
              periodKeys: [],
              recordCount: 1,
              dataRevision: workspace.plan?.basis.dataRevision ?? null,
              calculationVersion:
                workspace.plan?.basis.calculationVersion ?? null,
            }),
          ]
        : []),
      ...(workspace.plan
        ? [
            evidence({
              source: "allocationPlans",
              storeId: context.storeId,
              periodKeys: workspace.plan.basis.periodKey
                ? [workspace.plan.basis.periodKey]
                : [],
              recordCount: workspace.plan.allocations.length,
              dataRevision: workspace.plan.basis.dataRevision,
              calculationVersion: workspace.plan.basis.calculationVersion,
            }),
          ]
        : []),
    ],
    semantics: {
      observed: ["data.layout", "data.plan.allocations"],
      calculated: ["data.layout.capacity", "data.plan.summary"],
      inferred: ["data.plan.evidence"],
    },
    limitations,
  });
}

async function executeGetCommercialEvents(
  context: AuthorizedStoreContext,
  input: { from?: string; to?: string; statuses?: Array<"draft" | "published" | "completed" | "cancelled"> },
) {
  const events = filterAiCommercialEvents({
    events: await listCommercialEvents(context),
    ...input,
  });
  const limitations: AiToolLimitation[] = [];
  if (events.length === 0) {
    limitations.push({
      code: "NO_COMMERCIAL_EVENT",
      message: "Aucune opération commerciale ne correspond aux filtres.",
    });
  }

  return getCommercialEventsResultSchema.parse({
    tool: "getCommercialEvents",
    readOnly: true,
    storeIds: [context.storeId],
    data: { events },
    evidence: [
      evidence({
        source: "commercialEvents",
        storeId: context.storeId,
        periodKeys: [],
        recordCount: events.length,
        dataRevision: null,
        calculationVersion: null,
      }),
    ],
    semantics: {
      observed: ["data.events[]"],
      calculated: [],
      inferred: [],
    },
    limitations,
  });
}

async function executeExplainRecommendation(
  context: AuthorizedStoreContext,
  input: { productId: string; period?: string },
) {
  const repository = new AnalyticsRepository(await getAppDb());
  const periodKey = await resolvePeriod(repository, context, input.period);
  const recommendation = periodKey
    ? await previewRecommendation({
        context,
        periodKey,
        productId: input.productId,
      })
    : null;
  const limitations: AiToolLimitation[] = [monthlyGranularity];
  if (!recommendation) {
    limitations.push({
      code: "RECOMMENDATION_UNAVAILABLE",
      message:
        "Aucune recommandation ne peut être expliquée pour ce produit et cette période dans le magasin autorisé.",
    });
  }

  return explainRecommendationResultSchema.parse({
    tool: "explainRecommendation",
    readOnly: true,
    storeIds: [context.storeId],
    data: recommendation,
    evidence: recommendation
      ? [
          evidence({
            source: "salesFacts",
            storeId: context.storeId,
            periodKeys: [
              recommendation.periodKey,
              shiftMonth(recommendation.periodKey, -1),
              shiftMonth(recommendation.periodKey, -12),
              shiftMonth(recommendation.periodKey, -13),
            ],
            recordCount: null,
            dataRevision: recommendation.inputRevision,
            calculationVersion: recommendation.calculationVersion,
          }),
        ]
      : [],
    semantics: {
      observed: ["data.inputs"],
      calculated: ["data.evidence"],
      inferred: [
        "data.type",
        "data.confidence",
        "data.expectedRevenueEffectCents",
      ],
    },
    limitations,
  });
}

export async function executeStoreAiReadTool(input: {
  context: AuthorizedStoreContext;
  request: unknown;
}): Promise<StoreAiReadToolResult> {
  assertStoreAiReadAccess(input.context);
  const request = storeAiReadToolRequestSchema.parse(input.request);

  switch (request.tool) {
    case "getStoreKpis":
      return executeGetStoreKpis(input.context, request.input);
    case "getProductMetrics":
      return executeGetProductMetrics(input.context, request.input);
    case "getProductHistory":
      return executeGetProductHistory(input.context, request.input);
    case "getMarkdownDrivers":
      return executeGetMarkdownDrivers(input.context, request.input);
    case "getSpaceAllocations":
      return executeGetSpaceAllocations(input.context);
    case "getCommercialEvents":
      return executeGetCommercialEvents(input.context, request.input);
    case "explainRecommendation":
      return executeExplainRecommendation(input.context, request.input);
  }
}

export async function executeNetworkAiReadTool(input: {
  contexts: AuthorizedStoreContext[];
  request: unknown;
}): Promise<NetworkAiReadToolResult> {
  const scope = buildAuthorizedAiNetworkScope(input.contexts);
  const request = networkAiReadToolRequestSchema.parse(input.request);
  const data = await getNetworkDashboard(input.contexts, request.input.period);
  const limitations: AiToolLimitation[] = [monthlyGranularity];
  if (!data) {
    limitations.push({
      code: "NO_DATA",
      message: "Aucune donnée réseau n’est disponible pour la période demandée.",
    });
  } else {
    if (data.storeCount === 1) {
      limitations.push({
        code: "SINGLE_STORE_COMPARISON",
        message: "Une comparaison réseau nécessite au moins deux magasins.",
      });
    }
    if (
      data.normalization.eligibleStoreCount < data.storesWithData
    ) {
      limitations.push({
        code: "NORMALIZATION_COVERAGE_PARTIAL",
        message:
          "Les magasins sans géométrie confirmée sont exclus du classement normalisé.",
      });
    }
  }

  return compareAuthorizedStoresResultSchema.parse({
    tool: "compareAuthorizedStores",
    readOnly: true,
    storeIds: scope.storeIds,
    data,
    evidence:
      data?.stores.map((store) =>
        evidence({
          source: "salesFacts",
          storeId: store.storeId,
          periodKeys: [data.periodKey, shiftMonth(data.periodKey, -12)],
          recordCount: null,
          dataRevision: store.dataRevision,
          calculationVersion: data.calculationVersion,
        }),
      ) ?? [],
    semantics: {
      observed: [
        "data.stores[].revenueCents",
        "data.stores[].marginCents",
        "data.stores[].quantity",
        "data.stores[].markdownCents",
        "data.stores[].targetRevenueCents",
      ],
      calculated: [
        "data.stores[].marginRatio",
        "data.stores[].yearOverYearRatio",
        "data.stores[].revenuePerEffectiveMeterCents",
        "data.stores[].normalizedRank",
      ],
      inferred: [],
    },
    limitations,
  });
}
