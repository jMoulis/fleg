import type {
  AliasResolution,
  NormalizedMercalysRow,
} from "@/domain/imports/schemas";

export class AliasResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AliasResolutionError";
  }
}

export function validateAliasResolutions(
  unresolvedExternalKeys: string[],
  resolutions: AliasResolution[],
): Map<string, AliasResolution> {
  const expected = new Set(unresolvedExternalKeys);
  const mapped = new Map<string, AliasResolution>();

  for (const resolution of resolutions) {
    if (!expected.has(resolution.externalKey)) {
      throw new AliasResolutionError(
        `Alias inattendu: ${resolution.externalKey}`,
      );
    }

    if (mapped.has(resolution.externalKey)) {
      throw new AliasResolutionError(
        `Résolution dupliquée: ${resolution.externalKey}`,
      );
    }

    mapped.set(resolution.externalKey, resolution);
  }

  const missing = unresolvedExternalKeys.filter((key) => !mapped.has(key));
  if (missing.length > 0) {
    throw new AliasResolutionError(
      `Résolutions manquantes: ${missing.join(", ")}`,
    );
  }

  return mapped;
}

export interface PreparedSalesFact {
  productId: string;
  periodKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

export function groupImportFacts(
  rows: NormalizedMercalysRow[],
  productIdsByExternalKey: Map<string, string | null>,
): PreparedSalesFact[] {
  const grouped = new Map<string, PreparedSalesFact>();

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

    const key = `${productId}:${row.periodKey}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      productId,
      periodKey: row.periodKey,
      quantity: (existing?.quantity ?? 0) + row.quantity,
      revenueCents: (existing?.revenueCents ?? 0) + row.revenueCents,
      marginCents: (existing?.marginCents ?? 0) + row.marginCents,
    });
  }

  return [...grouped.values()];
}
