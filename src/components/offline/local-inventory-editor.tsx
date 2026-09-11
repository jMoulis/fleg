"use client";

import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventorySyncPanel } from "./inventory-sync-panel";
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
  startLocalDraft,
} from "@/lib/offline/inventory-drafts";

const pageSize = 25;

export function LocalInventoryEditor({
  workspace,
  accessible,
  now,
  onBusyChange,
  onActiveChange,
}: {
  workspace: PreparedWorkspace;
  accessible: boolean;
  now: number;
  onBusyChange: (busy: boolean) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState<LocalInventoryDraft | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [writeFailed, setWriteFailed] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
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
    return () => subscription.unsubscribe();
  }, [workspace, accessible, onActiveChange]);

  useEffect(() => {
    onBusyChange(saving || writeFailed);
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!pending.current && !blocked.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [saving, writeFailed, onBusyChange]);

  function show(value: LocalInventoryDraft | null) {
    display.current = value;
    if (mounted.current) {
      setDraft(value);
      onActiveChange(Boolean(value));
    }
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
    if (!accessible || blocked.current || syncConflict || !display.current)
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
    const view = { ...display.current.view, ...patch };
    dirtyView.current = true;
    show({ ...display.current, view });
    enqueue(undefined, view);
  }

  async function start() {
    setSaving(true);
    setError("");
    try {
      const saved = await startLocalDraft(workspace);
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
      (!view?.family || line.familyCode === view.family) &&
      (view?.progress === "all" ||
        (view?.progress === "complete"
          ? result.state === "complete"
          : result.state !== "complete")),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(view?.page ?? 1, pageCount);
  const inactive = (saving && !draft) || Boolean(error);

  return (
    <section
      aria-labelledby="local-count-title"
      className="mt-8 space-y-4 pb-6"
    >
      <h2 id="local-count-title" className="text-xl font-semibold">
        Brouillon de stock sur cet appareil
      </h2>
      <p className="text-sm text-amber-900">
        {draft?.schemaVersion === 2
          ? "Synchronisation activée pour ce brouillon."
          : "Local uniquement tant que vous n’activez pas la synchronisation."}{" "}
        Ce brouillon ne sert pas aux préconisations de commande avant validation
        explicite dans Stocks du matin, en ligne.
      </p>
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
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm text-destructive"
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
        <Button
          disabled={saving || !workspace.products.length}
          onClick={() => void start()}
        >
          Commencer un brouillon local
        </Button>
      ) : (
        <>
          <InventorySyncPanel
            workspace={workspace}
            draft={draft}
            disabled={saving || Boolean(error)}
            onConflictChange={setSyncConflict}
          />
          <p className="text-sm font-medium">
            {draft.storeName} · date du relevé {draft.businessDate} ·{" "}
            {draft.timeZone}
          </p>
          <p className="text-xs text-muted-foreground">
            Base serveur initiale :{" "}
            {draft.serverCountId
              ? `comptage ${draft.serverCountId}, révision ${draft.baseRevision}`
              : "aucun brouillon lié"}{" "}
            · données révision {draft.dataRevision}. Un nouveau téléchargement
            ne remplace pas ces saisies.
          </p>
          {businessDateAt(now, draft.timeZone) !== draft.businessDate && (
            <p role="status" className="text-sm text-amber-900">
              La date locale actuelle diffère du relevé. Vous travaillez
              toujours sur le {draft.businessDate} ; aucune date n’est déplacée
              automatiquement.
            </p>
          )}
          <div className="z-10 grid gap-3 rounded-xl border bg-background p-3 sm:sticky sm:top-0 sm:grid-cols-2">
            <label className="text-sm">
              Rechercher dans le brouillon
              <Input
                maxLength={200}
                value={view!.search}
                disabled={inactive}
                onChange={(event) =>
                  editView({ search: event.target.value, page: 1 })
                }
              />
            </label>
            <label className="text-sm">
              Famille du brouillon
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
                <option value="">Toutes</option>
                <option value="3400">Fruits · 3400</option>
                <option value="3402">Légumes · 3402</option>
              </select>
            </label>
            <label className="text-sm">
              Progression
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
                <option value="all">Tous</option>
                <option value="remaining">À compléter</option>
                <option value="complete">Complets localement</option>
              </select>
            </label>
            <div
              role="group"
              aria-label="Zone de comptage"
              className="flex items-end gap-2"
            >
              {(["reserve", "shelf"] as const).map((area) => (
                <Button
                  key={area}
                  variant={view!.area === area ? "default" : "outline"}
                  disabled={inactive}
                  aria-pressed={view!.area === area}
                  onClick={() => editView({ area })}
                >
                  {area === "reserve" ? "Réserve" : "Rayon"}
                </Button>
              ))}
            </div>
            <nav
              aria-label="Pages du brouillon"
              className="flex flex-wrap items-center gap-3 sm:col-span-2"
            >
              <Button
                variant="outline"
                disabled={inactive || page === 1}
                onClick={() => editView({ page: page - 1 })}
              >
                Page précédente
              </Button>
              <span className="text-sm">
                {matches.length} articles · page {page}/{pageCount}
              </span>
              <Button
                variant="outline"
                disabled={inactive || page === pageCount}
                onClick={() => editView({ page: page + 1 })}
              >
                Page suivante
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
                  <fieldset
                    disabled={inactive || syncConflict}
                    className="mt-3 grid gap-3"
                  >
                    <legend className="sr-only">
                      Comptage de {line.label}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
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
                    <label className="text-sm">
                      Colisage du relevé
                      <Input
                        type="text"
                        inputMode="decimal"
                        maxLength={40}
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
                          value={line.reserveCaseCount}
                          onChange={(event) =>
                            editLine(line, {
                              reserveCaseCount: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : (
                      <label className="text-sm">
                        Quantité en rayon (
                        {line.stockUnit ?? "unité à renseigner"})
                        <Input
                          type="text"
                          inputMode="decimal"
                          maxLength={40}
                          value={line.shelfQuantity}
                          onChange={(event) =>
                            editLine(line, {
                              shelfQuantity: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                  </fieldset>
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    {line.observedAt
                      ? `Saisi le ${new Date(line.observedAt).toLocaleString("fr-FR", { timeZone: draft.timeZone })}`
                      : "Valeurs de référence : pas encore modifiées sur cet appareil."}
                  </p>
                </li>
              ))}
          </ul>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-sm">
            <div role="status" className="text-sm">
              <p className="font-semibold">
                {saving
                  ? "Enregistrement sur cet appareil…"
                  : error
                    ? "Enregistrement local en échec"
                    : draft.schemaVersion === 2
                      ? "Enregistré sur cet appareil · état d’envoi ci-dessus"
                      : "Enregistré sur cet appareil · non synchronisé"}
              </p>
              <p>
                {complete}/{draft.lines.length} articles complets ·{" "}
                {draft.lines.length - complete} à compléter
              </p>
            </div>
            <Button
              variant="outline"
              disabled={saving || Boolean(error)}
              onClick={() => void discard()}
            >
              Supprimer ce brouillon local
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
