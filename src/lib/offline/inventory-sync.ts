import { z } from "zod";
import { offlineDb as db } from "./storage";
import { activeWorkspace, readLocalDraft } from "./inventory-drafts";
import {
  countIsEditable,
  countReferenceSchema,
} from "@/domain/offline/count-lifecycle";
import {
  draftScope,
  localInventoryDraftSchema,
  localOperationSchema,
  toSyncLine,
  type LocalCountLine,
} from "@/domain/offline/inventory-draft";
import {
  inventoryCountSchema,
  type InventoryCount,
} from "@/domain/inventory/schemas";
import {
  inventorySyncInputSchema,
  syncConflictSchema,
  syncReceiptSchema,
  syncRecordSchema,
  syncTransportPolicy,
  nextSyncRetry,
  type SyncRecord,
} from "@/domain/offline/sync";
import {
  offlineAccessSchema,
  sameOfflineIdentity,
  type PreparedWorkspace,
} from "@/domain/offline/schemas";

async function writeRecord(key: string, value: SyncRecord) {
  await db.sync.put({ key, value: syncRecordSchema.parse(value) });
}
async function recordFor(workspace: PreparedWorkspace) {
  const draft = await readLocalDraft(workspace);
  const row = await db.sync.get(draftScope(workspace));
  if (!draft || !row) return null;
  const sync = syncRecordSchema.parse(row.value);
  if (
    sync.draftId !== draft.id ||
    JSON.stringify(sync.owner) !== JSON.stringify(draft.owner)
  )
    throw new Error("Périmètre de synchronisation incohérent");
  return { draft, sync };
}
export async function readInventorySync(workspace: PreparedWorkspace) {
  return db.transaction(
    "r",
    db.copies,
    db.drafts,
    db.sync,
    db.operations,
    async () => {
      const state = await recordFor(workspace);
      if (!state) return null;
      const operations = (
        await db.operations.where("draftId").equals(state.draft.id).toArray()
      ).map((row) => localOperationSchema.parse(row.value));
      return {
        ...state.sync,
        pendingLines: operations.flatMap((op) =>
          op.kind === "line" && op.line ? [op.line] : [],
        ),
      };
    },
  );
}
export async function enableInventorySync(
  workspace: PreparedWorkspace,
  draftId: string,
  revision: number,
) {
  return db.transaction("rw", db.copies, db.drafts, db.sync, async () => {
    const draft = await readLocalDraft(workspace);
    if (!draft || draft.id !== draftId || draft.revision !== revision)
      throw new Error("Le brouillon a changé ; relisez-le");
    const key = draftScope(workspace);
    if (await db.sync.get(key)) return;
    // Old TECH-02 readers reject v2 instead of editing/deleting in-flight work.
    await db.drafts.put({
      key,
      value: {
        ...draft,
        schemaVersion: draft.schemaVersion === 3 ? 3 : 2,
        revision: draft.revision + 1,
      },
    });
    await writeRecord(key, {
      schemaVersion: 1,
      draftId,
      owner: draft.owner,
      generation: 0,
      serverCountId: draft.serverCountId,
      serverRevision: draft.baseRevision,
      phase: "pending",
      inFlight: null,
      conflict: null,
      message: "En attente du réseau",
      rejected: false,
      attempts: 0,
      nextAttemptAt: 0,
      receivedAt: null,
    });
  });
}

