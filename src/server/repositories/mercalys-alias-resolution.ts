import "server-only";

import {
  ObjectId,
  type ClientSession,
  type Collection,
} from "mongodb";

import { getRowAliasKeys } from "@/domain/imports/product-identity";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export interface MercalysIdentityRow {
  externalKey: string;
  aliasKeys?: string[];
  sourceLabel: string;
  sourceItm8?: string | null;
  sourceEan?: string | null;
}

export interface ProductAliasDocument {
  organizationId: string;
  storeId: ObjectId;
  source: "mercalys";
  externalKey: string;
  sourceLabel: string;
  productId?: ObjectId;
  ignored: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface UnresolvedMercalysIdentity {
  externalKey: string;
  sourceLabel: string;
  aliasKeys: string[];
  sourceItm8: string | null;
  sourceEan: string | null;
}

type AliasTarget = string | null;

export async function loadMercalysAliasTargets(input: {
  collection: Collection<ProductAliasDocument>;
  context: AuthorizedStoreContext;
  rows: MercalysIdentityRow[];
  session?: ClientSession;
}): Promise<Map<string, AliasTarget>> {
  const aliasKeys = [
    ...new Set(input.rows.flatMap((row) => getRowAliasKeys(row))),
  ];
  if (aliasKeys.length === 0) {
    return new Map();
  }

  const aliases = await input.collection
    .find(
      {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        source: "mercalys",
        externalKey: { $in: aliasKeys },
      },
      { session: input.session },
    )
    .toArray();

  return new Map(
    aliases.map((alias) => [
      alias.externalKey,
      alias.ignored ? null : (alias.productId?.toHexString() ?? null),
    ]),
  );
}

function resolveIdentityTarget(
  row: MercalysIdentityRow,
  targets: Map<string, AliasTarget>,
): { found: boolean; target: AliasTarget } {
  const matches = getRowAliasKeys(row)
    .filter((key) => targets.has(key))
    .map((key) => targets.get(key) ?? null);

  if (matches.length === 0) {
    return { found: false, target: null };
  }

  const signatures = new Set(
    matches.map((target) => target ?? "__ignored__"),
  );
  if (signatures.size > 1) {
    throw new Error(`Alias Mercalys contradictoires pour ${row.sourceLabel}`);
  }

  return { found: true, target: matches[0] ?? null };
}

export function resolveMercalysProductIds(input: {
  rows: MercalysIdentityRow[];
  targets: Map<string, AliasTarget>;
}): Map<string, AliasTarget> {
  const result = new Map<string, AliasTarget>();

  for (const row of input.rows) {
    const resolved = resolveIdentityTarget(row, input.targets);
    if (!resolved.found) {
      continue;
    }

    const current = result.get(row.externalKey);
    if (result.has(row.externalKey) && current !== resolved.target) {
      throw new Error(`Identité Mercalys contradictoire pour ${row.sourceLabel}`);
    }
    result.set(row.externalKey, resolved.target);
  }

  return result;
}

export function findUnresolvedMercalysIdentities(input: {
  rows: MercalysIdentityRow[];
  targets: Map<string, AliasTarget>;
}): UnresolvedMercalysIdentity[] {
  const identities = new Map<string, UnresolvedMercalysIdentity>();

  for (const row of input.rows) {
    const current = identities.get(row.externalKey);
    identities.set(row.externalKey, {
      externalKey: row.externalKey,
      sourceLabel: current?.sourceLabel ?? row.sourceLabel,
      aliasKeys: [
        ...new Set([
          ...(current?.aliasKeys ?? []),
          ...getRowAliasKeys(row),
        ]),
      ],
      sourceItm8: current?.sourceItm8 ?? row.sourceItm8 ?? null,
      sourceEan: current?.sourceEan ?? row.sourceEan ?? null,
    });
  }

  return [...identities.values()].filter(
    (identity) => !resolveIdentityTarget(identity, input.targets).found,
  );
}

export async function persistMercalysIdentityAliases(input: {
  collection: Collection<ProductAliasDocument>;
  context: AuthorizedStoreContext;
  rows: MercalysIdentityRow[];
  productIdsByExternalKey: Map<string, AliasTarget>;
  session: ClientSession;
  now: Date;
}): Promise<void> {
  const operations = new Map<
    string,
    { sourceLabel: string; target: AliasTarget }
  >();

  for (const row of input.rows) {
    if (!input.productIdsByExternalKey.has(row.externalKey)) {
      continue;
    }
    const target = input.productIdsByExternalKey.get(row.externalKey) ?? null;
    for (const aliasKey of getRowAliasKeys(row)) {
      const current = operations.get(aliasKey);
      if (current && current.target !== target) {
        throw new Error(`Alias Mercalys contradictoire: ${aliasKey}`);
      }
      operations.set(aliasKey, { sourceLabel: row.sourceLabel, target });
    }
  }

  if (operations.size === 0) {
    return;
  }

  await input.collection.bulkWrite(
    [...operations.entries()].map(([externalKey, value]) => {
      const document: ProductAliasDocument = {
        organizationId: input.context.organizationId,
        storeId: new ObjectId(input.context.storeId),
        source: "mercalys",
        externalKey,
        sourceLabel: value.sourceLabel,
        ignored: value.target === null,
        createdBy: input.context.userId,
        createdAt: input.now,
        ...(value.target ? { productId: new ObjectId(value.target) } : {}),
      };

      return {
        updateOne: {
          filter: {
            organizationId: input.context.organizationId,
            storeId: new ObjectId(input.context.storeId),
            source: "mercalys" as const,
            externalKey,
          },
          update: { $setOnInsert: document },
          upsert: true,
        },
      };
    }),
    { session: input.session },
  );
}
