import { AliasResolutionError } from "@/domain/imports/import-commit";
import type { NormalizedDailyMercalysRow } from "@/domain/imports/daily-schemas";

export interface PreparedDailySalesFact {
  productId: string;
  businessDate: string;
  periodKey: string;
  isoWeekKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  purchaseCents: number | null;
  rceCents: number | null;
  vatCents: number | null;
}

function addOptionalMoney(
  current: number | null,
  next: number | null,
): number | null {
  return current === null || next === null ? null : current + next;
}

export function groupDailyImportFacts(
  rows: NormalizedDailyMercalysRow[],
  productIdsByExternalKey: Map<string, string | null>,
): PreparedDailySalesFact[] {
  const grouped = new Map<string, PreparedDailySalesFact>();

  for (const row of rows) {
    if (row.excluded) {
      continue;
    }

    const productId = productIdsByExternalKey.get(row.externalKey);
    if (productId === null) {
      continue;
    }
    if (!productId) {
      throw new AliasResolutionError(`Alias non résolu: ${row.externalKey}`);
    }

    const key = `${productId}:${row.businessDate}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      productId,
      businessDate: row.businessDate,
      periodKey: row.periodKey,
      isoWeekKey: row.isoWeekKey,
      quantity: (existing?.quantity ?? 0) + row.quantity,
      revenueCents: (existing?.revenueCents ?? 0) + row.revenueCents,
      marginCents: (existing?.marginCents ?? 0) + row.marginCents,
      purchaseCents: existing
        ? addOptionalMoney(existing.purchaseCents, row.purchaseCents)
        : row.purchaseCents,
      rceCents: existing
        ? addOptionalMoney(existing.rceCents, row.rceCents)
        : row.rceCents,
      vatCents: existing
        ? addOptionalMoney(existing.vatCents, row.vatCents)
        : row.vatCents,
    });
  }

  return [...grouped.values()];
}