/** Freeze before any network call. No network promises inside an IDB transaction. */
export async function prepareSyncOperation(
  workspace: PreparedWorkspace,
  force = false,
) {
  return db.transaction(
    "rw",
    db.copies,
    db.drafts,
    db.operations,
    db.sync,
    async () => {
      const state = await recordFor(workspace);
      if (
        !state ||
        state.sync.phase === "conflict" ||
        !countIsEditable(state.draft.lifecycle)
      )
        return null;
      const { draft } = state;
      let { sync } = state;
      const now = Date.now();
      if (
        !force &&
        (["failed", "locked"].includes(sync.phase) || sync.nextAttemptAt > now)
      )
        return null;
      if (force) sync = { ...sync, attempts: 0 };
      if (
        !force &&
        sync.inFlight &&
        sync.attempts >= syncTransportPolicy.maxAttempts
      ) {
        await writeRecord(draftScope(workspace), {
          ...sync,
          phase: "failed",
          generation: sync.generation + 1,
          message:
            "Nombre maximal de tentatives atteint. Les saisies restent conservées ; réessayez manuellement.",
        });
        return null;
      }
      if (!sync.inFlight) {
        const pending = (
          await db.operations.where("draftId").equals(draft.id).toArray()
        ).map((row) => localOperationSchema.parse(row.value));
        const lines = [];
        const operationIds: Record<string, string> = {};
        let incomplete = 0;
        for (const operation of pending) {
          if (operation.kind !== "line" || !operation.line) continue;
          try {
            lines.push(toSyncLine(operation.line));
            operationIds[operation.line.productId] = operation.id;
          } catch {
            incomplete++;
          }
        }
        if (!lines.length) {
          const message = incomplete
            ? `${incomplete} ligne(s) à corriger ou à confirmer avant envoi`
            : sync.receivedAt
              ? "Brouillon synchronisé · stock non validé"
              : "Aucune saisie modifiée à envoyer";
          const phase =
            !incomplete && sync.receivedAt ? "synchronized" : "pending";
          if (sync.message !== message || sync.phase !== phase)
            await writeRecord(draftScope(workspace), {
              ...sync,
              phase,
              message,
              generation: sync.generation + 1,
            });
          return null;
        }
        sync = {
          ...sync,
          inFlight: {
            operationIds,
            payload: inventorySyncInputSchema.parse({
              schemaVersion: 1,
              operationId: crypto.randomUUID(),
              draftId: draft.id,
              owner: draft.owner,
              businessDate: draft.businessDate,
              timeZone: draft.timeZone,
              createdAt: draft.createdAt,
              baseCountId: sync.serverCountId,
              basedOnRevision: sync.serverRevision,
              lines,
            }),
          },
        };
      }
      const sending: SyncRecord = {
        ...sync,
        phase: "syncing",
        attempts: sync.attempts + 1,
        nextAttemptAt: 0,
        generation: sync.generation + 1,
        message: "Envoi en cours · stock non validé",
      };
      await writeRecord(draftScope(workspace), sending);
      return sending.inFlight!.payload;
    },
  );
}

export async function acknowledgeInventorySync(
  workspace: PreparedWorkspace,
  value: unknown,
) {
  const receipt = syncReceiptSchema.parse(value);
  return db.transaction(
    "rw",
    db.copies,
    db.drafts,
    db.operations,
    db.sync,
    async () => {
      const state = await recordFor(workspace);
      if (!state?.sync.inFlight) throw new Error("Envoi local introuvable");
      const { sync, draft } = state;
      const flight = sync.inFlight!;
      if (
        receipt.operationId !== flight.payload.operationId ||
        receipt.draftId !== draft.id ||
        receipt.businessDate !== draft.businessDate ||
        JSON.stringify(receipt.owner) !== JSON.stringify(draft.owner) ||
        receipt.revision !== (flight.payload.basedOnRevision ?? 0) + 1 ||
        (flight.payload.baseCountId !== null &&
          receipt.countId !== flight.payload.baseCountId)
      )
        throw new Error("Accusé de réception hors périmètre");
      for (const [productId, operationId] of Object.entries(
        flight.operationIds,
      )) {
        const key = `${draft.id}:line:${productId}`;
        const row = await db.operations.get(key);
        if (row && localOperationSchema.parse(row.value).id === operationId)
          await db.operations.delete(key);
      }
      await db.operations.delete(`${draft.id}:start`);
      const remaining = await db.operations
        .where("draftId")
        .equals(draft.id)
        .count();
      await writeRecord(draftScope(workspace), {
        ...sync,
        serverCountId: receipt.countId,
        serverRevision: receipt.revision,
        inFlight: null,
        conflict: null,
        phase: remaining ? "pending" : "synchronized",
        rejected: false,
        attempts: 0,
        nextAttemptAt: 0,
        receivedAt: receipt.receivedAt,
        generation: sync.generation + 1,
        message: remaining
          ? "D’autres saisies restent à envoyer"
          : "Brouillon synchronisé · stock non validé",
      });
    },
  );
}

