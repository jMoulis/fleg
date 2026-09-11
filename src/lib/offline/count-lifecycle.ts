import { z } from "zod";
import {
  inventoryCommitResponseSchema,
  inventoryCountResponseSchema,
  inventoryCountSchema,
  type InventoryCount,
} from "@/domain/inventory/schemas";
import {
  countReferenceSchema,
  countIsEditable,
  type CountLifecycle,
} from "@/domain/offline/count-lifecycle";
import {
  draftScope,
  createLocalInventoryDraft,
  localInventoryDraftSchema,
  localOperationSchema,
  type LocalInventoryDraft,
} from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";
import { syncRecordSchema } from "@/domain/offline/sync";
import { offlineDb as db } from "./storage";
import {
  activeWorkspace,
  readLocalDraft,
  startLocalDraft,
} from "./inventory-drafts";
import {
  enableInventorySync,
  readInventorySync,
  synchronizeInventory,
} from "./inventory-sync";

const tables = [db.copies, db.drafts, db.operations, db.sync];
const messageSchema = z.object({ message: z.string() });
const countResponse = z.object({ count: inventoryCountSchema.nullable() });

function storedSync(
  sync: NonNullable<Awaited<ReturnType<typeof readInventorySync>>>,
) {
  const { pendingLines: _pendingLines, ...record } = sync;
  void _pendingLines;
  return record;
}

function assertScope(workspace: PreparedWorkspace, count: InventoryCount) {
  if (
    count.organizationId !== workspace.identity.organizationId ||
    count.storeId !== workspace.identity.storeId ||
    count.businessDate !== workspace.businessDate
  )
    throw new Error("Réponse de comptage hors périmètre");
}
async function pendingLines(draft: LocalInventoryDraft) {
  return (await db.operations.where("draftId").equals(draft.id).toArray())
    .map((row) => localOperationSchema.parse(row.value))
    .filter((op) => op.kind === "line");
}

export async function observeCommittedConflict(
  workspace: PreparedWorkspace,
  count: InventoryCount,
) {
  assertScope(workspace, count);
  if (count.status !== "committed") return;
  await db.transaction("rw", tables, async () => {
    const draft = await readLocalDraft(workspace);
    if (draft && countIsEditable(draft.lifecycle))
      await persist(workspace, draft, {
        phase: "server_committed",
        count: countReferenceSchema.parse(count),
      });
  });
}
async function persist(
  workspace: PreparedWorkspace,
  draft: LocalInventoryDraft,
  lifecycle: CountLifecycle,
  count?: InventoryCount,
) {
  const byId = new Map(count?.lines.map((line) => [line.productId, line]));
  const next = localInventoryDraftSchema.parse({
    ...draft,
    schemaVersion: 3,
    lifecycle:
      lifecycle.phase === "editing" && count
        ? { ...lifecycle, count: countReferenceSchema.parse(count) }
        : lifecycle,
    revision: draft.revision + 1,
    ...(count
      ? {
          serverCountId: count.id,
          baseRevision: count.revision,
          lines: draft.lines.map((line) => {
            const remote = byId.get(line.productId);
            return {
              ...line,
              ...(remote
                ? {
                    familyCode: remote.familyCode,
                    stockUnit: remote.stockUnit,
                    packSize: String(remote.packSize ?? ""),
                  }
                : {}),
              reserveCaseCount: String(remote?.reserveCaseCount ?? ""),
              shelfQuantity: String(remote?.shelfQuantity ?? ""),
              // Reference values are not a new observation on this device.
              observedAt: null,
            };
          }),
        }
      : {}),
  });
  await db.drafts.put({ key: draftScope(workspace), value: next });
  return next;
}

