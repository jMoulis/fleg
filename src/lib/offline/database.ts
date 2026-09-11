import Dexie, { type Table } from "dexie";
import {
  preparedWorkspaceSchema,
  type PreparedWorkspace,
} from "@/domain/offline/schemas";

// Never reuse these tables for pending drafts. They can safely be discarded.
const db = new Dexie("fleg-offline-reference-v1") as Dexie & {
  copies: Table<{ key: string; value: unknown }, string>;
  meta: Table<{ key: string; epoch: number }, string>;
};
db.version(1).stores({ copies: "key", meta: "key" });

export async function preparationEpoch() {
  return (await db.meta.get("session"))?.epoch ?? 0;
}

export async function forgetPreparedWorkspace() {
  await db.transaction("rw", db.copies, db.meta, async () => {
    const epoch = await preparationEpoch();
    await db.meta.put({ key: "session", epoch: epoch + 1 });
    await db.copies.clear();
  });
}

export async function readPreparedWorkspace(): Promise<PreparedWorkspace | null> {
  const record = await db.copies.get("current");
  if (!record) return null;
  // Unknown versions fail closed; rollback never guesses the shape of a newer copy.
  return preparedWorkspaceSchema.parse(record.value);
}

export async function savePreparedWorkspace(
  value: unknown,
  expectedEpoch: number,
) {
  const workspace = preparedWorkspaceSchema.parse(value);
  await db.transaction("rw", db.copies, db.meta, async () => {
    if ((await preparationEpoch()) !== expectedEpoch) {
      throw new Error(
        "La session a changé pendant la préparation. Reconnectez-vous.",
      );
    }
    await db.copies.put({ key: "current", value: workspace });
  });
}
