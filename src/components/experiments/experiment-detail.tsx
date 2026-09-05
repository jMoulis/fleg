"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  CircleStop,
  Clock3,
  Lightbulb,
  Minus,
  PencilLine,
  Play,
  RefreshCw,
  Repeat2,
  Rocket,
  ShieldCheck,
  Square,
  Tags,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";

import {
  baselineMethodDescriptions,
  baselineMethodLabels,
  experimentMetricLabels,
  experimentManagerDecisionLabels,
  experimentStatusLabels,
  experimentTypeLabels,
  experimentVerdictLabels,
} from "@/domain/experiments/labels";
import type { ExperimentBaseline } from "@/domain/experiments/baseline";
import {
  experimentConclusionInputSchema,
  experimentConclusionResponseSchema,
  experimentManagerDecisionSchema,
  experimentVerdictSchema,
  suggestExperimentVerdict,
  type ExperimentConclusion,
  type ExperimentManagerDecision,
  type ExperimentSystemEvidenceSummary,
  type ExperimentVerdict,
} from "@/domain/experiments/conclusion";
import {
  experimentAnalysisResponseSchema,
  type ExperimentAnalysis,
  type MetricEvaluation,
} from "@/domain/experiments/evaluation-schemas";
import {
  experimentDefinitionFromRecord,
  getExperimentProgress,
} from "@/domain/experiments/presentation";
import {
  experimentResponseSchema,
  type Experiment,
  type ExperimentFixtureOption,
} from "@/domain/experiments/schemas";
import type { ProductOption } from "@/domain/products/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  formatMoney,
  formatQuantity,
  formatRatio,
} from "@/lib/formatting";

