import "server-only";

import { createHash } from "node:crypto";

import { parseDailyMercalysFile } from "@/domain/imports/mercalys-daily-parser";
import type { AliasResolution } from "@/domain/imports/schemas";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { DailySalesImportRepository } from "@/server/repositories/daily-sales-import-repository";

export async function createDailyMercalysPreview(input: {
  context: AuthorizedStoreContext;
  fileName: string;
  bytes: Uint8Array;
}) {
  const preview = await parseDailyMercalysFile(input.fileName, input.bytes);
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const repository = new DailySalesImportRepository(db, client);
  const unresolvedAliases = await repository.findUnresolvedAliases(
    input.context,
    preview,
  );
  const fingerprint = createHash("sha256").update(input.bytes).digest("hex");

  return repository.savePreview({
    context: input.context,
    fingerprint,
    fileName: input.fileName,
    fileSize: input.bytes.byteLength,
    preview,
    unresolvedAliases,
  });
}

export async function commitDailyMercalysImport(input: {
  context: AuthorizedStoreContext;
  importId: string;
  resolutions: AliasResolution[];
  requestId: string;
}) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new DailySalesImportRepository(db, client).commit(input);
}
