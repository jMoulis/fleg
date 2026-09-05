"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  FlaskConical,
  Link2,
  PackagePlus,
  Save,
  Target,
  X,
} from "lucide-react";

import type { CommercialEvent } from "@/domain/commercial-events/schemas";
import {
  addDays,
  startOfIsoWeek,
  toDateOnly,
} from "@/domain/commercial-events/calendar";
import {
  baselineMethodDescriptions,
  baselineMethodLabels,
  experimentMetricLabels,
  experimentTypeLabels,
} from "@/domain/experiments/labels";
import {
  dateInputToEndIso,
  dateInputToStartIso,
  isoToDateInput,
} from "@/domain/experiments/presentation";
import {
  baselineMethodSchema,
  experimentDefinitionSchema,
  experimentMetricSchema,
  experimentResponseSchema,
  experimentTypeSchema,
  type BaselineMethod,
  type Experiment,
  type ExperimentFixtureOption,
  type ExperimentMetric,
  type ExperimentType,
} from "@/domain/experiments/schemas";
import type { ProductOption } from "@/domain/products/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface ExperimentWizardProps {
  baseHref: string;
  commercialEvents: CommercialEvent[];
  fixtures: ExperimentFixtureOption[];
  initialExperiment?: Experiment;
  products: ProductOption[];
  storeId: string;
}

interface WizardDraft {
  title: string;
  hypothesis: string;
  type: ExperimentType;
  productIds: string[];
  family: string;
  linkedCommercialEventId: string;
  fixtureId: string;
  treatmentSummary: string;
  expectedChange: string;
  instructions: string;
  startDate: string;
  endDate: string;
  baselineMethod: BaselineMethod;
  comparablePeriods: string;
  trendNormalization: boolean;
  primaryMetric: ExperimentMetric;
  secondaryMetrics: ExperimentMetric[];
  guardrailMetrics: ExperimentMetric[];
  expectedEffectPercent: string;
  explicitCostsEuros: string;
  confounders: string;
}

const steps = [
  { label: "Hypothèse", icon: FlaskConical },
  { label: "Traitement", icon: PackagePlus },
  { label: "Période", icon: CalendarRange },
  { label: "Succès", icon: Target },
  { label: "Vérifier", icon: Check },
] as const;

const availableBaselineMethods: BaselineMethod[] = [
  "prior_comparable_periods",
  "prior_year",
  "internal_category_control",
];

const availableMetrics: ExperimentMetric[] = [
  "revenue",
  "quantity",
  "gross_margin_cents",
  "gross_margin_rate",
  "markdown_cents",
  "department_revenue",
];

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function eurosToCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Le coût doit être un montant positif");
  }
  return Math.round(amount * 100);
}

function defaultDraft(): WizardDraft {
  const nextMonday = startOfIsoWeek(addDays(toDateOnly(new Date()), 7));
  return {
    title: "",
    hypothesis: "",
    type: "tg_placement",
    productIds: [],
    family: "",
    linkedCommercialEventId: "",
    fixtureId: "",
    treatmentSummary: "",
    expectedChange: "",
    instructions: "",
    startDate: nextMonday,
    endDate: addDays(nextMonday, 6),
    baselineMethod: "prior_comparable_periods",
    comparablePeriods: "4",
    trendNormalization: true,
    primaryMetric: "revenue",
    secondaryMetrics: ["gross_margin_cents"],
    guardrailMetrics: ["markdown_cents"],
    expectedEffectPercent: "",
    explicitCostsEuros: "",
    confounders: "",
  };
}

