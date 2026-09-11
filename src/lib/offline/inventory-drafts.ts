import { offlineDb as db } from "./storage";
import { syncRecordSchema } from "@/domain/offline/sync";
import { countIsEditable } from "@/domain/offline/count-lifecycle";
import {
  offlineFreshness,
  preparedWorkspaceSchema,
  sameOfflineIdentity,
  type PreparedWorkspace,
} from "@/domain/offline/schemas";
import {
  createLocalInventoryDraft,
  draftScope,
  localCountLineSchema,
  localInventoryDraftSchema,
  localOperationSchema,
  localViewSchema,
  type LocalCountLine,
  type LocalInventoryDraft,
  type LocalView,
} from "@/domain/offline/inventory-draft";

export async function activeWorkspace(
  expected: PreparedWorkspace,
  now: number,
) {
  const record = await db.copies.get("current");
  const copy = preparedWorkspaceSchema.safeParse(record?.value).data;
  if (
    !copy ||
    !sameOfflineIdentity(copy.identity, expected.identity) ||
    copy.businessDate !== expected.businessDate ||
    !copy.canWriteInventory ||
    offlineFreshness(copy, now) !== "ready"
  ) {
    throw new Error(
      "Brouillon verrouillé : reconnectez-vous et préparez ce magasin et cette date avec les droits de saisie.",
    );
  }
  return copy;
}

function scopedDraft(value: unknown, workspace: PreparedWorkspace) {
  const draft = localInventoryDraftSchema.parse(value);
  if (
    draftScope({
      identity: {
        ...draft.owner,
        sessionBinding: workspace.identity.sessionBinding,
      },
      businessDate: draft.businessDate,
    }) !== draftScope(workspace)
  )
    throw new Error("Périmètre du brouillon invalide");
  return draft;
}

export async function readLocalDraft(
  workspace: PreparedWorkspace,
  now = Date.now(),
) {
  return db.transaction("r", db.copies, db.drafts, async () => {
    await activeWorkspace(workspace, now);
    const record = await db.drafts.get(draftScope(workspace));
    return record ? scopedDraft(record.value, workspace) : null;
  });
}

export async function startLocalDraft(
  workspace: PreparedWorkspace,
  now = Date.now(),
) {
  return db.transaction("rw", db.copies, db.drafts, db.operations, async () => {
    const copy = await activeWorkspace(workspace, now);
    const key = draftScope(copy);
    const existing = await db.drafts.get(key);
    if (existing) return scopedDraft(existing.value, copy); // Never refresh over edits.
    if ((await db.drafts.count()) >= copy.maxLocalDrafts)
      throw new Error(
        "Limite de brouillons locaux atteinte. Reprenez ou supprimez explicitement un ancien brouillon avec son compte propriétaire.",
      );
    const draft = createLocalInventoryDraft(
      copy,
      new Date(now).toISOString(),
      crypto.randomUUID(),
    );
    await db.drafts.add({ key, value: draft });
    await db.operations.add({
      key: `${draft.id}:start`,
      draftId: draft.id,
      value: localOperationSchema.parse({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        draftId: draft.id,
        revision: 0,
        kind: "start",
        line: null,
        savedAt: draft.createdAt,
        status: "local_only",
      }),
    });
    return draft;
  });
}

