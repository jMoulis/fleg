"use client";

import { liveQuery } from "dexie";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { LocalInventoryDraft } from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";
import { syncTransportPolicy } from "@/domain/offline/sync";
import { inventorySaveStatus } from "@/domain/offline/presentation";
import { observeCommittedConflict } from "@/lib/offline/count-lifecycle";
import {
  enableInventorySync,
  readInventorySync,
  refreshSyncConflict,
  resolveSyncConflict,
  reviseRejectedSync,
  synchronizeInventory,
} from "@/lib/offline/inventory-sync";

type State = NonNullable<Awaited<ReturnType<typeof readInventorySync>>>;

export function InventorySyncPanel({
  workspace,
  draft,
  disabled,
  saving,
  saveFailed,
  complete,
  onConflictChange,
  workflowActions,
}: {
  workspace: PreparedWorkspace;
  draft: LocalInventoryDraft;
  disabled: boolean;
  saving: boolean;
  saveFailed: boolean;
  complete: number;
  onConflictChange: (conflict: boolean) => void;
  workflowActions: ReactNode;
}) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const subscription = liveQuery(() =>
      readInventorySync(workspace),
    ).subscribe({
      next: (value) => {
        setState(value);
        onConflictChange(value?.phase === "conflict");
        if (
          value?.phase === "conflict" &&
          value.conflict?.current?.status === "committed"
        )
          void observeCommittedConflict(
            workspace,
            value.conflict.current,
          ).catch(() =>
            setError(
              "Le relevé doit être relu avec votre compte propriétaire.",
            ),
          );
      },
      error: () =>
        setError(
          "Synchronisation verrouillée. Préparez à nouveau avec le compte propriétaire ; les saisies sont conservées.",
        ),
    });
    return () => subscription.unsubscribe();
  }, [workspace, onConflictChange]);

  const send = useCallback(
    async (force = false) => {
      if (disabled) return;
      try {
        await synchronizeInventory(workspace, force);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Synchronisation indisponible",
        );
      }
    },
    [workspace, disabled],
  );

  const syncEnabled = Boolean(state);
  const editable = !draft.lifecycle || draft.lifecycle.phase === "editing";
  useEffect(() => {
    if (!syncEnabled || disabled || !editable) return;
    const resume = () => {
      if (document.visibilityState === "visible") void send();
    };
    const initial = window.setTimeout(resume, syncTransportPolicy.settleMs);
    const timer = window.setInterval(resume, syncTransportPolicy.pollMs);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [syncEnabled, editable, disabled, send]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  const status = inventorySaveStatus({
    saving,
    failed: saveFailed,
    syncEnabled: Boolean(state),
    phase: state?.phase,
    pendingCount: state?.pendingLines.length ?? 0,
    receivedAt: state?.receivedAt,
  });
  const needsAttention =
    Boolean(error) ||
    (state && ["failed", "locked", "conflict"].includes(state.phase));

  return (
    <section
      aria-label="Synchronisation du brouillon"
      className="space-y-3 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal"
    >
      <div id="sync-details" className="scroll-mt-20 space-y-3">
        {needsAttention && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            {state?.message ??
              "Synchronisation indisponible. Vos saisies locales sont conservées."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {state && needsAttention && state.phase !== "conflict" && (
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void act(() => send(true))}
          >
            Réessayer la synchronisation
          </Button>
        )}
        {state && (
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Détails de synchronisation
            </summary>
            <p className="mt-2">{state.message}</p>
            <p className="mt-2 text-muted-foreground">
              {state.pendingLines.length} article(s) en attente · révision
              serveur {state.serverRevision ?? "aucune"}
              {state.receivedAt
                ? ` · reçu le ${new Date(state.receivedAt).toLocaleString("fr-FR", { timeZone: draft.timeZone })}`
                : ""}
            </p>
          </details>
        )}
        {state?.rejected && (
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() =>
              void act(() => reviseRejectedSync(workspace, state.generation))
            }
          >
            Réviser l’envoi refusé
          </Button>
        )}
        {state?.phase === "conflict" && (
          <ConflictResolver
            key={`${draft.id}:${state.generation}`}
            workspace={workspace}
            draft={draft}
            state={state}
            disabled={disabled || busy}
            act={act}
          />
        )}
      </div>
      <div
        data-inventory-save-bar
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-5xl rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            role="status"
            className={`text-xs sm:text-sm ${saveFailed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {status.local}
          </p>
          <span className="text-xs font-medium">
            {complete}/{draft.lines.length} complets
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs sm:text-sm" role="status">
            <p
              className={`font-semibold ${needsAttention ? "text-amber-800" : ""}`}
            >
              {draft.lifecycle?.phase === "committed"
                ? "Stock validé · relevé verrouillé"
                : draft.lifecycle?.phase === "server_committed"
                  ? "Stock déjà validé · saisies à comparer"
                  : draft.lifecycle?.phase === "committing"
                    ? "Validation à confirmer"
                    : draft.lifecycle?.phase === "correcting"
                      ? "Correction à confirmer"
                      : status.remote}
            </p>
            <p className="mt-1 text-muted-foreground">
              {state?.pendingLines.length
                ? `${state.pendingLines.length} article(s) à envoyer · `
                : ""}
              {draft.lifecycle?.phase === "committed"
                ? `Version ${draft.lifecycle.count.version}`
                : "Validation explicite en ligne"}
            </p>
          </div>
          {saveFailed ? (
            <a
              href="#local-save-error"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium text-destructive"
            >
              Voir l’erreur
            </a>
          ) : draft.lifecycle && draft.lifecycle.phase !== "editing" ? (
            workflowActions
          ) : !state ? (
            <Button
              className="max-w-40 shrink-0"
              aria-label="Reprendre et synchroniser ce brouillon"
              disabled={disabled || busy}
              onClick={() =>
                void act(() =>
                  enableInventorySync(workspace, draft.id, draft.revision),
                )
              }
            >
              Reprendre et synchroniser
            </Button>
          ) : state.phase === "conflict" || needsAttention ? (
            <a
              href="#sync-details"
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium"
            >
              {state.phase === "conflict" ? "Résoudre" : "Voir le problème"}
            </a>
          ) : (
            workflowActions
          )}
        </div>
      </div>
    </section>
  );
}

function ConflictResolver({
  workspace,
  draft,
  state,
  disabled,
  act,
}: {
  workspace: PreparedWorkspace;
  draft: LocalInventoryDraft;
  state: State;
  disabled: boolean;
  act: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, "local" | "server">>(
    {},
  );
  const [page, setPage] = useState(1);
  const current = state.conflict!.current;
  const pageCount = Math.max(1, Math.ceil(state.pendingLines.length / 10));
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {current
          ? `Serveur : ${current.status === "committed" ? "stock déjà validé" : "brouillon"}, révision ${current.revision}.`
          : "Aucun comptage serveur."}{" "}
        Choisissez une version par article ; les quantités ne sont jamais
        additionnées.
      </p>
      {current?.status === "committed" ? (
        <p role="alert" className="text-sm">
          Utilisez « Corriger et comparer mes saisies » dans la barre d’action.
          Le stock validé ne peut pas être écrasé.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {state.pendingLines
              .slice((page - 1) * 10, page * 10)
              .map((local) => {
                const server = current?.lines.find(
                  (line) => line.productId === local.productId,
                );
                return (
                  <li
                    key={local.productId}
                    data-sync-conflict-product
                    className="rounded-lg border bg-background p-3"
                  >
                    <fieldset disabled={disabled} className="space-y-2 text-sm">
                      <legend className="font-semibold">{local.label}</legend>
                      <p>
                        Appareil : {local.reserveCaseCount || "non compté"}{" "}
                        colis × {local.packSize || "?"} {local.stockUnit ?? "?"}{" "}
                        + {local.shelfQuantity || "non compté"} en rayon ·
                        famille {local.familyCode ?? "?"}.
                      </p>
                      <p>
                        Serveur :{" "}
                        {server
                          ? `${server.reserveCaseCount ?? "non compté"} colis × ${server.packSize ?? "?"} ${server.stockUnit ?? "?"} + ${server.shelfQuantity ?? "non compté"} en rayon · famille ${server.familyCode ?? "?"}.`
                          : "Aucune saisie pour cet article."}
                      </p>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          name={`resolution-${local.productId}`}
                          checked={choices[local.productId] === "local"}
                          onChange={() =>
                            setChoices((values) => ({
                              ...values,
                              [local.productId]: "local",
                            }))
                          }
                        />
                        Garder ma saisie
                      </label>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          name={`resolution-${local.productId}`}
                          checked={choices[local.productId] === "server"}
                          onChange={() =>
                            setChoices((values) => ({
                              ...values,
                              [local.productId]: "server",
                            }))
                          }
                        />
                        Garder la version serveur
                      </label>
                    </fieldset>
                  </li>
                );
              })}
          </ul>
          <nav
            aria-label="Pages des conflits"
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Conflits précédents
            </Button>
            <span className="text-sm">
              {page}/{pageCount} · {Object.keys(choices).length}/
              {state.pendingLines.length} choix
            </span>
            <Button
              variant="outline"
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
            >
              Conflits suivants
            </Button>
          </nav>
          <Button
            disabled={
              disabled ||
              state.pendingLines.some((line) => !choices[line.productId])
            }
            onClick={() =>
              void act(() =>
                resolveSyncConflict(
                  workspace,
                  state.generation,
                  draft.revision,
                  choices,
                ),
              )
            }
          >
            Confirmer mes choix de résolution
          </Button>
        </>
      )}
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => void act(() => refreshSyncConflict(workspace))}
      >
        Actualiser la version serveur
      </Button>
    </div>
  );
}
