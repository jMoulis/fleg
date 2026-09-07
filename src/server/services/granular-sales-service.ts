import "server-only";

import {
  calculateDailySalesView,
  calculateMonthlySalesReconciliation,
  calculateWeeklySalesView,
} from "@/domain/analytics/granular-sales";
import {
  defaultGranularSalesRangeDays,
  granularSalesCalculationVersion,
  type GranularSalesRangeQuery,
} from "@/domain/analytics/granular-sales-schemas";
import {
  isoWeekBounds,
  isoWeekKeyFromBusinessDate,
  periodBounds,
  shiftBusinessDate,
} from "@/domain/imports/daily-dates";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb } from "@/server/db/mongo-client";
import { GranularSalesRepository } from "@/server/repositories/granular-sales-repository";

async function resolveReadContext(
  repository: GranularSalesRepository,
  context: AuthorizedStoreContext,
  query: GranularSalesRangeQuery,
) {
  const productId = await repository.requireProduct(context, query.productId);
  if (query.from && query.to) {
    return { from: query.from, to: query.to, productId };
  }

  const latestBusinessDate = await repository.findLatestBusinessDate(
    context,
    productId,
  );
  const to = latestBusinessDate ?? new Date().toISOString().slice(0, 10);
  return {
    from: shiftBusinessDate(to, -(defaultGranularSalesRangeDays - 1)),
    to,
    productId,
  };
}

export async function getDailySalesView(
  context: AuthorizedStoreContext,
  query: GranularSalesRangeQuery,
) {
  const repository = new GranularSalesRepository(await getAppDb());
  const resolved = await resolveReadContext(repository, context, query);
  const [facts, dataRevision] = await Promise.all([
    repository.findDailyFacts({ context, ...resolved }),
    repository.getDataRevision(context),
  ]);
  const view = calculateDailySalesView({
    from: resolved.from,
    to: resolved.to,
    facts,
  });

  return {
    grain: "daily" as const,
    from: resolved.from,
    to: resolved.to,
    productId: query.productId ?? null,
    ...view,
    dataRevision,
    calculationVersion: granularSalesCalculationVersion,
  };
}

export async function getWeeklySalesView(
  context: AuthorizedStoreContext,
  query: GranularSalesRangeQuery,
) {
  const repository = new GranularSalesRepository(await getAppDb());
  const resolved = await resolveReadContext(repository, context, query);
  const firstWeek = isoWeekBounds(
    isoWeekKeyFromBusinessDate(resolved.from),
  );
  const lastWeek = isoWeekBounds(isoWeekKeyFromBusinessDate(resolved.to));
  const [facts, dataRevision] = await Promise.all([
    repository.findDailyFacts({
      context,
      from: firstWeek.startsOn,
      to: lastWeek.endsOn,
      productId: resolved.productId,
    }),
    repository.getDataRevision(context),
  ]);
  const view = calculateWeeklySalesView({
    from: firstWeek.startsOn,
    to: lastWeek.endsOn,
    facts,
  });

  return {
    grain: "weekly" as const,
    from: firstWeek.startsOn,
    to: lastWeek.endsOn,
    productId: query.productId ?? null,
    ...view,
    dataRevision,
    calculationVersion: granularSalesCalculationVersion,
  };
}

export async function getMonthlySalesReconciliation(
  context: AuthorizedStoreContext,
  input: { period: string; productId?: string },
) {
  const repository = new GranularSalesRepository(await getAppDb());
  const productId = await repository.requireProduct(context, input.productId);
  const bounds = periodBounds(input.period);
  const [dailyFacts, monthlyFacts, dataRevision] = await Promise.all([
    repository.findDailyFacts({
      context,
      from: bounds.startsOn,
      to: bounds.endsOn,
      productId,
    }),
    repository.findMonthlyFacts({
      context,
      periodKey: input.period,
      productId,
    }),
    repository.getDataRevision(context),
  ]);
  const reconciliation = calculateMonthlySalesReconciliation({
    periodKey: input.period,
    dailyFacts,
    monthlyFacts,
  });

  return {
    grain: "monthly_reconciliation" as const,
    periodKey: input.period,
    productId: input.productId ?? null,
    ...reconciliation,
    dataRevision,
    calculationVersion: granularSalesCalculationVersion,
  };
}
