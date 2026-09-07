import "server-only";

import { createHash } from "node:crypto";

import { parseMercalysFile } from "@/domain/imports/mercalys-parser";
import { getRowAliasKeys } from "@/domain/imports/product-identity";
import type { AliasResolution } from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { ImportRepository } from "@/server/repositories/import-repository";

export async function createMercalysPreview(input: {
  context: AuthorizedStoreContext;
  fileName: string;
  bytes: Uint8Array;
}) {
  const { context, fileName, bytes } = input;
  const preview = await parseMercalysFile(fileName, bytes);
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const repository = new ImportRepository(db, client);
  const uniqueAliases = new Map<
    string,
    {
      externalKey: string;
      sourceLabel: string;
      aliasKeys: string[];
      sourceItm8: string | null;
      sourceEan: string | null;
    }
  >();
  for (const row of preview.rows.filter((candidate) => !candidate.excluded)) {
    const current = uniqueAliases.get(row.externalKey);
    uniqueAliases.set(row.externalKey, {
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
  const resolvedKeys = await repository.findResolvedExternalKeys(
    context,
    [...uniqueAliases.values()],
  );
  const unresolvedAliases = [...uniqueAliases.values()].filter(
    ({ externalKey }) => !resolvedKeys.has(externalKey),
  );
  const fingerprint = createHash("sha256").update(bytes).digest("hex");

  return repository.savePreview({
    context,
    fingerprint,
    fileName,
    fileSize: bytes.byteLength,
    preview,
    unresolvedAliases,
  });
}

export async function commitMercalysImport(input: {
  context: AuthorizedStoreContext;
  importId: string;
  resolutions: AliasResolution[];
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const repository = new ImportRepository(db, client);
  return repository.commit(input);
}