/** Upgrade in place, never delete a legacy draft and never infer its sync consent. */
export async function openUnifiedCount(
  workspace: PreparedWorkspace,
  start = false,
  consent = false,
) {
  if (start) await startLocalDraft(workspace);
  return db.transaction("rw", tables, async () => {
    let draft = await readLocalDraft(workspace);
    if (!draft) return null;
    const knownIds = new Set(draft.lines.map((line) => line.productId));
    const added = createLocalInventoryDraft(
      workspace,
      draft.createdAt,
      draft.id,
    ).lines.filter((line) => !knownIds.has(line.productId));
    if (added.length) {
      draft = await persist(
        workspace,
        { ...draft, lines: [...draft.lines, ...added] },
        draft.lifecycle ?? { phase: "editing" },
      );
    }
    const reference = workspace.countReference;
    const sync = await readInventorySync(workspace);
    const knownVersion =
      draft.lifecycle?.phase === "editing"
        ? draft.lifecycle.count?.version
        : undefined;
    const knownCommitted =
      reference?.status === "committed" &&
      (!knownVersion || reference.version >= knownVersion);
    if (
      !draft.lifecycle ||
      (countIsEditable(draft.lifecycle) && knownCommitted)
    ) {
      const changed =
        (await pendingLines(draft)).length > 0 || Boolean(sync?.inFlight);
      draft = await persist(
        workspace,
        draft,
        knownCommitted
          ? {
              phase: changed ? "server_committed" : "committed",
              count: reference,
            }
          : {
              phase: "editing",
              ...(reference?.status === "draft" ? { count: reference } : {}),
            },
      );
      if (knownCommitted && !changed) {
        // This copy is a server reference, never a new physical observation.
        const lines = new Map(
          workspace.products.map((p) => [p.id, p.countLine]),
        );
        draft = localInventoryDraftSchema.parse({
          ...draft,
          serverCountId: reference.id,
          baseRevision: reference.revision,
          lines: draft.lines.map((line) => {
            const remote = lines.get(line.productId);
            return {
              ...line,
              ...(remote
                ? {
                    familyCode: remote.familyCode,
                    stockUnit: remote.stockUnit,
                    packSize: String(remote.packSize ?? ""),
                  }
                : {}),
              reserveCaseCount: String(remote?.reserveCaseCount ?? ""),
              shelfQuantity: String(remote?.shelfQuantity ?? ""),
              observedAt: null,
            };
          }),
        });
        await db.drafts.put({ key: draftScope(workspace), value: draft });
      }
    }
    if (consent && countIsEditable(draft.lifecycle)) {
      await enableInventorySync(workspace, draft.id, draft.revision);
      draft = (await readLocalDraft(workspace))!;
    }
    return draft;
  });
}

