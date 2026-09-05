import { describe, expect, it } from "vitest";

import {
  buildAiProductHistory,
  selectAiProductMetrics,
  summarizeAiMarkdownDrivers,
} from "@/domain/ai/calculations";
import {
  aiReadToolCatalog,
  storeAiReadToolRequestSchema,
} from "@/domain/ai/tools";
import type { ProductMetric } from "@/domain/analytics/schemas";
import type { MarkdownFact } from "@/domain/markdown/schemas";

const storeId = "66d000000000000000000001";
const productId = "66d000000000000000000010";

function productMetric(
  id: string,
  label: string,
  revenueCents: number,
): ProductMetric {
  return {
    productId: id,
    label,
    periodKey: "2026-08",
    quantity: 10,
    revenueCents,
    marginCents: Math.round(revenueCents * 0.3),
    marginRatio: 0.3,
    priorYearRevenueCents: null,
    yearOverYearRatio: null,
    rawSeasonalityIndex: null,
    retainedSeasonalityIndex: 1,
    forecastRevenueCents: revenueCents,
    abcClass: "A",
    cumulativeRevenueShare: 0.5,
    confidence: "low",
    evidence: ["Période courante observée"],
  };
}

function markdownFact(input: {
  id: string;
  amountCents: number;
  reason: MarkdownFact["reason"];
}): MarkdownFact {
  return {
    id: input.id,
    organizationId: "org-a",
    storeId,
    departmentId: "66d000000000000000000020",
    productId,
    occurredOn: "2026-08-10",
    periodKey: "2026-08",
    amountCents: input.amountCents,
    quantity: null,
    reason: input.reason,
    notes: null,
    source: "manual",
    createdBy: "manager-a",
    createdAt: "2026-08-10T08:00:00.000Z",
  };
}

describe("AI read tool contracts", () => {
  it("exposes only the eight read-only tools planned for AI-01", () => {
    expect(aiReadToolCatalog.map(({ name }) => name)).toEqual([
      "getStoreKpis",
      "getProductMetrics",
      "getProductHistory",
      "getMarkdownDrivers",
      "getSpaceAllocations",
      "getCommercialEvents",
      "compareAuthorizedStores",
      "explainRecommendation",
    ]);
    expect(
      aiReadToolCatalog
        .map(({ name }) => String(name))
        .includes("createDraftActionPlan"),
    ).toBe(false);
  });

  it("rejects tenant identifiers supplied by a model", () => {
    expect(
      storeAiReadToolRequestSchema.safeParse({
        tool: "getStoreKpis",
        storeId: "66d000000000000000000099",
        input: {},
      }).success,
    ).toBe(false);
    expect(
      storeAiReadToolRequestSchema.safeParse({
        tool: "getStoreKpis",
        input: { storeId: "66d000000000000000000099" },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate product identifiers at the tool boundary", () => {
    expect(
      storeAiReadToolRequestSchema.safeParse({
        tool: "getProductMetrics",
        input: { productIds: [productId, productId] },
      }).success,
    ).toBe(false);
  });

  it("builds a chronologically ordered product history from observed facts", () => {
    expect(
      buildAiProductHistory({
        productId,
        periodKeys: ["2026-07", "2026-08"],
        facts: [
          {
            productId,
            periodKey: "2026-08",
            quantity: 12,
            revenueCents: 20_000,
            marginCents: 5_000,
          },
          {
            productId,
            periodKey: "2026-07",
            quantity: 10,
            revenueCents: 10_000,
            marginCents: 3_000,
          },
        ],
      }),
    ).toEqual([
      {
        periodKey: "2026-07",
        quantity: 10,
        revenueCents: 10_000,
        marginCents: 3_000,
        marginRatio: 0.3,
      },
      {
        periodKey: "2026-08",
        quantity: 12,
        revenueCents: 20_000,
        marginCents: 5_000,
        marginRatio: 0.25,
      },
    ]);
  });

  it("ranks only authorized-store product metrics and honors the result limit", () => {
    const selected = selectAiProductMetrics({
      products: [
        productMetric(productId, "Banane", 20_000),
        productMetric("66d000000000000000000011", "Pomme", 30_000),
      ],
      productIds: [],
      limit: 1,
      orderBy: "revenue",
    });

    expect(selected.map(({ label }) => label)).toEqual(["Pomme"]);
  });

  it("keeps markdown totals observed and derives explainable shares", () => {
    const result = summarizeAiMarkdownDrivers({
      periodKey: "2026-08",
      facts: [
        markdownFact({
          id: "66d000000000000000000101",
          amountCents: 3_000,
          reason: "quality",
        }),
        markdownFact({
          id: "66d000000000000000000102",
          amountCents: 1_000,
          reason: "damaged",
        }),
      ],
      productLabels: new Map([[productId, "Banane"]]),
      limit: 10,
    });

    expect(result.totalAmountCents).toBe(4_000);
    expect(result.byReason[0]).toMatchObject({
      reason: "quality",
      amountCents: 3_000,
      share: 0.75,
    });
    expect(result.byProduct[0]).toMatchObject({
      productId,
      label: "Banane",
      amountCents: 4_000,
      share: 1,
    });
  });
});
