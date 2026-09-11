"use client";

import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventorySyncPanel } from "./inventory-sync-panel";
import { CountWorkflowActions } from "./count-workflow-actions";
import { countIsEditable } from "@/domain/offline/count-lifecycle";
import { openUnifiedCount } from "@/lib/offline/count-lifecycle";
import {
  businessDateAt,
  inspectLocalLine,
  type LocalCountLine,
  type LocalInventoryDraft,
  type LocalView,
} from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";
import {
  discardLocalDraft,
  localDraftDates,
  readLocalDraft,
  saveLocalLine,
  saveLocalView,
} from "@/lib/offline/inventory-drafts";

const pageSize = 25;

export function LocalInventoryEditor({
  workspace,
  accessible,
  now,
  onBusyChange,
  onActiveChange,
  connected,
}: {
  workspace: PreparedWorkspace;
  accessible: boolean;
  now: number;
  onBusyChange: (busy: boolean) => void;
  onActiveChange: (active: boolean) => void;
  connected: boolean;
}) {
  const [draft, setDraft] = useState<LocalInventoryDraft | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [writeFailed, setWriteFailed] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(0);
  const display = useRef<LocalInventoryDraft | null>(null);
  const acknowledged = useRef<LocalInventoryDraft | null>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const blocked = useRef(false);
  const dirtyLines = useRef(new Map<string, LocalCountLine>());
  const dirtyView = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange(false);
      onActiveChange(false);
    };
  }, [onBusyChange, onActiveChange]);

  useEffect(() => {
    if (!accessible || !workspace.canWriteInventory) return;
    let disposed = false;
    let unsubscribe = () => {};
    void openUnifiedCount(workspace)
      .then(() => {
        if (disposed) return;
        const subscription = liveQuery(async () => ({
          draft: await readLocalDraft(workspace),
          dates: await localDraftDates(workspace),
        })).subscribe({
          next: (value) => {
            setDates(value.dates);
            if (pending.current || blocked.current) return;
            acknowledged.current = value.draft;
            display.current = value.draft;
            setDraft(value.draft);
            onActiveChange(Boolean(value.draft));
            setError("");
            setLoading(false);
          },
          error: () => {
            setLoading(false);
            setError(
              "Brouillon verrouillé ou stockage incompatible. Préparez à nouveau avec votre compte. Aucun brouillon n’a été effacé.",
            );
          },
        });
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setError(
            "Reprise impossible. Vos saisies existantes sont conservées.",
          );
        }
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [workspace, accessible, onActiveChange]);

  useEffect(() => {
    onBusyChange(saving || writeFailed || actionBusy);
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!pending.current && !blocked.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [saving, writeFailed, actionBusy, onBusyChange]);

  function show(value: LocalInventoryDraft | null) {
    display.current = value;
    if (mounted.current) {
      setDraft(value);
      onActiveChange(Boolean(value));
    }
  }

  async function refreshAfterAction() {
    const saved = await readLocalDraft(workspace);
    if (pending.current || blocked.current)
      throw new Error("Une saisie locale reste à résoudre.");
    acknowledged.current = saved;
    show(saved);
  }

  function enqueue(line?: LocalCountLine, view?: LocalView) {
    pending.current++;
    setSaving(true);
    queue.current = queue.current
      .then(async () => {
        if (blocked.current) return;
        const base = acknowledged.current;
        if (!base) throw new Error("Brouillon local introuvable");
        const scope = {
          workspace,
          draftId: base.id,
          expectedRevision: base.revision,
        };
        const saved = line
          ? await saveLocalLine({ ...scope, line })
          : await saveLocalView({ ...scope, view: view! });
        acknowledged.current = saved;
        if (line && dirtyLines.current.get(line.productId) === line)
          dirtyLines.current.delete(line.productId);
        if (view && display.current?.view === view) dirtyView.current = false;
      })
      .catch((cause: unknown) => {
        blocked.current = true;
        if (mounted.current) {
          setWriteFailed(true);
          setError(
            `Non enregistré sur cet appareil. ${cause instanceof Error ? cause.message : "Échec de stockage. Libérez de l’espace et réessayez."}`,
          );
        }
      })
      .finally(() => {
        pending.current--;
        if (mounted.current && pending.current === 0) {
          setSaving(false);
          if (!blocked.current) show(acknowledged.current);
        }
      });
  }

  function editLine(line: LocalCountLine, patch: Partial<LocalCountLine>) {
    if (
      !accessible ||
      blocked.current ||
      syncConflict ||
      !display.current ||
      !countIsEditable(display.current.lifecycle)
    )
      return;
    const current = display.current.lines.find(
      (value) => value.productId === line.productId,
    )!;
    const updated = {
      ...current,
      ...patch,
      observedAt:
        "reserveCaseCount" in patch || "shelfQuantity" in patch
          ? new Date().toISOString()
          : current.observedAt,
    };
    dirtyLines.current.set(line.productId, updated);
    show({
      ...display.current,
      lines: display.current.lines.map((value) =>
        value.productId === line.productId ? updated : value,
      ),
    });
    enqueue(updated);
  }

  function editView(patch: Partial<LocalView>) {
    if (!display.current || blocked.current) return;
    if (patch.area === "review") setReviewRequest((value) => value + 1);
    const view = { ...display.current.view, ...patch };
    dirtyView.current = true;
    show({ ...display.current, view });
    enqueue(undefined, view);
  }

  async function start() {
    setSaving(true);
    setError("");
    try {
      const saved = await openUnifiedCount(workspace, true, true);
      acknowledged.current = saved;
      show(saved);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Création locale impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  function retry() {
    blocked.current = false;
    setWriteFailed(false);
    setError("");
    for (const line of dirtyLines.current.values()) enqueue(line);
    if (dirtyView.current && display.current)
      enqueue(undefined, display.current.view);
  }

  async function reload() {
    if (
      !window.confirm(
        "Abandonner les valeurs non enregistrées affichées et relire le brouillon conservé sur cet appareil ?",
      )
    )
      return;
    try {
      const saved = await readLocalDraft(workspace);
      dirtyLines.current.clear();
      dirtyView.current = false;
      blocked.current = false;
      acknowledged.current = saved;
      show(saved);
      setWriteFailed(false);
      setError("");
    } catch {
      setError(
        "Relecture impossible. Vos valeurs affichées n’ont pas été remplacées.",
      );
    }
  }

  async function discard() {
    const base = acknowledged.current;
    if (
      !base ||
      !window.confirm(
        "Supprimer définitivement ce brouillon de cet appareil ? Les saisies non synchronisées seront perdues. Un éventuel brouillon serveur ne sera pas supprimé.",
      )
    )
      return;
    setSaving(true);
    try {
      await discardLocalDraft(workspace, base.id, base.revision);
      acknowledged.current = null;
      dirtyLines.current.clear();
      dirtyView.current = false;
      show(null);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Suppression impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!accessible) return null; // Stay mounted during an access check: no loss of unsaved input.
  if (!workspace.canWriteInventory)
    return (
      <p className="mt-4 text-sm">
        Saisie locale indisponible pour cette copie. Préparez à nouveau avec un
        compte autorisé à saisir les stocks.
      </p>
    );
  if (loading)
    return (
      <p role="status" className="mt-4">
        Recherche du brouillon local…
      </p>
    );
  const view = draft?.view;
  const states =
    draft?.lines.map((line) => ({ line, result: inspectLocalLine(line) })) ??
    [];
  const complete = states.filter(
    (value) => value.result.state === "complete",
  ).length;
  const matches = states.filter(
    ({ line, result }) =>
      (!view?.search ||
        line.label
          .toLocaleLowerCase("fr")
          .includes(view.search.trim().toLocaleLowerCase("fr"))) &&
      (!view?.family ||
        (view.family === "unconfigured"
          ? !line.familyCode || !line.stockUnit || !line.packSize.trim()
          : line.familyCode === view.family)) &&
      (view?.progress === "all" ||
        (view?.progress === "stockout"
          ? result.state === "complete" && result.total === 0
          : view?.progress === "complete"
            ? result.state === "complete"
            : result.state !== "complete")),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(view?.page ?? 1, pageCount);
  const inactive = (saving && !draft) || Boolean(error) || actionBusy;

  return (
    <section
      aria-labelledby="local-count-title"
      className="mt-3 space-y-3 pb-4"
    >
      <h2
        id="local-count-title"
        className={draft ? "sr-only" : "text-xl font-semibold"}
      >
        Feuille de comptage
      </h2>
      {dates.some((date) => date !== workspace.businessDate) && (
        <p className="text-sm">
          Autres dates conservées pour ce compte et ce magasin :{" "}
          {dates.filter((date) => date !== workspace.businessDate).join(", ")}.
          Sélectionnez la date dans Stocks du matin et préparez le catalogue
          correspondant pour retrouver le brouillon.
        </p>
      )}
      {error && (
        <div
          id="local-save-error"
          role="alert"
          className="scroll-mt-20 rounded-xl border border-destructive p-4 text-sm text-destructive"
        >
          <p>{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {writeFailed && (
              <Button variant="outline" disabled={saving} onClick={retry}>
                Réessayer l’enregistrement local
              </Button>
            )}
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void reload()}
            >
              Relire la version enregistrée
            </Button>
          </div>
        </div>
      )}
      {!draft ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Vos saisies seront conservées sur cet appareil et envoyées
            automatiquement avec du réseau. La validation restera votre
            décision.
          </p>
          <Button
            disabled={saving || !workspace.products.length}
            onClick={() => void start()}
          >
            {workspace.countReference?.status === "committed"
              ? "Consulter le relevé validé"
              : workspace.countReference
                ? "Reprendre le comptage"
                : "Commencer le comptage"}
          </Button>
        </div>
      ) : (
        <>
          <p
            className={
              draft.lifecycle?.phase === "editing" && !draft.lifecycle.count
                ? "sr-only"
                : "text-sm font-medium"
            }
            role="status"
          >
            {draft.lifecycle?.phase === "committed"
              ? `Stock validé · version ${draft.lifecycle.count.version}. Le relevé est verrouillé.`
              : draft.lifecycle?.phase === "server_committed"
                ? "Le serveur a déjà validé ce relevé. Vos saisies restent conservées pour comparaison."
                : draft.lifecycle?.phase === "committing"
                  ? "Validation non confirmée : le relevé est verrouillé jusqu’à réception de la réponse."
                  : draft.lifecycle?.phase === "correcting"
                    ? "Ouverture de la correction à confirmer. L’ancien relevé reste inchangé."
                    : `Comptage en cours${draft.lifecycle?.phase === "editing" && draft.lifecycle.count ? ` · version ${draft.lifecycle.count.version}` : ""}`}
          </p>
          {businessDateAt(now, draft.timeZone) !== draft.businessDate && (
            <p role="status" className="text-sm text-amber-900">
              La date locale actuelle diffère du relevé. Vous travaillez
              toujours sur le {draft.businessDate} ; aucune date n’est déplacée
              automatiquement.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-background p-3">
            <div
              role="navigation"
              aria-label="Étapes du comptage"
              className="col-span-2 grid grid-cols-4 gap-1"
            >
              {(["reserve", "shelf", "review", "configuration"] as const).map(
                (area) => (
                  <Button
                    key={area}
                    className="min-h-11 px-1 text-xs sm:text-sm"
                    variant={view!.area === area ? "default" : "outline"}
                    disabled={inactive}
                    aria-pressed={view!.area === area}
                    onClick={() => editView({ area })}
                  >
                    {
                      {
                        reserve: "Réserve",
                        shelf: "Rayon",
                        review: "Vérifier",
                        configuration: "Configurer",
                      }[area]
                    }
                  </Button>
                ),
              )}
            </div>
            <label className="col-span-2 text-sm">
              <span className="sr-only">Rechercher dans le brouillon</span>
              <Input
                placeholder="Rechercher un article…"
                className="min-h-11"
                maxLength={200}
                value={view!.search}
                disabled={inactive}
                onChange={(event) =>
                  editView({ search: event.target.value, page: 1 })
                }
              />
            </label>
            <label className="text-sm">
              <span className="sr-only">Famille du brouillon</span>
              <select
                className="mt-1 block min-h-11 w-full rounded-lg border px-3"
                value={view!.family}
                disabled={inactive}
                onChange={(event) =>
                  editView({
                    family: event.target.value as LocalView["family"],
                    page: 1,
                  })
                }
              >
                <option value="">Toutes les familles</option>
                <option value="3400">Fruits · 3400</option>
                <option value="3402">Légumes · 3402</option>
                <option value="unconfigured">À configurer</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="sr-only">Progression</span>
              <select
                className="mt-1 block min-h-11 w-full rounded-lg border px-3"
                value={view!.progress}
                disabled={inactive}
                onChange={(event) =>
                  editView({
                    progress: event.target.value as LocalView["progress"],
                    page: 1,
                  })
                }
              >
                <option value="all">Tous les articles</option>
                <option value="remaining">À compléter</option>
                <option value="complete">Complets</option>
                <option value="stockout">Ruptures confirmées</option>
              </select>
            </label>
            <nav
              aria-label="Pages du brouillon"
              className="col-span-2 flex flex-wrap items-center gap-3"
            >
              <Button
                variant="outline"
                disabled={inactive || page === 1}
                onClick={() => editView({ page: page - 1 })}
              >
                <span aria-hidden="true">←</span>
                <span className="sr-only">Page précédente</span>
              </Button>
              <span className="text-sm">
                {matches.length} articles · page {page}/{pageCount}
              </span>
              <Button
                variant="outline"
                disabled={inactive || page === pageCount}
                onClick={() => editView({ page: page + 1 })}
              >
                <span aria-hidden="true">→</span>
                <span className="sr-only">Page suivante</span>
              </Button>
            </nav>
          </div>
          {!matches.length && (
            <p>
              Aucun article ne correspond aux filtres. Les saisies masquées
              restent conservées.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {matches
              .slice((page - 1) * pageSize, page * pageSize)
              .map(({ line, result }) => (
                <li
                  key={line.productId}
                  data-local-count-product
                  className="rounded-xl border bg-card p-4"
                >
                  <h3 className="font-semibold">{line.label}</h3>
                  {view!.area !== "review" && (
                    <fieldset
                      disabled={
                        inactive ||
                        syncConflict ||
                        !countIsEditable(draft.lifecycle)
                      }
                      className="mt-3 grid gap-3"
                    >
                      <legend className="sr-only">
                        Comptage de {line.label}
                      </legend>
                      <details
                        open={
                          view!.area === "configuration" ||
                          !line.familyCode ||
                          !line.stockUnit
                        }
                        className="text-sm"
                      >
                        <summary className="cursor-pointer py-1 text-muted-foreground">
                          {line.familyCode && line.stockUnit
                            ? `${line.familyCode === "3400" ? "Fruits" : "Légumes"} · ${line.stockUnit === "piece" ? "pièces" : "kg"} · modifier`
                            : "Famille et unité à renseigner"}
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-sm">
                            Famille
                            <select
                              className="mt-1 block min-h-11 w-full rounded-lg border px-2"
                              value={line.familyCode ?? ""}
                              onChange={(event) =>
                                editLine(line, {
                                  familyCode:
                                    event.target.value === ""
                                      ? null
                                      : (event.target
                                          .value as LocalCountLine["familyCode"]),
                                })
                              }
                            >
                              <option value="">À renseigner</option>
                              <option value="3400">3400 · Fruits</option>
                              <option value="3402">3402 · Légumes</option>
                            </select>
                          </label>
                          <label className="text-sm">
                            Unité
                            <select
                              className="mt-1 block min-h-11 w-full rounded-lg border px-2"
                              value={line.stockUnit ?? ""}
                              onChange={(event) =>
                                editLine(line, {
                                  stockUnit:
                                    event.target.value === ""
                                      ? null
                                      : (event.target
                                          .value as LocalCountLine["stockUnit"]),
                                })
                              }
                            >
                              <option value="">À renseigner</option>
                              <option value="kg">kg</option>
                              <option value="piece">Pièce</option>
                            </select>
                          </label>
                        </div>
                      </details>
                      <div className="grid grid-cols-2 items-end gap-3">
                        <label className="text-sm">
                          Colisage du relevé
                          <Input
                            type="text"
                            inputMode="decimal"
                            maxLength={40}
                            className="mt-1 min-h-11"
                            value={line.packSize}
                            onChange={(event) =>
                              editLine(line, { packSize: event.target.value })
                            }
                          />
                        </label>
                        {view!.area === "reserve" ? (
                          <label className="text-sm">
                            Colis en réserve
                            <Input
                              type="text"
                              inputMode="numeric"
                              maxLength={40}
                              className="mt-1 min-h-11"
                              value={line.reserveCaseCount}
                              onChange={(event) =>
                                editLine(line, {
                                  reserveCaseCount: event.target.value,
                                })
                              }
                            />
                          </label>
                        ) : view!.area === "shelf" ? (
                          <label className="text-sm">
                            Quantité en rayon (
                            {line.stockUnit ?? "unité à renseigner"})
                            <Input
                              type="text"
                              inputMode="decimal"
                              maxLength={40}
                              className="mt-1 min-h-11"
                              value={line.shelfQuantity}
                              onChange={(event) =>
                                editLine(line, {
                                  shelfQuantity: event.target.value,
                                })
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                    </fieldset>
                  )}
                  <p className="mt-3 text-sm">
                    Réserve : {line.reserveCaseCount || "non comptée"} colis ·
                    rayon : {line.shelfQuantity || "non compté"}{" "}
                    {line.stockUnit}
                  </p>
                  <p className="mt-2 text-sm">
                    {result.message}
                    {result.total !== null
                      ? ` · total ${result.total} ${line.stockUnit}`
                      : ""}
                  </p>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1">
                      Détail du relevé
                    </summary>
                    <p className="mt-1">
                      {line.observedAt
                        ? `Saisi le ${new Date(line.observedAt).toLocaleString("fr-FR", { timeZone: draft.timeZone })}`
                        : "Valeurs de référence : pas encore modifiées sur cet appareil."}
                    </p>
                  </details>
                </li>
              ))}
          </ul>
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Options du comptage
            </summary>
            <p className="my-3 text-muted-foreground">
              {draft.storeName} · {draft.businessDate} · {draft.timeZone}. Base
              serveur :{" "}
              {draft.serverCountId
                ? `comptage ${draft.serverCountId}, révision ${draft.baseRevision}`
                : "aucun brouillon lié"}
              . Données révision {draft.dataRevision}.
            </p>
            <Button
              variant="outline"
              disabled={saving || Boolean(error)}
              onClick={() => void discard()}
            >
              Supprimer ce brouillon local
            </Button>
          </details>
          <InventorySyncPanel
            workspace={workspace}
            draft={draft}
            disabled={saving || Boolean(error)}
            saving={saving}
            saveFailed={Boolean(error)}
            complete={complete}
            onConflictChange={setSyncConflict}
            workflowActions={
              <CountWorkflowActions
                key={view!.area}
                workspace={workspace}
                draft={draft}
                connected={connected}
                reviewRequest={reviewRequest}
                disabled={saving || Boolean(error)}
                onBusyChange={setActionBusy}
                onSettled={refreshAfterAction}
                next={() =>
                  editView({
                    area:
                      view!.area === "configuration"
                        ? "reserve"
                        : view!.area === "reserve"
                          ? "shelf"
                          : "review",
                    page: 1,
                  })
                }
              />
            }
          />
        </>
      )}
    </section>
  );
}
