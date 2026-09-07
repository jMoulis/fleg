import type { PreparedDailySalesFact } from "@/domain/imports/daily-import-commit";

export interface ActiveDailySalesFactValue {
  id: string;
  productId: string;
  businessDate: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  purchaseCents: number | null;
  rceCents: number | null;
  vatCents: number | null;
  version: number;
}

export interface PlannedDailySalesFactVersion {
  fact: PreparedDailySalesFact;
  version: number;
  supersedesFactId: string | null;
}

function hasSameObservedValues(
  current: ActiveDailySalesFactValue,
  next: PreparedDailySalesFact,
): boolean {
  return (
    current.quantity === next.quantity &&
    current.revenueCents === next.revenueCents &&
    current.marginCents === next.marginCents &&
    current.purchaseCents === next.purchaseCents &&
    current.rceCents === next.rceCents &&
    current.vatCents === next.vatCents
  );
}

export function planDailyFactVersions(input: {
  preparedFacts: PreparedDailySalesFact[];
  activeFacts: ActiveDailySalesFactValue[];
}): {
  changed: PlannedDailySalesFactVersion[];
  unchangedCount: number;
} {
  const activeByKey = new Map(
    input.activeFacts.map((fact) => [
      `${fact.productId}:${fact.businessDate}`,
      fact,
    ]),
  );
  const changed: PlannedDailySalesFactVersion[] = [];
  let unchangedCount = 0;

  for (const fact of input.preparedFacts) {
    const current = activeByKey.get(`${fact.productId}:${fact.businessDate}`);
    if (current && hasSameObservedValues(current, fact)) {
      unchangedCount += 1;
      continue;
    }
    changed.push({
      fact,
      version: (current?.version ?? 0) + 1,
      supersedesFactId: current?.id ?? null,
    });
  }

  return { changed, unchangedCount };
}
