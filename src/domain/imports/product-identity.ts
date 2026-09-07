import { normalizeExternalKey, normalizeText } from "@/domain/imports/normalization";

export interface MercalysProductIdentity {
  externalKey: string;
  aliasKeys: string[];
  sourceItm8: string | null;
  sourceEan: string | null;
}

function normalizeIdentifier(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const identifier = normalizeText(String(value));
  return identifier === "" ? null : identifier;
}

export function buildMercalysProductIdentity(input: {
  sourceLabel: string;
  rawItm8?: unknown;
  rawEan?: unknown;
}): MercalysProductIdentity {
  const sourceItm8 = normalizeIdentifier(input.rawItm8);
  const sourceEan = normalizeIdentifier(input.rawEan);
  const labelKey = normalizeExternalKey(input.sourceLabel);
  const aliasKeys = [
    sourceItm8 ? `itm8:${sourceItm8}` : null,
    sourceEan ? `ean:${sourceEan}` : null,
    labelKey,
  ].filter((key): key is string => key !== null);

  return {
    externalKey: aliasKeys[0]!,
    aliasKeys: [...new Set(aliasKeys)],
    sourceItm8,
    sourceEan,
  };
}

export function getRowAliasKeys(row: {
  externalKey: string;
  aliasKeys?: string[];
}): string[] {
  return row.aliasKeys?.length ? row.aliasKeys : [row.externalKey];
}