async function mutate(
  input: {
    workspace: PreparedWorkspace;
    draftId: string;
    expectedRevision: number;
    line?: LocalCountLine;
    view?: LocalView;
  },
  now: number,
) {
  return db.transaction(
    "rw",
    db.copies,
    db.drafts,
    db.operations,
    db.sync,
    async () => {
      await activeWorkspace(input.workspace, now);
      const key = draftScope(input.workspace);
      const draft = scopedDraft(
        (await db.drafts.get(key))?.value,
        input.workspace,
      );
      if (
        draft.id !== input.draftId ||
        draft.revision !== input.expectedRevision
      )
        throw new Error(
          "Conflit local : un autre onglet a modifié ce brouillon. Votre saisie non enregistrée reste affichée ; rechargez explicitement la version enregistrée.",
        );
      if (now < Date.parse(draft.updatedAt))
        throw new Error(
          "Horloge incohérente : rétablissez la date et l’heure automatiques avant de réessayer.",
        );
      if (input.line && !countIsEditable(draft.lifecycle))
        throw new Error(
          "Ce relevé est verrouillé. Vérifiez sa validation ou ouvrez une correction.",
        );
      const savedAt = new Date(now).toISOString();
      const updated: LocalInventoryDraft = {
        ...draft,
        revision: draft.revision + 1,
        updatedAt: savedAt,
      };
      if (input.line) {
        const storedSync = await db.sync.get(key);
        if (storedSync) {
          const sync = syncRecordSchema.parse(storedSync.value);
          if (sync.phase === "conflict")
            throw new Error(
              "Résolvez le conflit serveur avant de modifier ce relevé",
            );
          if (sync.phase === "synchronized")
            await db.sync.put({
              key,
              value: {
                ...sync,
                phase: "pending",
                generation: sync.generation + 1,
              },
            });
        }
        const line = localCountLineSchema.parse(input.line);
        const original = draft.lines.find(
          (value) => value.productId === line.productId,
        );
        if (
          !original ||
          original.label !== line.label ||
          (line.observedAt !== null &&
            (Date.parse(line.observedAt) > now ||
              Date.parse(line.observedAt) < Date.parse(draft.createdAt))) ||
          ((original.reserveCaseCount !== line.reserveCaseCount ||
            original.shelfQuantity !== line.shelfQuantity) &&
            !line.observedAt)
        )
          throw new Error("Article ou heure d’observation invalide");
        updated.lines = draft.lines.map((value) =>
          value.productId === line.productId ? line : value,
        );
        // Coalesce unsent edits only. The sync table freezes a separate payload
        // and its operation ids; acknowledgement never deletes a newer line edit.
        await db.operations.put({
          key: `${draft.id}:line:${line.productId}`,
          draftId: draft.id,
          value: localOperationSchema.parse({
            schemaVersion: 1,
            id: crypto.randomUUID(),
            draftId: draft.id,
            revision: updated.revision,
            kind: "line",
            line,
            savedAt,
            status: "local_only",
          }),
        });
      }
      if (input.view) updated.view = localViewSchema.parse(input.view);
      const parsed = localInventoryDraftSchema.parse(updated);
      await db.drafts.put({ key, value: parsed });
      return parsed;
    },
  );
}

export function saveLocalLine(
  input: {
    workspace: PreparedWorkspace;
    draftId: string;
    expectedRevision: number;
    line: LocalCountLine;
  },
  now = Date.now(),
) {
  return mutate(input, now);
}
export function saveLocalView(
  input: {
    workspace: PreparedWorkspace;
    draftId: string;
    expectedRevision: number;
    view: LocalView;
  },
  now = Date.now(),
) {
  return mutate(input, now);
}

export async function discardLocalDraft(
  workspace: PreparedWorkspace,
  draftId: string,
  expectedRevision: number,
) {
  return db.transaction(
    "rw",
    db.copies,
    db.drafts,
    db.operations,
    db.sync,
    async () => {
      const copy = await activeWorkspace(workspace, Date.now());
      const key = draftScope(workspace);
      const draft = scopedDraft((await db.drafts.get(key))?.value, workspace);
      const sync = await db.sync.get(key);
      if (sync && syncRecordSchema.parse(sync.value).inFlight)
        throw new Error(
          "Résolvez la synchronisation en attente avant de supprimer ce brouillon : le serveur a peut-être reçu l’envoi.",
        );
      if (draft.id !== draftId || draft.revision !== expectedRevision)
        throw new Error(
          "Le brouillon a changé. Rechargez-le avant de confirmer sa suppression.",
        );
      if (
        draft.lifecycle?.phase === "committing" ||
        draft.lifecycle?.phase === "correcting"
      )
        throw new Error(
          "Vérifiez la réponse de validation ou de correction avant de supprimer ce relevé.",
        );
      if (
        (draft.lifecycle?.phase === "committed" ||
          draft.lifecycle?.phase === "server_committed") &&
        (copy.countReference?.status !== "committed" ||
          copy.countReference.id !== draft.lifecycle.count.id)
      )
        throw new Error(
          "Renouvelez le catalogue avant de supprimer cette copie validée : son état doit rester connu après la suppression.",
        );
      await db.operations.where("draftId").equals(draft.id).delete();
      await db.drafts.delete(key);
      await db.sync.delete(key);
    },
  );
}

export async function localDraftDates(workspace: PreparedWorkspace) {
  return db.transaction("r", db.copies, db.drafts, async () => {
    await activeWorkspace(workspace, Date.now());
    return (await db.drafts.toArray())
      .map((record) => localInventoryDraftSchema.parse(record.value))
      .filter(
        (draft) =>
          draft.owner.userId === workspace.identity.userId &&
          draft.owner.organizationId === workspace.identity.organizationId &&
          draft.owner.storeId === workspace.identity.storeId,
      )
      .map((draft) => draft.businessDate)
      .sort();
  });
}