async function recordFailure(
  workspace: PreparedWorkspace,
  operationId: string,
  status: number,
  value: unknown,
) {
  return db.transaction("rw", db.copies, db.drafts, db.sync, async () => {
    const state = await recordFor(workspace);
    if (
      !state?.sync.inFlight ||
      state.sync.inFlight.payload.operationId !== operationId
    )
      return;
    const { sync } = state;
    const conflict =
      status === 409 ? syncConflictSchema.safeParse(value) : null;
    if (conflict?.success) {
      const current = conflict.data.current;
      if (
        current &&
        (current.organizationId !== workspace.identity.organizationId ||
          current.storeId !== workspace.identity.storeId ||
          current.businessDate !== workspace.businessDate)
      )
        throw new Error("Conflit reçu hors périmètre");
      await writeRecord(draftScope(workspace), {
        ...sync,
        phase: "conflict",
        conflict: conflict.data,
        message: conflict.data.message,
        generation: sync.generation + 1,
      });
      return;
    }
    const transient =
      status === 0 || status === 408 || status === 429 || status >= 500;
    const locked = [401, 403, 404].includes(status);
    const phase = locked
      ? "locked"
      : transient && sync.attempts < syncTransportPolicy.maxAttempts
        ? "pending"
        : "failed";
    const detail = z.object({ message: z.string() }).safeParse(value);
    const rejected =
      status === 400 &&
      z.object({ code: z.literal("INVALID_INVENTORY_COUNT") }).safeParse(value)
        .success;
    await writeRecord(draftScope(workspace), {
      ...sync,
      phase,
      generation: sync.generation + 1,
      rejected,
      nextAttemptAt: transient ? nextSyncRetry(sync.attempts, Date.now()) : 0,
      message: locked
        ? "Accès interrompu : reconnectez-vous avec le compte propriétaire et préparez à nouveau."
        : detail.success
          ? detail.data.message
          : "Envoi non confirmé. Les saisies restent sur cet appareil ; réessayez avec du réseau.",
    });
  });
}

export async function reviseRejectedSync(
  workspace: PreparedWorkspace,
  generation: number,
) {
  await db.transaction("rw", db.copies, db.drafts, db.sync, async () => {
    const state = await recordFor(workspace);
    if (!state?.sync.rejected || state.sync.generation !== generation)
      throw new Error("Le refus a changé ; relisez son état");
    // Only a validated 400 proves the batch was not applied. Unknown outcomes remain immutable.
    await writeRecord(draftScope(workspace), {
      ...state.sync,
      inFlight: null,
      rejected: false,
      phase: "failed",
      attempts: 0,
      nextAttemptAt: 0,
      generation: generation + 1,
      message:
        "Corrigez vos saisies, puis réessayez manuellement. L’envoi refusé n’a pas été appliqué.",
    });
  });
}