async function request(
  workspace: PreparedWorkspace,
  path: string,
  body?: unknown,
) {
  await activeWorkspace(workspace, Date.now());
  const response = await fetch(
    `/api/stores/${workspace.identity.storeId}/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-fleg-session-binding": workspace.identity.sessionBinding,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload: unknown = await response.json();
  await activeWorkspace(workspace, Date.now());
  return { response, payload };
}

export async function readCountForReview(workspace: PreparedWorkspace) {
  await synchronizeInventory(workspace, true);
  const base = await readLocalDraft(workspace);
  if (!base || !countIsEditable(base.lifecycle))
    throw new Error("Vérifiez d’abord l’état de ce relevé.");
  const { response, payload } = await request(
    workspace,
    `offline/sync?businessDate=${workspace.businessDate}`,
  );
  if (!response.ok)
    throw new Error(
      "Revue indisponible : reconnectez-vous avec le compte propriétaire.",
    );
  const { count } = countResponse.parse(payload);
  if (!count)
    throw new Error(
      "Comptez ou configurez au moins un article avant la vérification.",
    );
  assertScope(workspace, count);
  let conflict = false;
  await db.transaction("rw", tables, async () => {
    const draft = await readLocalDraft(workspace);
    if (!draft || draft.id !== base.id || draft.revision !== base.revision)
      throw new Error("Le relevé a changé. Relancez la vérification.");
    const sync = await readInventorySync(workspace);
    const changed =
      (await pendingLines(draft)).length > 0 || Boolean(sync?.inFlight);
    if (
      count.lines.some(
        (line) =>
          !draft.lines.some((local) => local.productId === line.productId),
      )
    )
      throw new Error(
        "Le catalogue a changé. Renouvelez-le avant de vérifier tous les articles de ce relevé.",
      );
    if (count.status === "committed") {
      await persist(
        workspace,
        draft,
        {
          phase: changed ? "server_committed" : "committed",
          count: countReferenceSchema.parse(count),
        },
        changed ? undefined : count,
      );
      conflict = changed;
      return;
    }
    if (
      changed ||
      (sync && ["conflict", "locked", "failed"].includes(sync.phase))
    )
      throw new Error(
        "Des saisies restent à envoyer, corriger ou comparer. Le stock n’est pas validé.",
      );
    await persist(workspace, draft, { phase: "editing" }, count);
    if (sync)
      await db.sync.put({
        key: draftScope(workspace),
        value: syncRecordSchema.parse({
          ...storedSync(sync),
          serverCountId: count.id,
          serverRevision: count.revision,
          generation: sync.generation + 1,
        }),
      });
  });
  if (conflict)
    throw new Error(
      "Le serveur a déjà validé ce relevé. Vos saisies sont conservées ; ouvrez une correction pour les comparer.",
    );
  return count;
}

/** Durable intent + frozen local edits, before the first network write. */
export async function prepareCountCommit(
  workspace: PreparedWorkspace,
  expectedRevision: number,
  count: InventoryCount,
) {
  assertScope(workspace, count);
  return db.transaction("rw", tables, async () => {
    const draft = await readLocalDraft(workspace);
    if (
      !draft ||
      draft.revision !== expectedRevision ||
      !countIsEditable(draft.lifecycle)
    )
      throw new Error("Le relevé a changé ; vérifiez-le de nouveau.");
    const sync = await readInventorySync(workspace);
    if (
      !sync ||
      sync.inFlight ||
      ["conflict", "locked", "failed"].includes(sync.phase) ||
      (await pendingLines(draft)).length ||
      count.status !== "draft" ||
      sync.serverCountId !== count.id ||
      sync.serverRevision !== count.revision
    )
      throw new Error("La version vérifiée n’est pas prête à être validée.");
    return persist(workspace, draft, {
      phase: "committing",
      count: countReferenceSchema.parse(count),
      idempotencyKey: crypto.randomUUID(),
      rejected: false,
    });
  });
}

export async function sendCountCommit(workspace: PreparedWorkspace) {
  const draft = await readLocalDraft(workspace);
  const intent = draft?.lifecycle;
  if (!draft || intent?.phase !== "committing")
    throw new Error("Aucune validation à vérifier.");
  const { response, payload } = await request(
    workspace,
    `inventory/counts/${intent.count.id}/commit`,
    {
      idempotencyKey: intent.idempotencyKey,
      basedOnRevision: intent.count.revision,
    },
  );
  if (!response.ok) {
    // Only a definitive rejection can unfreeze the intent. Timeouts/5xx remain replayable.
    if ([400, 409].includes(response.status))
      await db.transaction("rw", tables, async () => {
        const current = await readLocalDraft(workspace);
        if (
          current?.lifecycle?.phase === "committing" &&
          current.lifecycle.idempotencyKey === intent.idempotencyKey
        )
          await persist(workspace, current, { ...intent, rejected: true });
      });
    throw new Error(
      messageSchema.safeParse(payload).data?.message ??
        "Validation non confirmée. Réessayez ; vos saisies sont conservées.",
    );
  }
  const count = inventoryCommitResponseSchema.parse(payload).result.count;
  assertScope(workspace, count);
  if (
    count.id !== intent.count.id ||
    count.status !== "committed" ||
    count.revision !== intent.count.revision + 1
  )
    throw new Error(
      "Réponse de validation incohérente. Le relevé reste verrouillé.",
    );
  await db.transaction("rw", tables, async () => {
    const current = await readLocalDraft(workspace);
    if (
      current?.lifecycle?.phase === "committed" &&
      current.lifecycle.count.id === count.id
    )
      return;
    if (
      current?.lifecycle?.phase !== "committing" ||
      current.lifecycle.idempotencyKey !== intent.idempotencyKey
    )
      throw new Error("La validation locale a changé.");
    await persist(
      workspace,
      current,
      { phase: "committed", count: countReferenceSchema.parse(count) },
      count,
    );
  });
  return count;
}

export async function reopenRejectedCommit(workspace: PreparedWorkspace) {
  await db.transaction("rw", tables, async () => {
    const draft = await readLocalDraft(workspace);
    if (draft?.lifecycle?.phase !== "committing" || !draft.lifecycle.rejected)
      throw new Error(
        "Le résultat de la validation doit d’abord être confirmé.",
      );
    await persist(workspace, draft, { phase: "editing" });
  });
}

export async function prepareCountCorrection(workspace: PreparedWorkspace) {
  return db.transaction("rw", tables, async () => {
    const draft = await readLocalDraft(workspace);
    const lifecycle = draft?.lifecycle;
    if (
      !draft ||
      !lifecycle ||
      (lifecycle.phase !== "committed" &&
        lifecycle.phase !== "server_committed")
    )
      throw new Error(
        "Vérifiez le relevé validé avant d’ouvrir sa correction.",
      );
    await persist(workspace, draft, {
      phase: "correcting",
      count: lifecycle.count,
      idempotencyKey: crypto.randomUUID(),
      preserveLocal: lifecycle.phase === "server_committed",
    });
  });
}

export async function sendCountCorrection(workspace: PreparedWorkspace) {
  const draft = await readLocalDraft(workspace);
  const intent = draft?.lifecycle;
  if (!draft || intent?.phase !== "correcting")
    throw new Error("Aucune correction à reprendre.");
  const { response, payload } = await request(workspace, "inventory/counts", {
    businessDate: workspace.businessDate,
    idempotencyKey: intent.idempotencyKey,
  });
  if (!response.ok)
    throw new Error(
      messageSchema.safeParse(payload).data?.message ??
        "Correction non confirmée. Réessayez avec du réseau.",
    );
  const receipt = inventoryCountResponseSchema.parse(payload).count;
  assertScope(workspace, receipt);
  if (receipt.status !== "draft" || receipt.version <= intent.count.version)
    throw new Error("La correction reçue doit être relue sur le serveur.");
  // A replayed create receipt is historical: another device may already have
  // validated it. Reconcile current state before unlocking local editing.
  const latest = await request(
    workspace,
    `offline/sync?businessDate=${workspace.businessDate}`,
  );
  if (!latest.response.ok)
    throw new Error(
      "Correction ouverte, mais sa version actuelle reste à vérifier. Réessayez.",
    );
  const count = countResponse.parse(latest.payload).count;
  if (!count || count.version < receipt.version)
    throw new Error("Version actuelle de la correction incohérente.");
  assertScope(workspace, count);
  await db.transaction("rw", tables, async () => {
    const current = await readLocalDraft(workspace);
    if (
      current?.lifecycle?.phase !== "correcting" ||
      current.lifecycle.idempotencyKey !== intent.idempotencyKey
    )
      throw new Error("La correction locale a changé.");
    if (count.status === "committed") {
      await persist(
        workspace,
        current,
        {
          phase: intent.preserveLocal ? "server_committed" : "committed",
          count: countReferenceSchema.parse(count),
        },
        intent.preserveLocal ? undefined : count,
      );
      return;
    }
    const next = await persist(
      workspace,
      current,
      { phase: "editing", count: countReferenceSchema.parse(count) },
      intent.preserveLocal ? undefined : count,
    );
    await enableInventorySync(workspace, next.id, next.revision);
    const sync = (await readInventorySync(workspace))!;
    await db.sync.put({
      key: draftScope(workspace),
      value: syncRecordSchema.parse({
        ...storedSync(sync),
        generation: sync.generation + 1,
        ...(intent.preserveLocal
          ? {
              phase: "conflict",
              conflict: {
                kind: "conflict",
                current: count,
                message: "Comparez vos saisies avec la correction ouverte.",
              },
            }
          : {
              serverCountId: count.id,
              serverRevision: count.revision,
              inFlight: null,
              conflict: null,
              phase: "synchronized",
              receivedAt: new Date().toISOString(),
              attempts: 0,
              nextAttemptAt: 0,
            }),
        message: "Correction ouverte · l’ancien stock validé reste inchangé",
      }),
    });
  });
  return count;
}
