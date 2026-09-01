import { normalizeExternalKey } from "@/domain/imports/normalization";
import {
  unlabeledMercalysRowLabel,
  type NormalizedMercalysRow,
} from "@/domain/imports/schemas";

const explicitAggregateLabels = new Set([
  "total",
  "total general",
  "total rayon",
  "sous-total",
  "sous total",
  "ensemble",
]);

function approximatelyEqual(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * 0.0001);
}

function isPotentialAggregateLabel(label: string): boolean {
  const normalized = normalizeExternalKey(label);
  return (
    normalized === normalizeExternalKey(unlabeledMercalysRowLabel) ||
    explicitAggregateLabels.has(normalized) ||
    normalized.startsWith("total ") ||
    !/[a-z]/i.test(normalized)
  );
}

export function detectAggregateRows(
  rows: NormalizedMercalysRow[],
): NormalizedMercalysRow[] {
  return rows.map((candidate, candidateIndex) => {
    const normalizedLabel = normalizeExternalKey(candidate.sourceLabel);
    const explicitAggregate =
      explicitAggregateLabels.has(normalizedLabel) ||
      normalizedLabel.startsWith("total ");

    if (!isPotentialAggregateLabel(candidate.sourceLabel)) {
      return candidate;
    }

    const otherRows = rows.filter((_, index) => index !== candidateIndex);
    const otherTotals = otherRows.reduce(
      (totals, row) => ({
        quantity: totals.quantity + row.quantity,
        revenueCents: totals.revenueCents + row.revenueCents,
        marginCents: totals.marginCents + row.marginCents,
      }),
      { quantity: 0, revenueCents: 0, marginCents: 0 },
    );
    const matchingMetrics = [
      approximatelyEqual(candidate.revenueCents, otherTotals.revenueCents, 1),
      approximatelyEqual(candidate.marginCents, otherTotals.marginCents, 1),
      approximatelyEqual(candidate.quantity, otherTotals.quantity, 0.001),
    ].filter(Boolean).length;

    if (!explicitAggregate && matchingMetrics < 2) {
      return candidate;
    }

    return {
      ...candidate,
      excluded: true,
      exclusionReason: explicitAggregate
        ? "Libellé de total détecté"
        : "La ligne réconcilie les agrégats des autres produits",
    };
  });
}
