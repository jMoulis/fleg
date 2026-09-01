"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Move,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { apiErrorSchema } from "@/domain/api/schemas";
import { IslandModuleGuides } from "@/components/space/layout-plan";
import {
  addLayoutFixture,
  duplicateLayoutFixture,
  getFixtureCreationDefaults,
  newFixtureInputSchema,
  removeLayoutFixture,
  resizeLayoutCanvas,
  updateFixtureGeometry,
  updateIslandModulesPerFace,
  type FixtureGeometryUpdate,
  type NewFixtureDraft,
} from "@/domain/space/layout-editor";
import {
  fixtureTypeSchema,
  layoutResponseSchema,
  layoutVersionCreateInputSchema,
  type FixtureType,
  type LayoutVersion,
} from "@/domain/space/schemas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface LayoutEditorProps {
  organizationSlug: string;
  storeId: string;
  layout: LayoutVersion;
}

const fixtureTypeLabels: Record<FixtureType, string> = {
  island: "Îlot",
  endcap: "Tête de gondole",
  wall: "Mobilier mural",
  bin: "Bac",
};

export function LayoutEditor({
  organizationSlug,
  storeId,
  layout,
}: LayoutEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(layout);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(
    layout.fixtures[0]?.id ?? null,
  );
  const [geometryConfirmed, setGeometryConfirmed] = useState(
    layout.geometryConfirmed,
  );
  const [versionNote, setVersionNote] = useState("");
  const [addingFixture, setAddingFixture] = useState(false);
  const [newFixture, setNewFixture] = useState<NewFixtureDraft>(() =>
    getFixtureCreationDefaults(layout, "island"),
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFixture = draft.fixtures.find(
    (fixture) => fixture.id === selectedFixtureId,
  );
  const spaceHref = `/${organizationSlug}/stores/${storeId}/space`;

  function updateSelectedFixture(
    field: keyof FixtureGeometryUpdate,
    value: string | number,
  ) {
    if (!selectedFixtureId) {
      return;
    }

    setDraft((current) => {
      const fixture = current.fixtures.find(
        (item) => item.id === selectedFixtureId,
      );

      if (!fixture) {
        return current;
      }

      const geometry: FixtureGeometryUpdate = {
        name: fixture.name,
        widthM: fixture.widthM,
        depthM: fixture.depthM,
        xM: fixture.position.xM,
        yM: fixture.position.yM,
      };

      return updateFixtureGeometry(current, selectedFixtureId, {
        ...geometry,
        [field]: value,
      });
    });
    setPendingDeleteId(null);
    setError(null);
  }

  function updateNumericField(
    field: Exclude<keyof FixtureGeometryUpdate, "name">,
    value: number,
  ) {
    if (Number.isFinite(value)) {
      updateSelectedFixture(field, value);
    }
  }

  function duplicateSelectedFixture() {
    if (!selectedFixtureId) {
      return;
    }

    const newFixtureId = crypto.randomUUID();
    const updated = duplicateLayoutFixture(
      draft,
      selectedFixtureId,
      newFixtureId,
    );

    if (updated === draft) {
      setError("Aucun emplacement libre pour dupliquer ce mobilier");
      return;
    }

    setDraft(updated);
    setSelectedFixtureId(newFixtureId);
    setPendingDeleteId(null);
    setError(null);
  }

  function startAddingFixture() {
    setNewFixture(getFixtureCreationDefaults(draft, "island"));
    setAddingFixture(true);
    setPendingDeleteId(null);
    setError(null);
  }

  function changeNewFixtureType(value: string | null) {
    const type = fixtureTypeSchema.safeParse(value);

    if (type.success) {
      setNewFixture(getFixtureCreationDefaults(draft, type.data));
      setError(null);
    }
  }

  function updateNewFixtureNumber(
    field:
      | "widthM"
      | "depthM"
      | "shelfDepthM"
      | "trafficWeight"
      | "visibilityWeight"
      | "commercialWeight",
    value: number,
  ) {
    if (Number.isFinite(value)) {
      setNewFixture((current) => ({ ...current, [field]: value }));
      setError(null);
    }
  }

  function addNewFixture() {
    const fixtureId = crypto.randomUUID();
    const validation = newFixtureInputSchema.safeParse({
      ...newFixture,
      id: fixtureId,
    });

    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ?? "Le mobilier est invalide",
      );
      return;
    }

    const updated = addLayoutFixture(draft, validation.data);

    if (updated === draft) {
      setError(
        "Aucun emplacement libre : agrandissez la zone ou déplacez un mobilier avant l’ajout.",
      );
      return;
    }

    setDraft(updated);
    setSelectedFixtureId(fixtureId);
    setAddingFixture(false);
    setError(null);
  }

  function deleteSelectedFixture() {
    if (!selectedFixtureId || draft.fixtures.length <= 1) {
      return;
    }

    const nextSelectedId = draft.fixtures.find(
      (fixture) => fixture.id !== selectedFixtureId,
    )?.id;
    setDraft((current) => removeLayoutFixture(current, selectedFixtureId));
    setSelectedFixtureId(nextSelectedId ?? null);
    setPendingDeleteId(null);
    setError(null);
  }

  async function saveVersion() {
    setError(null);
    const validation = layoutVersionCreateInputSchema.safeParse({
      idempotencyKey,
      basedOnVersion: layout.version,
      name: draft.name,
      geometryConfirmed,
      canvas: draft.canvas,
      fixtures: draft.fixtures,
      versionNote: versionNote || undefined,
    });

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Plan invalide");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/stores/${storeId}/layout/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as unknown;

      if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(body);
        setError(
          apiError.success
            ? apiError.data.message
            : "La nouvelle version n'a pas pu être enregistrée",
        );
        return;
      }

      const result = layoutResponseSchema.safeParse(body);

      if (!result.success || !result.data.layout) {
        setError("La réponse de sauvegarde est invalide");
        return;
      }

      router.push(`${spaceHref}?savedVersion=${result.data.layout.version}`);
      router.refresh();
    } catch {
      setError("La connexion a été interrompue pendant la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28 md:pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            Brouillon basé sur la version {layout.version}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Modifier le plan
          </h1>
        </div>
        <Link
          aria-label="Fermer l’éditeur"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          href={spaceHref}
        >
          <X aria-hidden="true" />
        </Link>
      </div>

      <Card className="mt-6">
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="layout-name">Nom du plan</Label>
            <Input
              id="layout-name"
              maxLength={160}
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                setError(null);
              }}
              value={draft.name}
            />
          </div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
            <input
              checked={geometryConfirmed}
              className="mt-0.5 size-5 accent-primary"
              onChange={(event) => setGeometryConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Dimensions vérifiées sur site</span>
              <span className="mt-1 block leading-5 text-muted-foreground">
                Cochez uniquement après un relevé réel du mobilier.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <section className="mt-6" aria-labelledby="interactive-plan-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">Touchez un mobilier</p>
            <h2 id="interactive-plan-title" className="mt-1 text-xl font-semibold">
              Plan interactif
            </h2>
          </div>
          <Button
            className="min-h-11"
            onClick={addingFixture ? () => setAddingFixture(false) : startAddingFixture}
            type="button"
            variant={addingFixture ? "ghost" : "outline"}
          >
            {addingFixture ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {addingFixture ? "Fermer" : "Ajouter"}
          </Button>
        </div>

        {addingFixture ? (
          <Card className="mb-4 border-primary/25">
            <CardHeader>
              <CardTitle>Ajouter un mobilier</CardTitle>
              <p className="text-sm leading-5 text-muted-foreground">
                Les valeurs sont proposées depuis le plan courant. Vérifiez-les
                avant l’ajout ; elles resteront attachées à la prochaine version.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-fixture-type">Type</Label>
                <Select
                  onValueChange={changeNewFixtureType}
                  value={newFixture.type}
                >
                  <SelectTrigger className="h-11 w-full" id="new-fixture-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fixtureTypeSchema.options.map((type) => (
                      <SelectItem key={type} value={type}>
                        {fixtureTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-fixture-name">Nom</Label>
                <Input
                  id="new-fixture-name"
                  maxLength={160}
                  onChange={(event) =>
                    setNewFixture((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  value={newFixture.name}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="new-fixture-depth"
                  label="Longueur (m)"
                  onChange={(value) => updateNewFixtureNumber("depthM", value)}
                  value={newFixture.depthM}
                />
                <NumberField
                  id="new-fixture-width"
                  label="Largeur (m)"
                  onChange={(value) => updateNewFixtureNumber("widthM", value)}
                  value={newFixture.widthM}
                />
                <NumberField
                  id="new-fixture-shelf-depth"
                  label="Profondeur niveau (m)"
                  onChange={(value) =>
                    updateNewFixtureNumber("shelfDepthM", value)
                  }
                  value={newFixture.shelfDepthM}
                />
                {newFixture.type === "island" ? (
                  <NumberField
                    id="new-fixture-modules"
                    label="Modules par face"
                    min={1}
                    onChange={(value) => {
                      if (Number.isInteger(value) && value > 0) {
                        setNewFixture((current) => ({
                          ...current,
                          modulesPerMainFace: value,
                        }));
                      }
                    }}
                    step={1}
                    value={newFixture.modulesPerMainFace}
                  />
                ) : null}
              </div>

              {newFixture.type === "island" ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  L’îlot sera créé avec 2 faces principales × {newFixture.modulesPerMainFace} modules.
                </p>
              ) : null}

              {newFixture.type === "endcap" ? (
                <div className="space-y-4 rounded-xl border p-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input
                      checked={newFixture.commercialRole === "entrance"}
                      className="size-5 accent-primary"
                      onChange={(event) =>
                        setNewFixture((current) => ({
                          ...current,
                          commercialRole: event.target.checked ? "entrance" : null,
                        }))
                      }
                      type="checkbox"
                    />
                    Position commerciale d’entrée
                  </label>

                  {draft.fixtures.some((fixture) => fixture.type === "island") ? (
                    <div className="space-y-2">
                      <Label htmlFor="new-fixture-association">
                        Îlot associé (optionnel)
                      </Label>
                      <Select
                        onValueChange={(value) =>
                          setNewFixture((current) => ({
                            ...current,
                            associatedFixtureId:
                              value && value !== "none" ? value : null,
                          }))
                        }
                        value={newFixture.associatedFixtureId ?? "none"}
                      >
                        <SelectTrigger
                          className="h-11 w-full"
                          id="new-fixture-association"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Aucun rattachement</SelectItem>
                          {draft.fixtures
                            .filter((fixture) => fixture.type === "island")
                            .map((fixture) => (
                              <SelectItem key={fixture.id} value={fixture.id}>
                                {fixture.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Coefficients commerciaux
                </summary>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Hypothèses explicites utilisées pour calculer la largeur
                  commerciale effective.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <NumberField
                    id="new-fixture-traffic"
                    label="Trafic"
                    onChange={(value) =>
                      updateNewFixtureNumber("trafficWeight", value)
                    }
                    value={newFixture.trafficWeight}
                  />
                  <NumberField
                    id="new-fixture-visibility"
                    label="Visibilité"
                    onChange={(value) =>
                      updateNewFixtureNumber("visibilityWeight", value)
                    }
                    value={newFixture.visibilityWeight}
                  />
                  <NumberField
                    id="new-fixture-commercial"
                    label="Niveau"
                    onChange={(value) =>
                      updateNewFixtureNumber("commercialWeight", value)
                    }
                    value={newFixture.commercialWeight}
                  />
                </div>
              </details>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => setAddingFixture(false)}
                  type="button"
                  variant="outline"
                >
                  Annuler
                </Button>
                <Button className="flex-1" onClick={addNewFixture} type="button">
                  <Plus aria-hidden="true" />
                  Ajouter au plan
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <InteractiveLayoutPlan
          layout={draft}
          onSelect={(fixtureId) => {
            setSelectedFixtureId(fixtureId);
            setPendingDeleteId(null);
          }}
          selectedFixtureId={selectedFixtureId}
        />
      </section>

      {selectedFixture ? (
        <section className="mt-6" aria-labelledby="selected-fixture-title">
          <Card className="border-primary/25">
            <CardHeader>
              <CardTitle id="selected-fixture-title">
                {selectedFixture.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {fixtureTypeLabels[selectedFixture.type]}
                {" · "}{selectedFixture.faces.length} face{selectedFixture.faces.length > 1 ? "s" : ""}
                {" · "}{selectedFixture.faces.reduce((total, face) => total + face.modules.length, 0)} modules
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fixture-name">Nom</Label>
                <Input
                  id="fixture-name"
                  maxLength={160}
                  onChange={(event) =>
                    updateSelectedFixture("name", event.target.value)
                  }
                  value={selectedFixture.name}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="fixture-depth"
                  label="Longueur (m)"
                  onChange={(value) => updateNumericField("depthM", value)}
                  value={selectedFixture.depthM}
                />
                <NumberField
                  id="fixture-width"
                  label="Largeur (m)"
                  onChange={(value) => updateNumericField("widthM", value)}
                  value={selectedFixture.widthM}
                />
                <NumberField
                  id="fixture-x"
                  label="Position X (m)"
                  min={0}
                  onChange={(value) => updateNumericField("xM", value)}
                  value={selectedFixture.position.xM}
                />
                <NumberField
                  id="fixture-y"
                  label="Position Y (m)"
                  min={0}
                  onChange={(value) => updateNumericField("yM", value)}
                  value={selectedFixture.position.yM}
                />
                {selectedFixture.type === "island" ? (
                  <NumberField
                    id="fixture-modules"
                    label="Modules par face"
                    min={1}
                    onChange={(value) => {
                      if (Number.isInteger(value)) {
                        setDraft((current) =>
                          updateIslandModulesPerFace(
                            current,
                            selectedFixture.id,
                            value,
                          ),
                        );
                        setError(null);
                      }
                    }}
                    step={1}
                    value={selectedFixture.faces[0]?.modules.length ?? 1}
                  />
                ) : null}
              </div>

              {selectedFixture.type === "island" ? (
                <div className="rounded-xl border bg-muted/35 p-3 text-sm">
                  <p className="font-medium">Structure commerciale</p>
                  <p className="mt-1 leading-5 text-muted-foreground">
                    2 faces principales × {selectedFixture.faces[0]?.modules.length ?? 0} modules reliés, soit {selectedFixture.faces.reduce((total, face) => total + face.modules.length, 0)} modules au total.
                  </p>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium">Déplacer par pas de 10 cm</p>
                <div className="mx-auto mt-3 grid w-fit grid-cols-3 gap-2">
                  <span />
                  <NudgeButton
                    icon={ArrowUp}
                    label="Déplacer vers le haut"
                    onClick={() => updateNumericField("yM", selectedFixture.position.yM - 0.1)}
                  />
                  <span />
                  <NudgeButton
                    icon={ArrowLeft}
                    label="Déplacer vers la gauche"
                    onClick={() => updateNumericField("xM", selectedFixture.position.xM - 0.1)}
                  />
                  <span className="grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Move aria-hidden="true" className="size-5" />
                  </span>
                  <NudgeButton
                    icon={ArrowRight}
                    label="Déplacer vers la droite"
                    onClick={() => updateNumericField("xM", selectedFixture.position.xM + 0.1)}
                  />
                  <span />
                  <NudgeButton
                    icon={ArrowDown}
                    label="Déplacer vers le bas"
                    onClick={() => updateNumericField("yM", selectedFixture.position.yM + 0.1)}
                  />
                  <span />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="min-h-11"
                  onClick={duplicateSelectedFixture}
                  type="button"
                  variant="outline"
                >
                  <Copy aria-hidden="true" />
                  Dupliquer
                </Button>
                <Button
                  className="min-h-11"
                  disabled={draft.fixtures.length <= 1}
                  onClick={() => setPendingDeleteId(selectedFixture.id)}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 aria-hidden="true" />
                  Retirer du plan
                </Button>
              </div>

              {pendingDeleteId === selectedFixture.id ? (
                <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alert">
                  <p className="text-sm font-medium">Retirer ce mobilier du brouillon ?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cette suppression ne sera effective qu’après la sauvegarde de la nouvelle version.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={() => setPendingDeleteId(null)} type="button" variant="outline">
                      Annuler
                    </Button>
                    <Button onClick={deleteSelectedFixture} type="button" variant="destructive">
                      Confirmer
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <details className="mt-6 rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Dimensions de la zone de plan
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberField
            id="canvas-width"
            label="Largeur (m)"
            onChange={(widthM) =>
              setDraft((current) =>
                resizeLayoutCanvas(current, { ...current.canvas, widthM }),
              )
            }
            value={draft.canvas.widthM}
          />
          <NumberField
            id="canvas-depth"
            label="Profondeur (m)"
            onChange={(depthM) =>
              setDraft((current) =>
                resizeLayoutCanvas(current, { ...current.canvas, depthM }),
              )
            }
            value={draft.canvas.depthM}
          />
        </div>
      </details>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="version-note">Note de version</Label>
            <Textarea
              id="version-note"
              maxLength={500}
              onChange={(event) => setVersionNote(event.target.value)}
              placeholder="Ex. Dimensions relevées avec le responsable de rayon"
              value={versionNote}
            />
            <p className="text-xs text-muted-foreground">
              Cette note sera conservée dans l’historique du plan.
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[4.35rem] z-20 border-t bg-background/95 p-3 backdrop-blur md:sticky md:bottom-0 md:mt-8 md:rounded-2xl md:border">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Link className={cn(buttonVariants({ variant: "outline", size: "lg" }), "flex-1")} href={spaceHref}>
            Annuler
          </Link>
          <Button className="flex-1" disabled={saving} onClick={saveVersion} size="lg" type="button">
            {saving ? <Move aria-hidden="true" className="animate-pulse" /> : <Save aria-hidden="true" />}
            {saving ? "Enregistrement…" : `Créer la version ${layout.version + 1}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InteractiveLayoutPlan({
  layout,
  selectedFixtureId,
  onSelect,
}: {
  layout: LayoutVersion;
  selectedFixtureId: string | null;
  onSelect: (fixtureId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/25 p-3">
      <svg
        aria-labelledby="editor-plan-title editor-plan-description"
        className="h-auto w-full"
        role="group"
        viewBox={`0 0 ${layout.canvas.widthM} ${layout.canvas.depthM}`}
      >
        <title id="editor-plan-title">Plan interactif Fruits et Légumes</title>
        <desc id="editor-plan-description">
          Sélectionnez un mobilier pour modifier ses dimensions et sa position.
        </desc>
        <rect
          className="fill-background stroke-border"
          height={layout.canvas.depthM}
          rx="0.15"
          strokeWidth="0.04"
          vectorEffect="non-scaling-stroke"
          width={layout.canvas.widthM}
        />
        {layout.fixtures.map((fixture) => {
          const selected = fixture.id === selectedFixtureId;
          const fixtureColor = {
            island: "fill-emerald-50 stroke-emerald-700 dark:fill-emerald-950",
            endcap: "fill-amber-100 stroke-amber-600 dark:fill-amber-950",
            wall: "fill-sky-100 stroke-sky-700 dark:fill-sky-950",
            bin: "fill-violet-100 stroke-violet-700 dark:fill-violet-950",
          }[fixture.type];

          return (
            <g
              aria-label={`Sélectionner ${fixture.name}`}
              className="cursor-pointer outline-none focus-visible:[&_rect]:stroke-ring"
              key={fixture.id}
              onClick={() => onSelect(fixture.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(fixture.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <rect
                className={cn(
                  fixtureColor,
                  selected && "stroke-primary",
                )}
                height={fixture.depthM}
                rx="0.08"
                strokeWidth={selected ? "0.13" : "0.06"}
                vectorEffect="non-scaling-stroke"
                width={fixture.widthM}
                x={fixture.position.xM}
                y={fixture.position.yM}
              />
              <IslandModuleGuides fixture={fixture} />
              {selected ? (
                <circle
                  className="fill-primary stroke-background"
                  cx={fixture.position.xM + fixture.widthM}
                  cy={fixture.position.yM}
                  r="0.18"
                  strokeWidth="0.05"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <text
                className="pointer-events-none fill-foreground text-[0.22px] font-semibold"
                textAnchor="middle"
                x={fixture.position.xM + fixture.widthM / 2}
                y={fixture.position.yM + fixture.depthM / 2}
              >
                {fixture.name.split(" - ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0.01,
  step = 0.05,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        min={min}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        step={step}
        type="number"
        value={Number(value.toFixed(2))}
      />
    </div>
  );
}

function NudgeButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ArrowUp;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon-lg" type="button" variant="outline">
      <Icon aria-hidden="true" />
    </Button>
  );
}
