import Dexie, { type Table } from "dexie";

export const offlineDb = new Dexie("fleg-offline-reference-v1") as Dexie & {
  copies: Table<{ key: string; value: unknown }, string>;
  meta: Table<{ key: string; epoch: number }, string>;
  drafts: Table<{ key: string; value: unknown }, string>;
  operations: Table<{ key: string; draftId: string; value: unknown }, string>;
};
offlineDb.version(1).stores({ copies: "key", meta: "key" });
// Separate durable tables: reference invalidation never deletes pending work.
offlineDb.version(2).stores({ drafts: "key", operations: "key,draftId" });
