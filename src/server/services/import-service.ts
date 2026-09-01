import "server-only";

import { createHash } from "node:crypto";

import { parseMercalysFile } from "@/domain/imports/mercalys-parser";
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
  const uniqueAliases = new Map(
    preview.rows
      .filter((row) => !row.excluded)
      .map((row) => [
        row.externalKey,
        { externalKey: row.externalKey, sourceLabel: row.sourceLabel },
      ]),
  );
  const resolvedKeys = await repository.findResolvedExternalKeys(
    context,
    [...uniqueAliases.keys()],
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