function draftFromExperiment(experiment: Experiment): WizardDraft {
  return {
    title: experiment.title,
    hypothesis: experiment.hypothesis,
    type: experiment.type,
    productIds: experiment.productIds,
    family: experiment.family ?? "",
    linkedCommercialEventId: experiment.linkedCommercialEventId ?? "",
    fixtureId: experiment.treatmentPlan.fixtureId ?? "",
    treatmentSummary: experiment.treatmentPlan.summary,
    expectedChange: experiment.treatmentPlan.expectedChange,
    instructions: experiment.treatmentPlan.instructions.join("\n"),
    startDate: isoToDateInput(experiment.plannedStartAt),
    endDate: isoToDateInput(experiment.plannedEndAt),
    baselineMethod: experiment.baselineConfig.method,
    comparablePeriods: String(experiment.baselineConfig.comparablePeriods),
    trendNormalization: experiment.baselineConfig.trendNormalization,
    primaryMetric: experiment.primaryMetric,
    secondaryMetrics: experiment.secondaryMetrics,
    guardrailMetrics: experiment.guardrailMetrics,
    expectedEffectPercent:
      experiment.expectedRelativeEffect === null
        ? ""
        : String(experiment.expectedRelativeEffect * 100),
    explicitCostsEuros:
      experiment.explicitCostsCents === null
        ? ""
        : String(experiment.explicitCostsCents / 100),
    confounders: experiment.confounders.join("\n"),
  };
}

function apiMessage(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return null;
}

