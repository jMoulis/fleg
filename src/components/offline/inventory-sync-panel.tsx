"use client";

import { liveQuery } from "dexie";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LocalInventoryDraft } from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";
import { syncTransportPolicy } from "@/domain/offline/sync";
import {
  enableInventorySync,
  readInventorySync,
  refreshSyncConflict,
  resolveSyncConflict,
  reviseRejectedSync,
  synchronizeInventory,
} from "@/lib/offline/inventory-sync";

type State = NonNullable<Awaited<ReturnType<typeof readInventorySync>>>;
const labels = {
  pending: "En attente de synchronisation",
  syncing: "Synchronisation en cours",
  synchronized: "Brouillon synchronisé",
  failed: "Synchronisation en échec",
  conflict: "Conflit à résoudre",
  locked: "Synchronisation verrouillée",
};

export function InventorySyncPanel({
  workspace,
  draft,
  disabled,
  onConflictChange,
}: {
  workspace: PreparedWorkspace;
  draft: LocalInventoryDraft;
  disabled: boolean;
  onConflictChange: (conflict: boolean) => void;
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

  useEffect(() => {
    if (draft.schemaVersion !== 2 || disabled) return;
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
  }, [draft.schemaVersion, disabled, send]);

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

  return (
    <section
      aria-label="Synchronisation du brouillon"
      className="space-y-3 rounded-xl border bg-muted/30 p-4 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal"
    >
      <p role="status" className="font-semibold">
        {state ? labels[state.phase] : "Brouillon local uniquement"}
      </p>
      <p className="text-sm">
        {state?.message ??
          "Activez l’envoi de ce brouillon vers le magasin. Il reprendra automatiquement au retour du réseau, tant que cet écran est ouvert et votre accès valide."}
      </p>
      <p className="text-sm">
        Synchroniser ne valide pas le stock. Relisez puis validez le comptage
        dans Stocks du matin, en ligne. Aucune commande n’est passée.
      </p>
      {state && (
        <p className="text-xs text-muted-foreground">
          {state.pendingLines.length} article(s) en attente · révision serveur{" "}
          {state.serverRevision ?? "aucune"}
          {state.receivedAt
            ? ` · reçu le ${new Date(state.receivedAt).toLocaleString("fr-FR", { timeZone: draft.timeZone })}`
            : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!state ? (
        <Button
          disabled={disabled || busy}
          onClick={() =>
            void act(() =>
              enableInventorySync(workspace, draft.id, draft.revision),
            )
          }
        >
          Activer la synchronisation de ce brouillon
        </Button>
      ) : (
        state.phase !== "conflict" && (
          <Button
            variant="outline"
            disabled={disabled || busy || state.phase === "syncing"}
            onClick={() => void act(() => send(true))}
          >
            Réessayer la synchronisation
          </Button>
        )
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
          Créez une correction dans Stocks du matin, puis actualisez le conflit
          ici. Le stock validé ne peut pas être écrasé.
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
