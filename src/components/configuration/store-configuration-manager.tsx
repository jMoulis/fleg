"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Save,
  SlidersHorizontal,
  Target,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorSchema } from "@/domain/api/schemas";
import {
  periodTargetResponseSchema,
  periodTargetUpsertInputSchema,
  storeSettingsResponseSchema,
  storeSettingsUpdateInputSchema,
  type StoreConfigurationWorkspace,
  type StoreSettingsUpdateInput,
} from "@/domain/configuration/schemas";
import { formatMoney } from "@/lib/formatting";

interface StoreConfigurationManagerProps {
  canEditSettings: boolean;
  canEditTargets: boolean;
  initialWorkspace: StoreConfigurationWorkspace;
  storeId: string;
}

function euros(cents: number) {
  return (cents / 100).toFixed(2);
}

function percent(ratio: number) {
  return (ratio * 100).toFixed(2);
}

function formNumber(data: FormData, name: string) {
  return Number(data.get(name));
}

function formCents(data: FormData, name: string) {
  return Math.round(formNumber(data, name) * 100);
}

function formRatio(data: FormData, name: string) {
  return formNumber(data, name) / 100;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.message : "La requête n’a pas abouti",
    );
  }
  return body;
}

export function StoreConfigurationManager({
  canEditSettings,
  canEditTargets,
  initialWorkspace,
  storeId,
}: StoreConfigurationManagerProps) {
  const [settings, setSettings] = useState(initialWorkspace.settings);
  const [targets, setTargets] = useState(initialWorkspace.targets);
  const [targetPeriod, setTargetPeriod] = useState(
    initialWorkspace.targets[0]?.periodKey ?? new Date().toISOString().slice(0, 7),
  );
  const [targetEuros, setTargetEuros] = useState(() =>
    initialWorkspace.targets[0]
      ? euros(initialWorkspace.targets[0].targetRevenueCents)
      : "",
  );
  const [pending, setPending] = useState<"settings" | "target" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function selectTargetPeriod(periodKey: string) {
    setTargetPeriod(periodKey);
    const existing = targets.find((target) => target.periodKey === periodKey);
    setTargetEuros(existing ? euros(existing.targetRevenueCents) : "");
  }

  async function submitTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const existing = targets.find((target) => target.periodKey === targetPeriod);
    const parsed = periodTargetUpsertInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      basedOnUpdatedAt: existing?.updatedAt ?? null,
      periodKey: targetPeriod,
      targetRevenueCents: Math.round(Number(targetEuros) * 100),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Objectif invalide");
      return;
    }

    setPending("target");
    try {
      const result = periodTargetResponseSchema.parse(
        await requestJson(`/api/stores/${storeId}/targets`, {
          method: "PUT",
          body: JSON.stringify(parsed.data),
        }),
      );
      setTargets((current) =>
        [
          result.target,
          ...current.filter(({ periodKey }) => periodKey !== result.target.periodKey),
        ].sort((first, second) => second.periodKey.localeCompare(first.periodKey)),
      );
      setTargetEuros(euros(result.target.targetRevenueCents));
      setNotice(`Objectif ${result.target.periodKey} enregistré.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible");
    } finally {
      setPending(null);
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const data = new FormData(event.currentTarget);
    const updateInput: StoreSettingsUpdateInput = {
      idempotencyKey: crypto.randomUUID(),
      basedOnUpdatedAt: settings.updatedAt,
      settings: {
        analytics: {
          abcAThreshold: formRatio(data, "abcAThreshold"),
          abcBThreshold: formRatio(data, "abcBThreshold"),
          minimumSeasonalityBaseRevenueCents: formCents(
            data,
            "minimumSeasonalityBaseRevenue",
          ),
          retainedSeasonalityFloor: formNumber(data, "retainedSeasonalityFloor"),
          retainedSeasonalityCeiling: formNumber(
            data,
            "retainedSeasonalityCeiling",
          ),
          xyzWindowWeeks: formNumber(data, "xyzWindowWeeks"),
          xyzMinimumCompleteWeeks: formNumber(
            data,
            "xyzMinimumCompleteWeeks",
          ),
          xyzMinimumMeanWeeklyQuantity: formNumber(
            data,
            "xyzMinimumMeanWeeklyQuantity",
          ),
          xyzXMaxCoefficientOfVariation: formRatio(
            data,
            "xyzXMaxCoefficientOfVariation",
          ),
          xyzYMaxCoefficientOfVariation: formRatio(
            data,
            "xyzYMaxCoefficientOfVariation",
          ),
        },
        recommendations: {
          minimumActionRevenueCents: formCents(data, "minimumActionRevenue"),
          marginWatchRatio: formRatio(data, "marginWatchRatio"),
          pushForecastGrowthRatio: formRatio(data, "pushForecastGrowthRatio"),
          reduceForecastDeclineRatio: formRatio(
            data,
            "reduceForecastDeclineRatio",
          ),
        },
        experiments: {
          baseline: {
            minimumReliableComparablePeriods: formNumber(
              data,
              "minimumReliableComparablePeriods",
            ),
            robustAggregationMinimumPeriods: formNumber(
              data,
              "robustAggregationMinimumPeriods",
            ),
            minimumRelativeRevenueCents: formCents(
              data,
              "minimumRelativeRevenue",
            ),
            minimumRelativeMarginCents: formCents(
              data,
              "minimumRelativeMargin",
            ),
            minimumRelativeQuantity: formNumber(data, "minimumRelativeQuantity"),
            minimumTrendControlRevenueCents: formCents(
              data,
              "minimumTrendControlRevenue",
            ),
            maximumTrendControlCoefficientOfVariation: formRatio(
              data,
              "maximumTrendControlCoefficientOfVariation",
            ),
            minimumTrendFactor: formNumber(data, "minimumTrendFactor"),
            maximumTrendFactor: formNumber(data, "maximumTrendFactor"),
          },
          evaluation: {
            mediumHistoryPeriods: formNumber(data, "mediumHistoryPeriods"),
            highHistoryPeriods: formNumber(data, "highHistoryPeriods"),
            highBaselineCoefficientOfVariation: formRatio(
              data,
              "highBaselineCoefficientOfVariation",
            ),
            mediumBaselineCoefficientOfVariation: formRatio(
              data,
              "mediumBaselineCoefficientOfVariation",
            ),
            maximumLowDimensionsForMedium: formNumber(
              data,
              "maximumLowDimensionsForMedium",
            ),
            minimumHighDimensionsForHigh: formNumber(
              data,
              "minimumHighDimensionsForHigh",
            ),
            maximumDeviationsForMedium: formNumber(
              data,
              "maximumDeviationsForMedium",
            ),
            maximumConfoundersForMedium: formNumber(
              data,
              "maximumConfoundersForMedium",
            ),
            minimumRelativeMarkdownCents: formCents(
              data,
              "minimumRelativeMarkdown",
            ),
            practicalRelativeUpliftThreshold: formRatio(
              data,
              "practicalRelativeUpliftThreshold",
            ),
            criticalGuardrailRelativeChange: formRatio(
              data,
              "criticalGuardrailRelativeChange",
            ),
            materialEconomicLossCents: formCents(data, "materialEconomicLoss"),
          },
        },
        space: {
          allocation: {
            minimumFacingWidthM: formNumber(data, "minimumFacingWidthM"),
            targetProductsPerShelf: formNumber(data, "targetProductsPerShelf"),
            facingIncrementM: formNumber(data, "facingIncrementM"),
            markdownPenaltyWeight: formNumber(data, "markdownPenaltyWeight"),
          },
        },
      },
    };
    const parsed = storeSettingsUpdateInputSchema.safeParse(updateInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Réglages invalides");
      return;
    }

    setPending("settings");
    try {
      const result = storeSettingsResponseSchema.parse(
        await requestJson(`/api/stores/${storeId}/settings`, {
          method: "PATCH",
          body: JSON.stringify(parsed.data),
        }),
      );
      setSettings(result.settings);
      setNotice(`Réglages enregistrés · révision ${result.settings.revision}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert role="status" className="border-primary/20 bg-primary/[0.04]">
          <CheckCircle2 aria-hidden="true" className="text-primary" />
          <AlertTitle>Configuration mise à jour</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target aria-hidden="true" className="size-5 text-primary" />
            Objectifs mensuels
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Une source unique alimente l’atteinte d’objectif du magasin et du réseau.
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitTarget}>
            <div className="grid gap-1.5">
              <Label htmlFor="target-period">Période</Label>
              <Input
                disabled={!canEditTargets}
                id="target-period"
                onChange={(event) => selectTargetPeriod(event.target.value)}
                required
                type="month"
                value={targetPeriod}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="target-revenue">Objectif de CA (€)</Label>
              <Input
                disabled={!canEditTargets}
                id="target-revenue"
                inputMode="decimal"
                min="0"
                onChange={(event) => setTargetEuros(event.target.value)}
                required
                step="0.01"
                type="number"
                value={targetEuros}
              />
            </div>
            <Button
              className="sm:col-span-2 sm:justify-self-start"
              disabled={!canEditTargets || pending !== null}
              type="submit"
            >
              {pending === "target" ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              Enregistrer l’objectif
            </Button>
          </form>

          <div>
            <h3 className="text-sm font-semibold">Objectifs enregistrés</h3>
            {targets.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Aucun objectif mensuel. Le dashboard l’indiquera comme non configuré.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {targets.map((target) => (
                  <li key={target.id}>
                    <button
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-default"
                      disabled={!canEditTargets}
                      onClick={() => selectTargetPeriod(target.periodKey)}
                      type="button"
                    >
                      <span>{target.periodKey}</span>
                      <strong>{formatMoney(target.targetRevenueCents)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" className="size-5 text-primary" />
              Coefficients métier
            </CardTitle>
            <Badge variant="secondary">Révision {settings.revision}</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Les versions de calcul sont dérivées automatiquement de cette révision ; elles ne sont jamais saisies manuellement.
          </p>
        </CardHeader>
        <CardContent>
          <form key={settings.revision} className="space-y-4" onSubmit={submitSettings}>
            <SettingsSection title="Analyse, saisonnalité et XYZ" description={`Moteur ${settings.analytics.calculationVersion}`}>
              <NumberField disabled={!canEditSettings} id="abcAThreshold" label="Seuil ABC — classe A" defaultValue={percent(settings.analytics.abcAThreshold)} min={0.01} max={99.99} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="abcBThreshold" label="Seuil ABC — classe B" defaultValue={percent(settings.analytics.abcBThreshold)} min={0.01} max={100} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="minimumSeasonalityBaseRevenue" label="Base CA saisonnalité minimale" defaultValue={euros(settings.analytics.minimumSeasonalityBaseRevenueCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="retainedSeasonalityFloor" label="Indice saisonnier minimum" defaultValue={settings.analytics.retainedSeasonalityFloor} min={0.01} step={0.01} />
              <NumberField disabled={!canEditSettings} id="retainedSeasonalityCeiling" label="Indice saisonnier maximum" defaultValue={settings.analytics.retainedSeasonalityCeiling} min={0.01} step={0.01} />
              <NumberField disabled={!canEditSettings} id="xyzWindowWeeks" label="Fenêtre XYZ candidate" defaultValue={settings.analytics.xyzWindowWeeks} min={4} max={52} step={1} suffix="sem." />
              <NumberField disabled={!canEditSettings} id="xyzMinimumCompleteWeeks" label="Semaines complètes minimales" defaultValue={settings.analytics.xyzMinimumCompleteWeeks} min={2} max={52} step={1} suffix="sem." />
              <NumberField disabled={!canEditSettings} id="xyzMinimumMeanWeeklyQuantity" label="Demande hebdomadaire moyenne minimale" defaultValue={settings.analytics.xyzMinimumMeanWeeklyQuantity} min={0.001} max={1_000_000} step={0.001} suffix="unités" />
              <NumberField disabled={!canEditSettings} id="xyzXMaxCoefficientOfVariation" label="CV maximum — classe X" defaultValue={percent(settings.analytics.xyzXMaxCoefficientOfVariation)} min={0} max={500} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="xyzYMaxCoefficientOfVariation" label="CV maximum — classe Y" defaultValue={percent(settings.analytics.xyzYMaxCoefficientOfVariation)} min={0.01} max={500} step={0.01} suffix="%" />
            </SettingsSection>

            <SettingsSection title="Recommandations" description={`Règles ${settings.recommendations.modelVersion}`}>
              <NumberField disabled={!canEditSettings} id="minimumActionRevenue" label="CA minimum pour agir" defaultValue={euros(settings.recommendations.minimumActionRevenueCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="marginWatchRatio" label="Seuil de vigilance marge" defaultValue={percent(settings.recommendations.marginWatchRatio)} min={0} max={100} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="pushForecastGrowthRatio" label="Croissance prévisionnelle à pousser" defaultValue={percent(settings.recommendations.pushForecastGrowthRatio)} min={0.01} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="reduceForecastDeclineRatio" label="Baisse prévisionnelle à réduire" defaultValue={percent(settings.recommendations.reduceForecastDeclineRatio)} max={-0.01} step={0.01} suffix="%" />
            </SettingsSection>

            <SettingsSection title="Référence des expériences" description={`Moteur ${settings.experiments.baseline.engineVersion}`}>
              <NumberField disabled={!canEditSettings} id="minimumReliableComparablePeriods" label="Périodes comparables fiables" defaultValue={settings.experiments.baseline.minimumReliableComparablePeriods} min={1} max={24} step={1} />
              <NumberField disabled={!canEditSettings} id="robustAggregationMinimumPeriods" label="Périodes pour médiane robuste" defaultValue={settings.experiments.baseline.robustAggregationMinimumPeriods} min={2} max={24} step={1} />
              <NumberField disabled={!canEditSettings} id="minimumRelativeRevenue" label="Dénominateur CA minimum" defaultValue={euros(settings.experiments.baseline.minimumRelativeRevenueCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="minimumRelativeMargin" label="Dénominateur marge minimum" defaultValue={euros(settings.experiments.baseline.minimumRelativeMarginCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="minimumRelativeQuantity" label="Dénominateur quantité minimum" defaultValue={settings.experiments.baseline.minimumRelativeQuantity} min={0} step={0.01} />
              <NumberField disabled={!canEditSettings} id="minimumTrendControlRevenue" label="CA minimum du contrôle de tendance" defaultValue={euros(settings.experiments.baseline.minimumTrendControlRevenueCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="maximumTrendControlCoefficientOfVariation" label="CV maximum du contrôle" defaultValue={percent(settings.experiments.baseline.maximumTrendControlCoefficientOfVariation)} min={0.01} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="minimumTrendFactor" label="Facteur de tendance minimum" defaultValue={settings.experiments.baseline.minimumTrendFactor} min={0.01} step={0.01} />
              <NumberField disabled={!canEditSettings} id="maximumTrendFactor" label="Facteur de tendance maximum" defaultValue={settings.experiments.baseline.maximumTrendFactor} min={0.01} step={0.01} />
            </SettingsSection>

            <SettingsSection title="Évaluation des expériences" description={`Moteur ${settings.experiments.evaluation.engineVersion}`}>
              <NumberField disabled={!canEditSettings} id="mediumHistoryPeriods" label="Historique moyen" defaultValue={settings.experiments.evaluation.mediumHistoryPeriods} min={1} max={24} step={1} />
              <NumberField disabled={!canEditSettings} id="highHistoryPeriods" label="Historique élevé" defaultValue={settings.experiments.evaluation.highHistoryPeriods} min={2} max={24} step={1} />
              <NumberField disabled={!canEditSettings} id="highBaselineCoefficientOfVariation" label="CV pour qualité élevée" defaultValue={percent(settings.experiments.evaluation.highBaselineCoefficientOfVariation)} min={0.01} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="mediumBaselineCoefficientOfVariation" label="CV pour qualité moyenne" defaultValue={percent(settings.experiments.evaluation.mediumBaselineCoefficientOfVariation)} min={0.01} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="maximumLowDimensionsForMedium" label="Dimensions faibles tolérées" defaultValue={settings.experiments.evaluation.maximumLowDimensionsForMedium} min={0} max={6} step={1} />
              <NumberField disabled={!canEditSettings} id="minimumHighDimensionsForHigh" label="Dimensions élevées requises" defaultValue={settings.experiments.evaluation.minimumHighDimensionsForHigh} min={1} max={6} step={1} />
              <NumberField disabled={!canEditSettings} id="maximumDeviationsForMedium" label="Écarts d’exécution tolérés" defaultValue={settings.experiments.evaluation.maximumDeviationsForMedium} min={0} max={30} step={1} />
              <NumberField disabled={!canEditSettings} id="maximumConfoundersForMedium" label="Facteurs confondants tolérés" defaultValue={settings.experiments.evaluation.maximumConfoundersForMedium} min={0} max={30} step={1} />
              <NumberField disabled={!canEditSettings} id="minimumRelativeMarkdown" label="Démarque minimale comparable" defaultValue={euros(settings.experiments.evaluation.minimumRelativeMarkdownCents)} min={0} step={0.01} suffix="€" />
              <NumberField disabled={!canEditSettings} id="practicalRelativeUpliftThreshold" label="Uplift pratique minimum" defaultValue={percent(settings.experiments.evaluation.practicalRelativeUpliftThreshold)} min={0.01} max={100} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="criticalGuardrailRelativeChange" label="Variation critique garde-fou" defaultValue={percent(settings.experiments.evaluation.criticalGuardrailRelativeChange)} min={0.01} max={100} step={0.01} suffix="%" />
              <NumberField disabled={!canEditSettings} id="materialEconomicLoss" label="Perte économique matérielle" defaultValue={euros(settings.experiments.evaluation.materialEconomicLossCents)} min={0} step={0.01} suffix="€" />
            </SettingsSection>

            <SettingsSection title="Allocation de l’espace" description="Valeurs par défaut des nouveaux brouillons">
              <NumberField disabled={!canEditSettings} id="minimumFacingWidthM" label="Facing minimum" defaultValue={settings.space.allocation.minimumFacingWidthM} min={0.05} max={10} step={0.05} suffix="m" />
              <NumberField disabled={!canEditSettings} id="targetProductsPerShelf" label="Produits cibles par niveau" defaultValue={settings.space.allocation.targetProductsPerShelf} min={1} max={8} step={1} />
              <NumberField disabled={!canEditSettings} id="facingIncrementM" label="Pas de réglage" defaultValue={settings.space.allocation.facingIncrementM} min={0.01} max={1} step={0.01} suffix="m" />
              <NumberField disabled={!canEditSettings} id="markdownPenaltyWeight" label="Poids de la démarque observée" defaultValue={settings.space.allocation.markdownPenaltyWeight} min={0} max={2} step={0.05} suffix="×" />
            </SettingsSection>

            <Button disabled={!canEditSettings || pending !== null} type="submit">
              {pending === "settings" ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              Enregistrer les coefficients
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <details className="group rounded-xl border" open={title === "Analyse, saisonnalité et XYZ"}>
      <summary className="cursor-pointer list-none px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </summary>
      <div className="grid gap-4 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </details>
  );
}

function NumberField({
  defaultValue,
  disabled,
  id,
  label,
  max,
  min,
  step,
  suffix,
}: {
  defaultValue: number | string;
  disabled: boolean;
  id: string;
  label: string;
  max?: number;
  min?: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          className={suffix ? "pr-10" : undefined}
          defaultValue={defaultValue}
          disabled={disabled}
          id={id}
          max={max}
          min={min}
          name={id}
          required
          step={step}
          type="number"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