interface ExperimentDetailProps {
  baseHref: string;
  baseline: ExperimentBaseline;
  canConclude: boolean;
  canEvaluate: boolean;
  canStart: boolean;
  canWrite: boolean;
  fixtures: ExperimentFixtureOption[];
  initialExperiment: Experiment;
  initialAnalyses: ExperimentAnalysis[];
  initialConclusion: ExperimentConclusion | null;
  initialNotice?: "saved" | "planned" | "createdDraft";
  products: ProductOption[];
  storeId: string;
  userId: string;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseReusableTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function suggestedDecisionForVerdict(
  verdict: ExperimentVerdict,
): ExperimentManagerDecision {
  if (verdict === "winner") return "roll_out";
  if (verdict === "promising" || verdict === "inconclusive") return "repeat";
  if (verdict === "loser") return "stop";
  return "no_action";
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

function statusVariant(status: Experiment["status"]) {
  if (status === "cancelled") return "destructive" as const;
  if (status === "draft" || status === "awaiting_data") {
    return "secondary" as const;
  }
  if (status === "concluded" || status === "archived") {
    return "outline" as const;
  }
  return "default" as const;
}

export function ExperimentDetail({
  baseHref,
  baseline,
  canConclude,
  canEvaluate,
  canStart,
  canWrite,
  fixtures,
  initialExperiment,
  initialAnalyses,
  initialConclusion,
  initialNotice,
  products,
  storeId,
  userId,
}: ExperimentDetailProps) {
  const router = useRouter();
  const [experiment, setExperiment] = useState(initialExperiment);
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [conclusion, setConclusion] = useState(initialConclusion);
  const [startOpen, setStartOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initialNotice === "saved"
      ? "Brouillon enregistré."
      : initialNotice === "planned"
        ? "Test planifié."
        : initialNotice === "createdDraft"
          ? "Le brouillon a été créé, mais la planification n’a pas abouti. Vérifiez-le puis planifiez-le à nouveau."
          : null,
  );
  const [actualSummary, setActualSummary] = useState(
    experiment.treatmentPlan.summary,
  );
  const [actualFixtureId, setActualFixtureId] = useState(
    experiment.treatmentPlan.fixtureId ?? "",
  );
  const [implementationNotes, setImplementationNotes] = useState("");
  const [deviations, setDeviations] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [additionalConfounders, setAdditionalConfounders] = useState("");
  const initialSystemSuggestion = initialAnalyses[0]
    ? suggestExperimentVerdict(initialAnalyses[0])
    : null;
  const [managerVerdict, setManagerVerdict] = useState<ExperimentVerdict>(
    initialConclusion?.managerVerdict ??
      initialSystemSuggestion?.suggestedVerdict ??
      "inconclusive",
  );
  const [managerDecision, setManagerDecision] =
    useState<ExperimentManagerDecision>(
      initialConclusion?.managerDecision ??
        suggestedDecisionForVerdict(
          initialSystemSuggestion?.suggestedVerdict ?? "inconclusive",
        ),
    );
  const [conclusionRationale, setConclusionRationale] = useState(
    initialConclusion?.rationale ?? "",
  );
  const [reusableTags, setReusableTags] = useState(
    initialConclusion?.reusableTags.join(", ") ?? "",
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.label])),
    [products],
  );
  const fixtureById = useMemo(
    () => new Map(fixtures.map((fixture) => [fixture.id, fixture.label])),
    [fixtures],
  );
  const progress =
    experiment.status === "running" && experiment.actualStartAt
      ? getExperimentProgress({
          actualStartAt: experiment.actualStartAt,
          plannedEndAt: experiment.plannedEndAt,
          asOf: new Date().toISOString(),
        })
      : null;
  const canCancel =
    canWrite &&
    (experiment.status === "draft" ||
      experiment.status === "planned" ||
      (experiment.status === "running" && canStart));
  const latestAnalysis = analyses[0] ?? null;
  const systemSuggestion = useMemo(
    () => (latestAnalysis ? suggestExperimentVerdict(latestAnalysis) : null),
    [latestAnalysis],
  );
  const analysisIsCurrent =
    latestAnalysis?.dataRevision === baseline.dataRevision;

  async function mutate(url: string, method: "POST" | "PATCH", body: unknown) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiMessage(payload) ?? "L’action n’a pas pu être enregistrée.");
      }
      const updated = experimentResponseSchema.parse(payload).experiment;
      setExperiment(updated);
      setConfirmCancel(false);
      setStartOpen(false);
      setFinishOpen(false);
      router.refresh();
      return updated;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L’action n’a pas pu être enregistrée.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function start() {
    const updated = await mutate(
      `/api/stores/${storeId}/experiments/${experiment.id}/start`,
      "POST",
      {
        idempotencyKey: crypto.randomUUID(),
        basedOnUpdatedAt: experiment.updatedAt,
        treatmentActual: {
          summary: actualSummary,
          fixtureId: actualFixtureId || null,
          implementationNotes: implementationNotes.trim() || null,
          deviations: splitLines(deviations),
        },
      },
    );
    if (updated) setNotice("Le test est démarré et sa définition est maintenant gelée.");
  }

  async function finish() {
    const updated = await mutate(
      `/api/stores/${storeId}/experiments/${experiment.id}/finish`,
      "POST",
      {
        idempotencyKey: crypto.randomUUID(),
        basedOnUpdatedAt: experiment.updatedAt,
        completionNotes: completionNotes.trim() || null,
        additionalConfounders: splitLines(additionalConfounders),
      },
    );
    if (updated) setNotice("Exécution terminée. Le test attend maintenant les données nécessaires à l’analyse.");
  }

  async function cancel() {
    const updated = await mutate(
      `/api/stores/${storeId}/experiments/${experiment.id}`,
      "PATCH",
      {
        ...experimentDefinitionFromRecord(experiment),
        idempotencyKey: crypto.randomUUID(),
        basedOnUpdatedAt: experiment.updatedAt,
        action: "cancel",
      },
    );
    if (updated) setNotice("Test annulé. Sa trace reste conservée dans l’historique.");
  }

  async function evaluate() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/experiments/${experiment.id}/evaluate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            basedOnUpdatedAt: experiment.updatedAt,
          }),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(payload) ?? "L’analyse n’a pas pu être calculée.",
        );
      }
      const result = experimentAnalysisResponseSchema.parse(payload);
      const nextSuggestion = suggestExperimentVerdict(result.analysis);
      setExperiment(result.experiment);
      setAnalyses((current) => [
        result.analysis,
        ...current.filter((analysis) => analysis.id !== result.analysis.id),
      ]);
      setManagerVerdict(nextSuggestion.suggestedVerdict);
      setManagerDecision(
        suggestedDecisionForVerdict(nextSuggestion.suggestedVerdict),
      );
      setNotice(
        "Analyse enregistrée. Les résultats restent une estimation fondée sur les preuves disponibles.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "L’analyse n’a pas pu être calculée.",
      );
    } finally {
      setPending(false);
    }
  }

  async function conclude() {
    if (!latestAnalysis) return;
    const input = experimentConclusionInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      basedOnUpdatedAt: experiment.updatedAt,
      analysisId: latestAnalysis.id,
      managerVerdict,
      managerDecision,
      rationale: conclusionRationale,
      reusableTags: parseReusableTags(reusableTags),
    });
    if (!input.success) {
      setError(
        input.error.issues[0]?.message ??
          "La conclusion contient des valeurs invalides.",
      );
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/experiments/${experiment.id}/conclude`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(payload) ?? "La conclusion n’a pas pu être enregistrée.",
        );
      }
      const result = experimentConclusionResponseSchema.parse(payload);
      setExperiment(result.experiment);
      setConclusion(result.conclusion);
      setNotice(
        "Conclusion enregistrée. Le test et sa décision sont désormais figés dans le journal.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La conclusion n’a pas pu être enregistrée.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href={baseHref}>
        <ArrowLeft aria-hidden="true" />
        Retour aux tests
      </Link>

      <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-primary">
              {experimentTypeLabels[experiment.type]}
            </p>
            <Badge variant={statusVariant(experiment.status)}>
              {experimentStatusLabels[experiment.status]}
            </Badge>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            {experiment.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {dateFormatter.format(new Date(experiment.plannedStartAt))} – {dateFormatter.format(new Date(experiment.plannedEndAt))}
          </p>
        </div>
        {(experiment.status === "draft" || experiment.status === "planned") && canWrite ? (
          <Link className={buttonVariants({ variant: "outline" })} href={`${baseHref}/${experiment.id}/edit`}>
            <PencilLine aria-hidden="true" />
            Modifier
          </Link>
        ) : null}
      </div>

      {notice ? (
        <Alert className="mt-6 border-primary/25 bg-primary/[0.035]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{notice}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="mt-6" variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Action impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {experiment.status === "running" && progress ? (
        <Card className="mt-6 border-primary/25 bg-primary/[0.035]">
          <CardContent className="py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">En cours</p>
                <p className="mt-2 text-3xl font-semibold">J{progress.currentDay}/{progress.totalDays}</p>
              </div>
              <Badge>Définition gelée</Badge>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.elapsedRatio * 100}%` }} />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <ExecutionCheck label={experiment.treatmentActual?.fixtureId ? `${fixtureById.get(experiment.treatmentActual.fixtureId) ?? experiment.treatmentActual.fixtureId} confirmé` : "Emplacement confirmé"} />
              <ExecutionCheck label={`${experiment.productIds.length} produit(s) confirmé(s)`} />
              <ExecutionCheck label="Protocole et référence gelés" />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {experiment.status === "awaiting_data" ? (
        <Alert className="mt-6">
          <Clock3 aria-hidden="true" />
          <AlertTitle>Exécution terminée, données en attente</AlertTitle>
          <AlertDescription>
            Aucun uplift provisoire n’est affiché. L’analyse sera disponible lorsque les faits couvrant toute la période auront été importés.
          </AlertDescription>
        </Alert>
      ) : null}

      {(experiment.status === "awaiting_data" ||
        experiment.status === "analyzed") &&
      canEvaluate ? (
        <Card className="mt-6 border-primary/25">
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                {analysisIsCurrent
                  ? "Analyse à jour"
                  : latestAnalysis
                    ? "De nouvelles données sont disponibles"
                    : "Prêt pour l’analyse"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {baseline.readiness === "unavailable"
                  ? baseline.warnings[0]?.message
                  : "Le calcul sera figé dans une nouvelle version avec ses entrées et avertissements."}
              </p>
            </div>
            <Button
              disabled={
                pending || baseline.readiness === "unavailable" || analysisIsCurrent
              }
              onClick={evaluate}
              type="button"
            >
              {latestAnalysis ? (
                <RefreshCw aria-hidden="true" />
              ) : (
                <ChartNoAxesCombined aria-hidden="true" />
              )}
              {analysisIsCurrent
                ? "Analyse à jour"
                : latestAnalysis
                  ? "Recalculer"
                  : "Analyser le test"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {latestAnalysis && systemSuggestion ? (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <AnalysisResult analysis={latestAnalysis} />
          <ConclusionPanel
            analysis={latestAnalysis}
            baseHref={baseHref}
            canConclude={canConclude}
            conclusion={conclusion}
            managerDecision={managerDecision}
            managerVerdict={managerVerdict}
            onConclude={conclude}
            onDecisionChange={setManagerDecision}
            onRationaleChange={setConclusionRationale}
            onTagsChange={setReusableTags}
            onVerdictChange={setManagerVerdict}
            pending={pending}
            rationale={conclusionRationale}
            reusableTags={reusableTags}
            status={experiment.status}
            systemSuggestion={systemSuggestion}
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hypothèse</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-7">{experiment.hypothesis}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Traitement</CardTitle>
              <CardDescription>Ce qui doit changer en rayon.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="leading-7">{experiment.treatmentPlan.summary}</p>
              <div className="rounded-xl bg-muted/55 p-4 text-sm">
                <p className="font-medium">Effet opérationnel attendu</p>
                <p className="mt-1 leading-6 text-muted-foreground">{experiment.treatmentPlan.expectedChange}</p>
              </div>
              {experiment.treatmentPlan.instructions.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {experiment.treatmentPlan.instructions.map((instruction) => (
                    <li className="flex gap-2" key={instruction}>
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      {instruction}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Critères de succès</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DefinitionRow label="KPI principal" value={experimentMetricLabels[experiment.primaryMetric]} />
              <DefinitionRow label="Indicateurs secondaires" value={experiment.secondaryMetrics.map((metric) => experimentMetricLabels[metric]).join(", ") || "Aucun"} />
              <DefinitionRow label="Garde-fous" value={experiment.guardrailMetrics.map((metric) => experimentMetricLabels[metric]).join(", ") || "Aucun"} />
              <DefinitionRow label="Effet attendu" value={experiment.expectedRelativeEffect === null ? "Non défini" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(experiment.expectedRelativeEffect * 100)} %`} />
              <DefinitionRow label="Coûts explicites" value={formatMoney(experiment.explicitCostsCents)} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Référence</CardTitle>
                  <CardDescription>
                    {baselineMethodLabels[experiment.baselineConfig.method]}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    baseline.readiness === "ready"
                      ? "default"
                      : baseline.readiness === "limited"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {baseline.readiness === "ready"
                    ? "Calculable"
                    : baseline.readiness === "limited"
                      ? "À interpréter"
                      : "Indisponible"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="leading-6 text-muted-foreground">{baselineMethodDescriptions[experiment.baselineConfig.method]}</p>
              {baseline.controlComparison ? (
                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Témoins retenus
                    </p>
                    <Badge variant="outline">
                      {baseline.controlComparison.includedStoreCount}/{baseline.controlComparison.requestedStoreIds.length}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {baseline.controlComparison.stores.map((store) => (
                      <div className="rounded-lg bg-muted/55 px-3 py-2" key={store.storeId}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{store.storeName}</span>
                          <Badge variant={store.eligible ? "secondary" : "outline"}>
                            {store.eligible ? "Inclus" : "Exclu"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Produits correspondants {store.matchedProductCount}/{store.requestedProductCount} · révision {store.dataRevision}
                        </p>
                        {store.warnings.map((warning) => (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground" key={warning}>
                            {warning}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <DefinitionRow
                label="Historique disponible"
                value={`${baseline.availableComparablePeriods}/${baseline.requestedComparablePeriods} période(s)`}
              />
              <DefinitionRow
                label="Calcul"
                value={
                  baseline.aggregation === "median"
                    ? "Médiane robuste"
                    : baseline.aggregation === "mean"
                      ? "Moyenne"
                      : "Non calculé"
                }
              />
              <DefinitionRow
                label="Correction de tendance"
                value={
                  baseline.trendNormalization.applied &&
                  baseline.trendNormalization.factor !== null
                    ? `Appliquée (${formatRatio(baseline.trendNormalization.factor - 1)})`
                    : experiment.baselineConfig.trendNormalization
                      ? "En attente ou non fiable"
                      : "Désactivée"
                }
              />
              {baseline.expectedWithoutTest ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
                  <p className="font-medium text-primary">
                    Référence historique pré-test
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">CA produits</p>
                      <p className="mt-1 font-semibold">
                        {formatMoney(baseline.expectedWithoutTest.revenueCents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Marge</p>
                      <p className="mt-1 font-semibold">
                        {formatMoney(baseline.expectedWithoutTest.marginCents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Quantité</p>
                      <p className="mt-1 font-semibold">
                        {formatQuantity(baseline.expectedWithoutTest.quantity)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CA rayon</p>
                      <p className="mt-1 font-semibold">
                        {formatMoney(
                          baseline.expectedWithoutTest.departmentRevenueCents,
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Cette estimation ne constitue pas encore un résultat ni une preuve causale.
                  </p>
                </div>
              ) : null}
              {baseline.evidencePeriodKeys.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Périodes retenues
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {baseline.evidencePeriodKeys.map((periodKey) => (
                      <Badge key={periodKey} variant="outline">
                        {periodKey}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {baseline.warnings.length > 0 ? (
                <ul className="space-y-2 border-t pt-3">
                  {baseline.warnings.map((warning) => (
                    <li
                      className="flex gap-2 text-xs leading-5 text-muted-foreground"
                      key={warning.code}
                    >
                      <AlertCircle
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Périmètre terrain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DefinitionRow label="Emplacement" value={experiment.treatmentPlan.fixtureId ? fixtureById.get(experiment.treatmentPlan.fixtureId) ?? experiment.treatmentPlan.fixtureId : "Rayon"} />
              <DefinitionRow label="Produits" value={experiment.productIds.map((id) => productById.get(id) ?? "Produit indisponible").join(", ") || experiment.family || "Rayon complet"} />
              <DefinitionRow label="Responsable" value={experiment.ownerUserId === userId ? "Vous" : "Un autre responsable"} />
            </CardContent>
          </Card>

          {experiment.status === "planned" && canStart ? (
            <Card className="border-primary/25">
              <CardHeader>
                <CardTitle>Démarrer sur le terrain</CardTitle>
                <CardDescription>Confirmez ce qui est réellement installé avant de geler le protocole.</CardDescription>
              </CardHeader>
              <CardContent>
                {!startOpen ? (
                  <Button className="w-full" onClick={() => setStartOpen(true)} type="button">
                    <Play aria-hidden="true" /> Confirmer le démarrage
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="actual-fixture">Emplacement réel</Label>
                      <Select onValueChange={(value) => setActualFixtureId(value ?? "")} value={actualFixtureId}>
                        <SelectTrigger className="h-10 w-full" id="actual-fixture">
                          <SelectValue>{fixtureById.get(actualFixtureId) ?? "Choisir"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {fixtures.map((fixture) => <SelectItem key={fixture.id} value={fixture.id}>{fixture.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="actual-summary">Traitement réel</Label>
                      <Textarea id="actual-summary" onChange={(event) => setActualSummary(event.target.value)} value={actualSummary} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="implementation-notes">Observation de mise en place</Label>
                      <Textarea id="implementation-notes" onChange={(event) => setImplementationNotes(event.target.value)} placeholder="État du rayon, prix, remplissage…" value={implementationNotes} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="start-deviations">Écarts au protocole, un par ligne</Label>
                      <Textarea id="start-deviations" onChange={(event) => setDeviations(event.target.value)} value={deviations} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => setStartOpen(false)} type="button" variant="outline">Retour</Button>
                      <Button disabled={pending || !actualSummary.trim()} onClick={start} type="button"><Play aria-hidden="true" /> Démarrer</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {experiment.status === "running" && canStart ? (
            <Card className="border-primary/25">
              <CardHeader>
                <CardTitle>Terminer l’exécution</CardTitle>
                <CardDescription>Consignez les écarts observés avant d’attendre les données.</CardDescription>
              </CardHeader>
              <CardContent>
                {!finishOpen ? (
                  <Button className="w-full" onClick={() => setFinishOpen(true)} type="button">
                    <Square aria-hidden="true" /> Terminer le test
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="completion-notes">Bilan d’exécution</Label>
                      <Textarea id="completion-notes" onChange={(event) => setCompletionNotes(event.target.value)} placeholder="Le protocole a-t-il été tenu ?" value={completionNotes} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="additional-confounders">Facteurs perturbateurs, un par ligne</Label>
                      <Textarea id="additional-confounders" onChange={(event) => setAdditionalConfounders(event.target.value)} placeholder="Rupture, météo, travaux…" value={additionalConfounders} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => setFinishOpen(false)} type="button" variant="outline">Retour</Button>
                      <Button disabled={pending} onClick={finish} type="button"><CalendarCheck aria-hidden="true" /> Confirmer</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {canCancel ? (
            <Card>
              <CardContent className="pt-4">
                {!confirmCancel ? (
                  <Button className="w-full" onClick={() => setConfirmCancel(true)} type="button" variant="ghost">
                    <X aria-hidden="true" /> Annuler ce test
                  </Button>
                ) : (
                  <div role="alert">
                    <p className="text-sm font-medium">Annuler définitivement ce test ?</p>
                    <p className="mt-1 text-xs text-muted-foreground">La trace et l’audit seront conservés.</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button onClick={() => setConfirmCancel(false)} type="button" variant="outline">Retour</Button>
                      <Button disabled={pending} onClick={cancel} type="button" variant="destructive">Confirmer</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

const evidenceGradeLabels: Record<
  ExperimentAnalysis["evidenceQuality"]["grade"],
  string
> = {
  high: "Preuves fortes",
  medium: "Preuves modérées",
  low: "Preuves limitées",
};

const evidenceDimensionLabels: Record<
  ExperimentAnalysis["evidenceQuality"]["dimensions"][number]["dimension"],
  string
> = {
  history_depth: "Profondeur d’historique",
  baseline_stability: "Stabilité de la référence",
  date_granularity: "Précision des dates",
  control_quality: "Qualité du contrôle",
  execution_compliance: "Respect du protocole",
  confounders: "Facteurs perturbateurs",
};

function formatMetricValue(
  metric: Pick<MetricEvaluation, "unit">,
  value: number | null,
): string {
  if (value === null) return "—";
  if (metric.unit === "cents") return formatMoney(Math.round(value));
  if (metric.unit === "ratio") return formatRatio(value);
  return formatQuantity(value);
}

function AnalysisResult({ analysis }: { analysis: ExperimentAnalysis }) {
  const primary = analysis.metrics.find(
    ({ metric }) => metric === analysis.experimentSnapshot.primaryMetric,
  );
  const economics = analysis.economics;

  return (
    <section aria-labelledby="analysis-title" className="space-y-6">
      <Card className="overflow-hidden border-primary/25">
        <CardHeader className="bg-primary/[0.035]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle id="analysis-title">Résultat du test</CardTitle>
              <CardDescription>
                Analyse v{analysis.analysisVersion} · données révision {analysis.dataRevision}
              </CardDescription>
            </div>
            <Badge
              variant={
                analysis.evidenceQuality.grade === "high"
                  ? "default"
                  : analysis.evidenceQuality.grade === "medium"
                    ? "secondary"
                    : "outline"
              }
            >
              {evidenceGradeLabels[analysis.evidenceQuality.grade]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="py-6">
          {primary ? (
            <>
              <p className="text-sm font-medium text-muted-foreground">
                KPI principal · {experimentMetricLabels[primary.metric]}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ResultValue
                  label="Réalisé"
                  value={formatMetricValue(primary, primary.actual)}
                />
                <ResultValue
                  label="Attendu sans test"
                  value={formatMetricValue(primary, primary.expectedWithoutTest)}
                />
                <ResultValue
                  emphasized
                  label="Uplift estimé"
                  value={
                    primary.absoluteUplift === null
                      ? "—"
                      : `${formatMetricValue(primary, primary.absoluteUplift)}${
                          primary.relativeUplift === null
                            ? ""
                            : ` · ${formatRatio(primary.relativeUplift)}`
                        }`
                  }
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le KPI principal n’est pas calculable avec les données disponibles.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Cet uplift est une estimation contrefactuelle, pas une certitude causale.
          </p>
        </CardContent>
      </Card>

      {analysis.baseline.controlComparison ? (
        <ControlComparisonResult
          comparison={analysis.baseline.controlComparison}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Indicateurs évalués</CardTitle>
            <CardDescription>Réalisé, référence et écart par KPI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysis.metrics.map((metric) => (
              <div className="rounded-xl border p-4" key={metric.metric}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {experimentMetricLabels[metric.metric]}
                  </p>
                  <Badge variant="outline">
                    {evidenceGradeLabels[metric.quality]}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <MetricValue
                    label="Réalisé"
                    value={formatMetricValue(metric, metric.actual)}
                  />
                  <MetricValue
                    label="Attendu"
                    value={formatMetricValue(
                      metric,
                      metric.expectedWithoutTest,
                    )}
                  />
                  <MetricValue
                    label="Écart"
                    value={formatMetricValue(metric, metric.absoluteUplift)}
                  />
                </div>
                {metric.warnings.map((warning) => (
                  <p
                    className="mt-3 text-xs leading-5 text-muted-foreground"
                    key={warning}
                  >
                    {warning}
                  </p>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Économie incrémentale</CardTitle>
            <CardDescription>
              Marge supplémentaire, démarque et coûts déclarés.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DefinitionRow
              label="Marge incrémentale"
              value={formatMoney(economics.incrementalGrossMarginCents)}
            />
            <DefinitionRow
              label="Démarque incrémentale"
              value={formatMoney(economics.incrementalMarkdownCents)}
            />
            <DefinitionRow
              label="Coûts explicites"
              value={formatMoney(economics.explicitCostsCents)}
            />
            <div className="rounded-xl bg-muted/55 p-4">
              <p className="text-xs text-muted-foreground">
                {economics.complete
                  ? "Valeur incrémentale nette"
                  : "Sous-total des composants connus"}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(
                  economics.complete
                    ? economics.netIncrementalValueCents
                    : economics.knownComponentsValueCents,
                )}
              </p>
              {!economics.complete ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Résultat partiel : les composants absents ne sont pas assimilés à zéro.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pourquoi ce niveau de preuve ?</CardTitle>
          <CardDescription>
            Chaque dimension est explicite ; aucun score statistique n’est simulé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.evidenceQuality.dimensions.map((dimension) => (
              <div className="rounded-xl border p-4" key={dimension.dimension}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {evidenceDimensionLabels[dimension.dimension]}
                  </p>
                  <Badge variant="outline">
                    {dimension.grade === "high"
                      ? "Fort"
                      : dimension.grade === "medium"
                        ? "Moyen"
                        : "Faible"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {dimension.reason}
                </p>
              </div>
            ))}
          </div>
          {analysis.warnings.length > 0 ? (
            <div className="mt-5 space-y-2 border-t pt-5">
              {analysis.warnings.map((warning) => (
                <div
                  className="flex gap-2 text-sm text-muted-foreground"
                  key={warning.code}
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <p>{warning.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ControlComparisonResult({
  comparison,
}: {
  comparison: NonNullable<ExperimentAnalysis["baseline"]["controlComparison"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Lecture du magasin témoin</CardTitle>
            <CardDescription>
              {comparison.method === "difference_in_differences"
                ? "Effet = évolution du magasin testé − évolution moyenne des témoins."
                : "L’évolution relative moyenne des témoins est appliquée à la référence du magasin testé."}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {comparison.includedStoreCount}/{comparison.requestedStoreIds.length} témoin(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResultValue
            label="Testé avant"
            value={formatMoney(comparison.treatmentBefore?.revenueCents ?? null)}
          />
          <ResultValue
            label="Testé après"
            value={formatMoney(comparison.treatmentAfter?.revenueCents ?? null)}
          />
          <ResultValue
            label="Témoins avant"
            value={formatMoney(comparison.controlAverageBefore?.revenueCents ?? null)}
          />
          <ResultValue
            label="Témoins après"
            value={formatMoney(comparison.controlAverageAfter?.revenueCents ?? null)}
          />
        </div>
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
          <p className="text-xs font-medium text-primary">Effet CA estimé après contrôle</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatMoney(comparison.effectEstimate?.revenueCents ?? null)}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            La sélection des témoins est manuelle et l’hypothèse de tendances comparables reste à interpréter avec les facteurs terrain.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionIcon({ decision }: { decision: ExperimentManagerDecision }) {
  if (decision === "roll_out") return <Rocket aria-hidden="true" />;
  if (decision === "repeat") return <Repeat2 aria-hidden="true" />;
  if (decision === "modify_and_repeat") return <Wrench aria-hidden="true" />;
  if (decision === "stop") return <CircleStop aria-hidden="true" />;
  return <Minus aria-hidden="true" />;
}

function ConclusionPanel({
  analysis,
  baseHref,
  canConclude,
  conclusion,
  managerDecision,
  managerVerdict,
  onConclude,
  onDecisionChange,
  onRationaleChange,
  onTagsChange,
  onVerdictChange,
  pending,
  rationale,
  reusableTags,
  status,
  systemSuggestion,
}: {
  analysis: ExperimentAnalysis;
  baseHref: string;
  canConclude: boolean;
  conclusion: ExperimentConclusion | null;
  managerDecision: ExperimentManagerDecision;
  managerVerdict: ExperimentVerdict;
  onConclude: () => void;
  onDecisionChange: (decision: ExperimentManagerDecision) => void;
  onRationaleChange: (rationale: string) => void;
  onTagsChange: (tags: string) => void;
  onVerdictChange: (verdict: ExperimentVerdict) => void;
  pending: boolean;
  rationale: string;
  reusableTags: string;
  status: Experiment["status"];
  systemSuggestion: ExperimentSystemEvidenceSummary;
}) {
  const evidence = conclusion?.systemEvidenceSummary ?? systemSuggestion;
  const decisionLogHref = baseHref.replace(/\/experiments$/, "/decisions");

  return (
    <aside aria-labelledby="conclusion-title" className="xl:sticky xl:top-6">
      <Card className="border-primary/25">
        <CardHeader className="border-b">
          <CardTitle id="conclusion-title">Conclusion managériale</CardTitle>
          <CardDescription>
            Fondée sur l’analyse v{analysis.analysisVersion}. La décision finale
            reste explicitement humaine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl bg-muted/55 p-4">
            <div className="flex items-center gap-2">
              <Lightbulb aria-hidden="true" className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Suggestion du système
              </p>
            </div>
            <p className="mt-2 text-lg font-semibold">
              {experimentVerdictLabels[evidence.suggestedVerdict]}
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {evidence.reasons.map((reason) => (
                <li className="flex gap-2" key={reason}>
                  <span aria-hidden="true">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {conclusion ? (
            <div>
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 aria-hidden="true" className="size-5" />
                <p className="font-semibold">Décision enregistrée</p>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <DefinitionRow
                  label="Verdict manager"
                  value={experimentVerdictLabels[conclusion.managerVerdict]}
                />
                <DefinitionRow
                  label="Décision"
                  value={
                    experimentManagerDecisionLabels[
                      conclusion.managerDecision
                    ]
                  }
                />
              </dl>
              <div className="mt-4 rounded-xl border p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Justification
                </p>
                <p className="mt-2 text-sm leading-6">{conclusion.rationale}</p>
              </div>
              {conclusion.reusableTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {conclusion.reusableTags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Link
                className={buttonVariants({
                  className: "mt-5 w-full",
                  variant: "outline",
                })}
                href={decisionLogHref}
              >
                Ouvrir le journal des décisions
              </Link>
            </div>
          ) : status === "analyzed" && canConclude ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="manager-verdict">Verdict du manager</Label>
                <Select
                  onValueChange={(value) => {
                    const parsed = experimentVerdictSchema.safeParse(value);
                    if (parsed.success) onVerdictChange(parsed.data);
                  }}
                  value={managerVerdict}
                >
                  <SelectTrigger className="w-full" id="manager-verdict">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {experimentVerdictSchema.options.map((verdict) => (
                      <SelectItem key={verdict} value={verdict}>
                        {experimentVerdictLabels[verdict]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <fieldset>
                <legend className="text-sm font-medium">Décision à prendre</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {experimentManagerDecisionSchema.options.map((decision) => (
                    <Button
                      aria-pressed={managerDecision === decision}
                      className="justify-start"
                      key={decision}
                      onClick={() => onDecisionChange(decision)}
                      type="button"
                      variant={
                        managerDecision === decision ? "secondary" : "outline"
                      }
                    >
                      <DecisionIcon decision={decision} />
                      {experimentManagerDecisionLabels[decision]}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="conclusion-rationale">
                  Justification obligatoire
                </Label>
                <Textarea
                  id="conclusion-rationale"
                  maxLength={2_000}
                  onChange={(event) => onRationaleChange(event.target.value)}
                  placeholder="Expliquez le résultat, les réserves et la décision terrain…"
                  value={rationale}
                />
                <p className="text-xs text-muted-foreground">
                  20 caractères minimum · {rationale.trim().length}/2 000
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conclusion-tags">Enseignements réutilisables</Label>
                <div className="relative">
                  <Tags
                    aria-hidden="true"
                    className="absolute left-2.5 top-2 size-4 text-muted-foreground"
                  />
                  <Input
                    className="pl-8"
                    id="conclusion-tags"
                    onChange={(event) => onTagsChange(event.target.value)}
                    placeholder="TG, banane, saison été"
                    value={reusableTags}
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Séparez les tags par des virgules.
                </p>
              </div>

              <Button
                className="w-full"
                disabled={pending || rationale.trim().length < 20}
                onClick={onConclude}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" />
                {pending ? "Enregistrement…" : "Valider la conclusion"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                Cette action termine le test et crée une entrée immuable dans le
                journal des décisions.
              </p>
            </div>
          ) : status === "analyzed" ? (
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Conclusion réservée au manager</AlertTitle>
              <AlertDescription>
                Votre rôle permet de consulter l’analyse, mais pas de conclure le test.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}

function ResultValue({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={
        emphasized
          ? "rounded-xl border border-primary/25 bg-primary/[0.045] p-4"
          : "rounded-xl border p-4"
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function ExecutionCheck({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm">
      <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
      {label}
    </div>
  );
}

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium">{value}</span>
    </div>
  );
}
