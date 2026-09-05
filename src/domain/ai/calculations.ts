import { safeRatio, type SalesFactValue } from "@/domain/analytics/calculations";
import type { ProductMetric } from "@/domain/analytics/schemas";
import type { CommercialEvent } from "@/domain/commercial-events/schemas";
import {
  markdownReasonLabels,
  type MarkdownFact,
  type MarkdownReason,
} from "@/domain/markdown/schemas";
import {
  aiProductHistoryPointSchema,
  getMarkdownDriversResultSchema,
} from "@/domain/ai/tools";

function roundedQuantity(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function buildAiProductHistory(input: {
  facts: SalesFactValue[];
  productId: string;
  periodKeys: string[];
}) {
  const factsByPeriod = new Map<
    string,
    { revenueCents: number; marginCents: number; quantity: number }
  >();

  for (const fact of input.facts) {
    if (fact.productId !== input.productId) continue;
    const aggregate = factsByPeriod.get(fact.periodKey) ?? {
      revenueCents: 0,
      marginCents: 0,
      quantity: 0,
    };
    aggregate.revenueCents += fact.revenueCents;
    aggregate.marginCents += fact.marginCents;
    aggregate.quantity += fact.quantity;
    factsByPeriod.set(fact.periodKey, aggregate);
  }

  return input.periodKeys.flatMap((periodKey) => {
    const aggregate = factsByPeriod.get(periodKey);
    if (!aggregate) return [];

    return [
      aiProductHistoryPointSchema.parse({
        periodKey,
        revenueCents: aggregate.revenueCents,
        marginCents: aggregate.marginCents,
        quantity: roundedQuantity(aggregate.quantity),
        marginRatio: safeRatio(
          aggregate.marginCents,
          aggregate.revenueCents,
        ),
      }),
    ];
  });
}

export function selectAiProductMetrics(input: {
  products: ProductMetric[];
  productIds: string[];
  limit: number;
  orderBy: "revenue" | "margin" | "forecast" | "label";
}): ProductMetric[] {
  const selectedProductIds = new Set(input.productIds);
  const filtered =
    selectedProductIds.size === 0
      ? [...input.products]
      : input.products.filter(({ productId }) =>
          selectedProductIds.has(productId),
        );

  return filtered
    .sort((left, right) => {
      switch (input.orderBy) {
        case "margin":
          return right.marginCents - left.marginCents;
        case "forecast":
          return (
            (right.forecastRevenueCents ?? -1) -
            (left.forecastRevenueCents ?? -1)
          );
        case "label":
          return left.label.localeCompare(right.label, "fr");
        case "revenue":
          return right.revenueCents - left.revenueCents;
      }
    })
    .slice(0, input.limit);
}

type MarkdownDrivers = NonNullable<
  ReturnType<typeof getMarkdownDriversResultSchema.parse>["data"]
>;

export function summarizeAiMarkdownDrivers(input: {
  facts: MarkdownFact[];
  productLabels: Map<string, string>;
  periodKey: string;
  limit: number;
}): MarkdownDrivers {
  const totalAmountCents = input.facts.reduce(
    (total, fact) => total + fact.amountCents,
    0,
  );
  const reasonTotals = new Map<
    MarkdownReason,
    { amountCents: number; recordCount: number }
  >();
  const productTotals = new Map<
    string,
    { amountCents: number; recordCount: number }
  >();

  for (const fact of input.facts) {
    const reason = reasonTotals.get(fact.reason) ?? {
      amountCents: 0,
      recordCount: 0,
    };
    reason.amountCents += fact.amountCents;
    reason.recordCount += 1;
    reasonTotals.set(fact.reason, reason);

    const product = productTotals.get(fact.productId) ?? {
      amountCents: 0,
      recordCount: 0,
    };
    product.amountCents += fact.amountCents;
    product.recordCount += 1;
    productTotals.set(fact.productId, product);
  }

  const toShare = (amountCents: number) =>
    safeRatio(amountCents, totalAmountCents);

  return {
    periodKey: input.periodKey,
    totalAmountCents,
    recordCount: input.facts.length,
    byReason: [...reasonTotals.entries()]
      .map(([reason, aggregate]) => ({
        reason,
        label: markdownReasonLabels[reason],
        amountCents: aggregate.amountCents,
        share: toShare(aggregate.amountCents),
        recordCount: aggregate.recordCount,
      }))
      .sort((left, right) => right.amountCents - left.amountCents),
    byProduct: [...productTotals.entries()]
      .map(([productId, aggregate]) => ({
        productId,
        label: input.productLabels.get(productId) ?? "Produit non disponible",
        amountCents: aggregate.amountCents,
        share: toShare(aggregate.amountCents),
        recordCount: aggregate.recordCount,
      }))
      .sort((left, right) => right.amountCents - left.amountCents)
      .slice(0, input.limit),
  };
}

export function filterAiCommercialEvents(input: {
  events: CommercialEvent[];
  from?: string;
  to?: string;
  statuses?: CommercialEvent["status"][];
}): CommercialEvent[] {
  const statuses = input.statuses ? new Set(input.statuses) : null;

  return input.events.filter(
    (event) =>
      (!input.from || event.endsOn >= input.from) &&
      (!input.to || event.startsOn <= input.to) &&
      (!statuses || statuses.has(event.status)),
  );
}