export async function synchronizeInventory(
  workspace: PreparedWorkspace,
  force = false,
) {
  if (!navigator.locks)
    throw new Error(
      "Synchronisation indisponible : mettez votre navigateur à jour. Les saisies restent locales.",
    );
  await navigator.locks.request(
    `fleg-inventory-sync:${draftScope(workspace)}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return;
      const payload = await prepareSyncOperation(workspace, force);
      if (!payload) return;
      try {
        // Recheck online access even if onLine says false/true; the POST reauthorizes too.
        const access = await fetch(
          `/api/stores/${workspace.identity.storeId}/offline/access`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(syncTransportPolicy.timeoutMs),
          },
        );
        if (!access.ok) {
          await recordFailure(
            workspace,
            payload.operationId,
            access.status,
            await access.json().catch(() => null),
          );
          return;
        }
        const identity = offlineAccessSchema.parse(await access.json());
        if (
          !identity.canWriteInventory ||
          !sameOfflineIdentity(identity, workspace.identity)
        ) {
          await recordFailure(workspace, payload.operationId, 403, null);
          return;
        }
        // Detect a logout/reference invalidation that happened during the access fetch.
        await activeWorkspace(workspace, Date.now());
        const response = await fetch(
          `/api/stores/${workspace.identity.storeId}/offline/sync`,
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              "x-fleg-session-binding": identity.sessionBinding,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(syncTransportPolicy.timeoutMs),
          },
        );
        const result: unknown = await response.json().catch(() => null);
        if (response.ok) await acknowledgeInventorySync(workspace, result);
        else
          await recordFailure(
            workspace,
            payload.operationId,
            response.status,
            result,
          );
      } catch {
        // A lost response may hide a successful commit. Retain the EXACT payload/id.
        await recordFailure(workspace, payload.operationId, 0, null);
      }
    },
  );
}

function fromServer(
  line: InventoryCount["lines"][number] | undefined,
  local: LocalCountLine,
): LocalCountLine {
  return {
    ...local,
    familyCode: line?.familyCode ?? null,
    stockUnit: line?.stockUnit ?? null,
    packSize: String(line?.packSize ?? ""),
    reserveCaseCount: String(line?.reserveCaseCount ?? ""),
    shelfQuantity: String(line?.shelfQuantity ?? ""),
    observedAt: null,
  };
}

export async function refreshSyncConflict(workspace: PreparedWorkspace) {
  const response = await fetch(
    `/api/stores/${workspace.identity.storeId}/offline/sync?businessDate=${workspace.businessDate}`,
    {
      cache: "no-store",
      headers: { "x-fleg-session-binding": workspace.identity.sessionBinding },
      signal: AbortSignal.timeout(syncTransportPolicy.timeoutMs),
    },
  );
  if (!response.ok)
    throw new Error("Relecture serveur refusée ou indisponible");
  const { count } = z
    .object({ count: inventoryCountSchema.nullable() })
    .parse(await response.json());
  await db.transaction("rw", db.copies, db.drafts, db.sync, async () => {
    const state = await recordFor(workspace);
    if (state?.sync.phase !== "conflict")
      throw new Error("Le conflit a changé");
    if (
      count &&
      (count.organizationId !== workspace.identity.organizationId ||
        count.storeId !== workspace.identity.storeId ||
        count.businessDate !== workspace.businessDate)
    )
      throw new Error("Relecture hors périmètre");
    await writeRecord(draftScope(workspace), {
      ...state.sync,
      generation: state.sync.generation + 1,
      conflict: {
        kind: "conflict",
        current: count,
        message:
          count?.status === "committed"
            ? "Créez une correction dans Stocks du matin puis actualisez ici."
            : "Comparez les valeurs avec la dernière version serveur.",
      },
    });
  });
}

export async function resolveSyncConflict(
  workspace: PreparedWorkspace,
  generation: number,
  revision: number,
  choices: Record<string, "local" | "server">,
) {
  await db.transaction(
    "rw",
    db.copies,
    db.drafts,
    db.operations,
    db.sync,
    async () => {
      const state = await recordFor(workspace);
      if (
        !state ||
        state.sync.phase !== "conflict" ||
        state.sync.generation !== generation ||
        state.draft.revision !== revision
      )
        throw new Error(
          "Le conflit ou le brouillon a changé ; relisez les différences",
        );
      const current = state.sync.conflict!.current;
      if (current?.status === "committed")
        throw new Error(
          "Le comptage validé est immuable ; créez une correction connectée",
        );
      const operations = (
        await db.operations.where("draftId").equals(state.draft.id).toArray()
      ).map((row) => localOperationSchema.parse(row.value));
      const lines = new Map(
        state.draft.lines.map((line) => [line.productId, line]),
      );
      for (const operation of operations) {
        if (operation.kind !== "line" || !operation.line) continue;
        const choice = choices[operation.line.productId];
        if (choice !== "local" && choice !== "server")
          throw new Error(
            "Choisissez une valeur pour chaque article en attente",
          );
        if (choice === "server") {
          lines.set(
            operation.line.productId,
            fromServer(
              current?.lines.find(
                (line) => line.productId === operation.line!.productId,
              ),
              operation.line,
            ),
          );
          await db.operations.delete(
            `${state.draft.id}:line:${operation.line.productId}`,
          );
        }
      }
      await db.drafts.put({
        key: draftScope(workspace),
        value: localInventoryDraftSchema.parse({
          ...state.draft,
          lines: [...lines.values()],
          revision: revision + 1,
          ...(state.draft.schemaVersion === 3
            ? {
                lifecycle: {
                  phase: "editing",
                  ...(current
                    ? { count: countReferenceSchema.parse(current) }
                    : {}),
                },
              }
            : {}),
        }),
      });
      const remaining = operations.some(
        (operation) =>
          operation.kind === "line" &&
          operation.line &&
          choices[operation.line.productId] === "local",
      );
      if (!remaining) await db.operations.delete(`${state.draft.id}:start`);
      // A 409 proves this immutable operation was not applied; retire only after explicit choices.
      await writeRecord(draftScope(workspace), {
        ...state.sync,
        generation: generation + 1,
        serverCountId: current?.id ?? null,
        serverRevision: current?.revision ?? null,
        inFlight: null,
        conflict: null,
        phase: remaining || !current ? "pending" : "synchronized",
        attempts: 0,
        nextAttemptAt: 0,
        receivedAt: remaining
          ? state.sync.receivedAt
          : current
            ? new Date().toISOString()
            : null,
        message: remaining
          ? "Conflit résolu localement. Les choix seront contrôlés par révision lors de l’envoi."
          : "Version serveur conservée · aucune saisie locale en attente · stock non validé",
      });
    },
  );
}