export function ExperimentWizard({
  baseHref,
  commercialEvents,
  fixtures,
  initialExperiment,
  products,
  storeId,
}: ExperimentWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(() =>
    initialExperiment ? draftFromExperiment(initialExperiment) : defaultDraft(),
  );
  const [productToAddId, setProductToAddId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.label])),
    [products],
  );
  const fixtureById = useMemo(
    () => new Map(fixtures.map((fixture) => [fixture.id, fixture.label])),
    [fixtures],
  );
  const eventById = useMemo(
    () => new Map(commercialEvents.map((event) => [event.id, event])),
    [commercialEvents],
  );

  function update<K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function validateStep(index: number): string | null {
    if (index === 0 && (!draft.title.trim() || !draft.hypothesis.trim())) {
      return "Donnez un nom au test et formulez l’hypothèse à vérifier.";
    }
    if (
      index === 1 &&
      (!draft.treatmentSummary.trim() || !draft.expectedChange.trim())
    ) {
      return "Décrivez ce qui sera changé et l’effet opérationnel attendu.";
    }
    if (
      index === 1 &&
      ["tg_placement", "space_change", "price_change", "promotion", "assortment"].includes(draft.type) &&
      draft.productIds.length === 0 &&
      !draft.family.trim()
    ) {
      return "Sélectionnez au moins un produit ou une famille.";
    }
    if (index === 1 && draft.type === "tg_placement" && !draft.fixtureId) {
      return "Sélectionnez la tête de gondole testée.";
    }
    if (index === 2 && (!draft.startDate || draft.startDate > draft.endDate)) {
      return "La fin du test ne peut pas précéder son début.";
    }
    return null;
  }

  function nextStep() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setStep((current) => Math.min(steps.length - 1, current + 1));
    setError(null);
  }

  function selectCommercialEvent(eventId: string) {
    const operation = eventById.get(eventId);
    if (!operation) {
      update("linkedCommercialEventId", "");
      return;
    }
    setDraft((current) => ({
      ...current,
      type: "tg_placement",
      linkedCommercialEventId: operation.id,
      fixtureId: operation.fixtureId,
      productIds: Array.from(
        new Set([...current.productIds, ...operation.productIds]),
      ),
      startDate: operation.startsOn,
      endDate: operation.endsOn,
      treatmentSummary:
        current.treatmentSummary ||
        `Mettre en œuvre « ${operation.title} » sur ${operation.fixtureName}.`,
      expectedChange:
        current.expectedChange ||
        "Augmenter la visibilité et les ventes des produits sélectionnés.",
    }));
    setError(null);
  }

  function toggleMetric(
    collection: "secondaryMetrics" | "guardrailMetrics",
    metric: ExperimentMetric,
  ) {
    if (metric === draft.primaryMetric) return;
    const otherCollection =
      collection === "secondaryMetrics" ? "guardrailMetrics" : "secondaryMetrics";
    const selected = draft[collection].includes(metric);
    setDraft((current) => ({
      ...current,
      [collection]: selected
        ? current[collection].filter((candidate) => candidate !== metric)
        : [...current[collection], metric],
      [otherCollection]: current[otherCollection].filter(
        (candidate) => candidate !== metric,
      ),
    }));
    setError(null);
  }

  function buildDefinition() {
    const expectedEffect = draft.expectedEffectPercent.trim()
      ? Number(draft.expectedEffectPercent.replace(",", ".")) / 100
      : null;
    const parsed = experimentDefinitionSchema.safeParse({
      title: draft.title,
      hypothesis: draft.hypothesis,
      type: draft.type,
      productIds: draft.productIds,
      family: draft.family.trim() || null,
      treatmentPlan: {
        summary: draft.treatmentSummary,
        fixtureId: draft.fixtureId || null,
        expectedChange: draft.expectedChange,
        instructions: splitLines(draft.instructions),
      },
      plannedStartAt: dateInputToStartIso(draft.startDate),
      plannedEndAt: dateInputToEndIso(draft.endDate),
      primaryMetric: draft.primaryMetric,
      secondaryMetrics: draft.secondaryMetrics,
      guardrailMetrics: draft.guardrailMetrics,
      baselineConfig: {
        method: draft.baselineMethod,
        comparablePeriods: Number(draft.comparablePeriods),
        trendNormalization: draft.trendNormalization,
        controlStoreIds: [],
      },
      expectedRelativeEffect: expectedEffect,
      explicitCostsCents: eurosToCents(draft.explicitCostsEuros),
      confounders: splitLines(draft.confounders),
      linkedCommercialEventId: draft.linkedCommercialEventId || null,
      linkedRecommendationId: initialExperiment?.linkedRecommendationId ?? null,
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ??
          "La définition du test doit être complétée.",
      );
    }
    return parsed.data;
  }

  async function requestExperiment(url: string, method: "POST" | "PATCH", body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        apiMessage(payload) ?? "Le test n’a pas pu être enregistré.",
      );
    }
    return experimentResponseSchema.parse(payload).experiment;
  }

  async function submit(intent: "save" | "plan") {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const definition = buildDefinition();
      let saved: Experiment;
      if (initialExperiment) {
        saved = await requestExperiment(
          `/api/stores/${storeId}/experiments/${initialExperiment.id}`,
          "PATCH",
          {
            ...definition,
            idempotencyKey: crypto.randomUUID(),
            basedOnUpdatedAt: initialExperiment.updatedAt,
            action: intent,
          },
        );
      } else {
        saved = await requestExperiment(
          `/api/stores/${storeId}/experiments`,
          "POST",
          { ...definition, idempotencyKey: crypto.randomUUID() },
        );
        if (intent === "plan") {
          try {
            saved = await requestExperiment(
              `/api/stores/${storeId}/experiments/${saved.id}`,
              "PATCH",
              {
                ...definition,
                idempotencyKey: crypto.randomUUID(),
                basedOnUpdatedAt: saved.updatedAt,
                action: "plan",
              },
            );
          } catch {
            router.push(`${baseHref}/${saved.id}?createdDraft=1`);
            return;
          }
        }
      }
      router.push(
        `${baseHref}/${saved.id}?${intent === "plan" ? "planned=1" : "saved=1"}`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le test n’a pas pu être enregistré.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <ol className="grid grid-cols-5 gap-1" aria-label="Étapes de création">
        {steps.map((wizardStep, index) => {
          const Icon = wizardStep.icon;
          const active = index === step;
          const complete = index < step;
          return (
            <li key={wizardStep.label}>
              <button
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.65rem] font-medium text-muted-foreground sm:text-xs",
                  active && "bg-primary text-primary-foreground",
                  complete && "text-primary",
                )}
                onClick={() => index <= step && setStep(index)}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">{wizardStep.label}</span>
                <span className="sm:hidden">{index + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <Card className="mt-4">
        {step === 0 ? (
          <>
            <CardHeader>
              <CardTitle>Que voulons-nous apprendre ?</CardTitle>
              <CardDescription>
                Une hypothèse claire relie une action précise à un résultat mesurable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="experiment-title">Nom du test</Label>
                <Input
                  id="experiment-title"
                  maxLength={180}
                  onBlur={() => {
                    if (!draft.hypothesis.trim() && draft.title.trim()) {
                      update(
                        "hypothesis",
                        `Si nous mettons en place « ${draft.title.trim()} », alors le KPI principal progressera sans dégrader les garde-fous.`,
                      );
                    }
                  }}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="Ex. Banane vrac en TG1"
                  value={draft.title}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experiment-hypothesis">Hypothèse</Label>
                <Textarea
                  id="experiment-hypothesis"
                  maxLength={2_000}
                  onChange={(event) => update("hypothesis", event.target.value)}
                  placeholder="Si… alors… parce que…"
                  value={draft.hypothesis}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experiment-type">Type de test</Label>
                <Select
                  onValueChange={(value) =>
                    update("type", experimentTypeSchema.parse(value))
                  }
                  value={draft.type}
                >
                  <SelectTrigger className="h-10 w-full" id="experiment-type">
                    <SelectValue>{experimentTypeLabels[draft.type]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {experimentTypeSchema.options.map((type) => (
                      <SelectItem key={type} value={type}>
                        {experimentTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <CardHeader>
              <CardTitle>Quel changement testons-nous ?</CardTitle>
              <CardDescription>
                Reliez si possible le test à une opération TG déjà planifiée.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="experiment-event">Opération commerciale liée</Label>
                <Select
                  onValueChange={(value) => selectCommercialEvent(value ?? "")}
                  value={draft.linkedCommercialEventId}
                >
                  <SelectTrigger className="h-10 w-full" id="experiment-event">
                    <SelectValue placeholder="Aucune opération liée">
                      {eventById.get(draft.linkedCommercialEventId)?.title ?? "Aucune opération liée"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {commercialEvents
                      .filter((event) => event.status !== "cancelled")
                      .map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.fixtureName} · {event.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {draft.linkedCommercialEventId ? (
                  <Button onClick={() => update("linkedCommercialEventId", "")} size="sm" type="button" variant="ghost">
                    <X aria-hidden="true" /> Délier l’opération
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="experiment-fixture">Mobilier ou TG</Label>
                <Select onValueChange={(value) => update("fixtureId", value ?? "")} value={draft.fixtureId}>
                  <SelectTrigger className="h-10 w-full" id="experiment-fixture">
                    <SelectValue placeholder="Choisir un emplacement">
                      {fixtureById.get(draft.fixtureId) ?? "Choisir un emplacement"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {fixtures.map((fixture) => (
                      <SelectItem key={fixture.id} value={fixture.id}>
                        {fixture.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Produits testés</Label>
                <div className="flex gap-2">
                  <Select onValueChange={(value) => setProductToAddId(value ?? "")} value={productToAddId}>
                    <SelectTrigger className="h-10 min-w-0 flex-1">
                      <SelectValue placeholder="Choisir un produit">
                        {productById.get(productToAddId) ?? "Choisir un produit"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((product) => !draft.productIds.includes(product.id))
                        .map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label="Ajouter le produit"
                    disabled={!productToAddId}
                    onClick={() => {
                      update("productIds", [...draft.productIds, productToAddId]);
                      setProductToAddId("");
                    }}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <PackagePlus aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.productIds.map((productId) => (
                    <Badge key={productId} variant="secondary">
                      {productById.get(productId) ?? "Produit indisponible"}
                      <button
                        aria-label={`Retirer ${productById.get(productId) ?? "le produit"}`}
                        onClick={() => update("productIds", draft.productIds.filter((id) => id !== productId))}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experiment-family">Famille, si le test porte sur un ensemble</Label>
                <Input id="experiment-family" maxLength={160} onChange={(event) => update("family", event.target.value)} placeholder="Ex. Bananes" value={draft.family} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="treatment-summary">Traitement prévu</Label>
                <Textarea id="treatment-summary" maxLength={1_000} onChange={(event) => update("treatmentSummary", event.target.value)} placeholder="Ce qui change concrètement en rayon" value={draft.treatmentSummary} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected-change">Effet opérationnel attendu</Label>
                <Textarea id="expected-change" maxLength={1_000} onChange={(event) => update("expectedChange", event.target.value)} placeholder="Ex. Plus de visibilité à trafic et prix constants" value={draft.expectedChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="treatment-instructions">Consignes, une par ligne</Label>
                <Textarea id="treatment-instructions" onChange={(event) => update("instructions", event.target.value)} placeholder={"Conserver le prix habituel\nVérifier le remplissage matin et soir"} value={draft.instructions} />
              </div>
            </CardContent>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <CardHeader>
              <CardTitle>Quand le test aura-t-il lieu ?</CardTitle>
              <CardDescription>
                La méthode de référence restera visible et sera gelée au démarrage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="experiment-start">Début</Label>
                  <Input id="experiment-start" onChange={(event) => update("startDate", event.target.value)} type="date" value={draft.startDate} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experiment-end">Fin</Label>
                  <Input id="experiment-end" onChange={(event) => update("endDate", event.target.value)} type="date" value={draft.endDate} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseline-method">Méthode de comparaison</Label>
                <Select onValueChange={(value) => update("baselineMethod", baselineMethodSchema.parse(value))} value={draft.baselineMethod}>
                  <SelectTrigger className="h-10 w-full" id="baseline-method">
                    <SelectValue>{baselineMethodLabels[draft.baselineMethod]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableBaselineMethods.map((method) => (
                      <SelectItem
                        disabled={method !== "prior_comparable_periods"}
                        key={method}
                        value={method}
                      >
                        {baselineMethodLabels[method]}
                        {method !== "prior_comparable_periods"
                          ? " — prochaine version"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm leading-5 text-muted-foreground">
                  {baselineMethodDescriptions[draft.baselineMethod]}
                </p>
              </div>
              <Alert>
                <CalendarRange aria-hidden="true" />
                <AlertTitle>Granularité mensuelle actuelle</AlertTitle>
                <AlertDescription>
                  Un test à la semaine peut être suivi sur le terrain, mais son
                  analyse restera en attente. Avec les imports actuels, une
                  baseline chiffrée nécessite un ou plusieurs mois civils complets.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="comparable-periods">Nombre de périodes comparables</Label>
                <Input id="comparable-periods" max="24" min="1" onChange={(event) => update("comparablePeriods", event.target.value)} type="number" value={draft.comparablePeriods} />
              </div>
              <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
                <input checked={draft.trendNormalization} className="mt-0.5 size-4 accent-primary" onChange={(event) => update("trendNormalization", event.target.checked)} type="checkbox" />
                <span>
                  <span className="block font-medium">Corriger la tendance générale du rayon</span>
                  <span className="mt-1 block text-muted-foreground">Cette option sera appliquée seulement si le dénominateur est suffisamment stable.</span>
                </span>
              </label>
            </CardContent>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <CardHeader>
              <CardTitle>Comment définir le succès ?</CardTitle>
              <CardDescription>
                Le KPI principal tranche l’hypothèse ; les garde-fous empêchent une fausse victoire.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="primary-metric">KPI principal</Label>
                <Select
                  onValueChange={(value) => {
                    const metric = experimentMetricSchema.parse(value);
                    setDraft((current) => ({
                      ...current,
                      primaryMetric: metric,
                      secondaryMetrics: current.secondaryMetrics.filter((item) => item !== metric),
                      guardrailMetrics: current.guardrailMetrics.filter((item) => item !== metric),
                    }));
                  }}
                  value={draft.primaryMetric}
                >
                  <SelectTrigger className="h-10 w-full" id="primary-metric">
                    <SelectValue>{experimentMetricLabels[draft.primaryMetric]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableMetrics.map((metric) => (
                      <SelectItem key={metric} value={metric}>
                        {experimentMetricLabels[metric]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MetricChoices label="Indicateurs secondaires" metrics={availableMetrics} onToggle={(metric) => toggleMetric("secondaryMetrics", metric)} primaryMetric={draft.primaryMetric} selected={draft.secondaryMetrics} />
              <MetricChoices label="Garde-fous" metrics={availableMetrics} onToggle={(metric) => toggleMetric("guardrailMetrics", metric)} primaryMetric={draft.primaryMetric} selected={draft.guardrailMetrics} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expected-effect">Effet attendu (%)</Label>
                  <Input id="expected-effect" max="1000" min="-100" onChange={(event) => update("expectedEffectPercent", event.target.value)} placeholder="Ex. 8" step="0.1" type="number" value={draft.expectedEffectPercent} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="explicit-costs">Coûts explicites (€)</Label>
                  <Input id="explicit-costs" min="0" onChange={(event) => update("explicitCostsEuros", event.target.value)} placeholder="Ex. 15" step="0.01" type="number" value={draft.explicitCostsEuros} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="known-confounders">Facteurs perturbateurs connus, un par ligne</Label>
                <Textarea id="known-confounders" onChange={(event) => update("confounders", event.target.value)} placeholder="Ex. Travaux à proximité du rayon" value={draft.confounders} />
              </div>
            </CardContent>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <CardHeader>
              <CardTitle>Vérifier avant de planifier</CardTitle>
              <CardDescription>
                La définition restera modifiable jusqu’au démarrage effectif du test.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReviewBlock title="Hypothèse" value={draft.hypothesis} />
              <ReviewBlock title="Traitement" value={`${draft.treatmentSummary}${draft.fixtureId ? ` · ${fixtureById.get(draft.fixtureId) ?? draft.fixtureId}` : ""}`} />
              <ReviewBlock title="Période" value={`${draft.startDate} → ${draft.endDate}`} />
              <ReviewBlock title="Référence" value={`${baselineMethodLabels[draft.baselineMethod]} · ${draft.comparablePeriods} période(s) · tendance ${draft.trendNormalization ? "corrigée" : "non corrigée"}`} />
              <ReviewBlock title="Critère principal" value={experimentMetricLabels[draft.primaryMetric]} />
              <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-primary">
                  <Link2 aria-hidden="true" className="size-4" />
                  Ce qui sera gelé au démarrage
                </p>
                <p className="mt-2 leading-6 text-muted-foreground">
                  Hypothèse, traitement, produits, période, méthode de comparaison, KPI et garde-fous. Le démarrage demandera ensuite de confirmer ce qui a réellement été installé.
                </p>
              </div>
            </CardContent>
          </>
        ) : null}
      </Card>

      {error ? (
        <Alert className="mt-4" variant="destructive">
          <AlertTitle>Vérification nécessaire</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-[4.35rem] z-10 mt-4 flex items-center justify-between gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        <Button disabled={step === 0 || pending} onClick={() => { setStep((current) => Math.max(0, current - 1)); setError(null); }} type="button" variant="outline">
          <ArrowLeft aria-hidden="true" /> Retour
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={nextStep} type="button">
            Continuer <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => submit("save")} type="button" variant="outline">
              <Save aria-hidden="true" /> Brouillon
            </Button>
            <Button disabled={pending} onClick={() => submit("plan")} type="button">
              <CalendarRange aria-hidden="true" /> Planifier
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricChoices({
  label,
  metrics,
  onToggle,
  primaryMetric,
  selected,
}: {
  label: string;
  metrics: ExperimentMetric[];
  onToggle: (metric: ExperimentMetric) => void;
  primaryMetric: ExperimentMetric;
  selected: ExperimentMetric[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {metrics.map((metric) => (
          <Button
            aria-pressed={selected.includes(metric)}
            disabled={metric === primaryMetric}
            key={metric}
            onClick={() => onToggle(metric)}
            size="sm"
            type="button"
            variant={selected.includes(metric) ? "secondary" : "outline"}
          >
            {selected.includes(metric) ? <Check aria-hidden="true" /> : null}
            {experimentMetricLabels[metric]}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-medium leading-6">{value || "—"}</p>
    </div>
  );
}
