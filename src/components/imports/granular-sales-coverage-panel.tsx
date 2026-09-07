"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarRange,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  dailySalesReadResponseSchema,
  monthlySalesReconciliationResponseSchema,
  weeklySalesReadResponseSchema,
  type DailySalesReadResponse,
  type MonthlySalesReconciliationResponse,
  type WeeklySalesReadResponse,
} from "@/domain/analytics/granular-sales-schemas";
import { apiErrorSchema } from "@/domain/api/schemas";

interface GranularSalesCoveragePanelProps {
  storeId: string;
  refreshToken: number;
}

interface GranularViews {
  daily: DailySalesReadResponse;
  weekly: WeeklySalesReadResponse;
  reconciliation: MonthlySalesReconciliationResponse;
}

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; views: GranularViews };

const euroFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const quantityFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});
const ratioFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 2,
});

async function responseError(response: Response): Promise<Error> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  return new Error(
    parsed.success ? parsed.data.message : "Les données granulaires sont indisponibles.",
  );
}

async function loadGranularViews(input: {
  storeId: string;
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<GranularViews> {
  const parameters = new URLSearchParams();
  if (input.from && input.to) {
    parameters.set("from", input.from);
    parameters.set("to", input.to);
  }
  const suffix = parameters.size > 0 ? `?${parameters.toString()}` : "";
  const [dailyResponse, weeklyResponse] = await Promise.all([
    fetch(`/api/stores/${input.storeId}/sales/daily${suffix}`, {
      signal: input.signal,
      headers: { Accept: "application/json" },
    }),
    fetch(`/api/stores/${input.storeId}/sales/weekly${suffix}`, {
      signal: input.signal,
      headers: { Accept: "application/json" },
    }),
  ]);
  if (!dailyResponse.ok) throw await responseError(dailyResponse);
  if (!weeklyResponse.ok) throw await responseError(weeklyResponse);

  const daily = dailySalesReadResponseSchema.safeParse(
    await dailyResponse.json(),
  );
  const weekly = weeklySalesReadResponseSchema.safeParse(
    await weeklyResponse.json(),
  );
  if (!daily.success || !weekly.success) {
    throw new Error("La réponse de lecture granulaire est invalide.");
  }

  const reconciliationResponse = await fetch(
    `/api/stores/${input.storeId}/sales/reconciliation?period=${daily.data.to.slice(0, 7)}`,
    {
      signal: input.signal,
      headers: { Accept: "application/json" },
    },
  );
  if (!reconciliationResponse.ok) {
    throw await responseError(reconciliationResponse);
  }
  const reconciliation = monthlySalesReconciliationResponseSchema.safeParse(
    await reconciliationResponse.json(),
  );
  if (!reconciliation.success) {
    throw new Error("La réponse de réconciliation est invalide.");
  }

  return {
    daily: daily.data,
    weekly: weekly.data,
    reconciliation: reconciliation.data,
  };
}

function coverageLabel(status: "complete" | "partial" | "unknown") {
  if (status === "complete") return "Complète";
  if (status === "partial") return "Partielle";
  return "Inconnue";
}

function reconciliationLabel(
  status: MonthlySalesReconciliationResponse["status"],
) {
  const labels = {
    matched: "Réconcilié",
    mismatch: "Écart détecté",
    incomplete_daily: "Journalier incomplet",
    daily_missing: "Journalier absent",
    monthly_missing: "Mensuel absent",
  } satisfies Record<MonthlySalesReconciliationResponse["status"], string>;
  return labels[status];
}

export function GranularSalesCoveragePanel({
  storeId,
  refreshToken,
}: GranularSalesCoveragePanelProps) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadGranularViews({ storeId, signal: controller.signal })
      .then((views) => {
        setState({ status: "ready", views });
        setFrom(views.daily.from);
        setTo(views.daily.to);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Les données granulaires sont indisponibles.",
        });
      });
    return () => controller.abort();
  }, [storeId, refreshToken]);

  async function handleRefresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      const views = await loadGranularViews({ storeId, from, to });
      setState({ status: "ready", views });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Les données granulaires sont indisponibles.",
      });
    }
  }

  return (
    <Card aria-labelledby="granular-coverage-title">
      <CardHeader>
        <CardTitle id="granular-coverage-title" className="flex items-center gap-2">
          <CalendarRange aria-hidden="true" className="size-5 text-primary" />
          Couverture et vues hebdomadaires
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Les jours absents restent inconnus. Ils ne sont jamais remplacés par des ventes nulles.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={handleRefresh}
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <Field>
            <FieldLabel htmlFor="granular-sales-from">Du</FieldLabel>
            <Input
              id="granular-sales-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="granular-sales-to">Au</FieldLabel>
            <Input
              id="granular-sales-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" variant="outline" disabled={state.status === "loading"}>
            {state.status === "loading" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            Actualiser
          </Button>
        </form>

        <div aria-live="polite">
          {state.status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Calcul des vues granulaires…
            </p>
          ) : null}
          {state.status === "error" ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Lecture impossible</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {state.status === "ready" ? <GranularViewsContent views={state.views} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function GranularViewsContent({ views }: { views: GranularViews }) {
  const { daily, weekly, reconciliation } = views;

  if (daily.days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="font-medium">Aucune vente journalière observée</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Importez un export journalier pour alimenter les vues quotidiennes et hebdomadaires.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Synthèse journalière">
        <Metric label="Couverture" value={coverageLabel(daily.coverage.status)} />
        <Metric label="Jours observés" value={`${daily.coverage.observedDates.length}/${daily.coverage.expectedDates.length}`} />
        <Metric label="Chiffre d’affaires" value={euroFormatter.format(daily.totals.revenueCents / 100)} />
        <Metric label="Quantité" value={quantityFormatter.format(daily.totals.quantity)} />
      </section>

      {daily.warnings.length > 0 ? (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Qualité de la couverture</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {daily.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-3xl text-left text-sm">
          <caption className="sr-only">Ventes regroupées par semaine ISO</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium" scope="col">Semaine</th>
              <th className="px-4 py-3 font-medium" scope="col">Couverture</th>
              <th className="px-4 py-3 text-right font-medium" scope="col">Quantité</th>
              <th className="px-4 py-3 text-right font-medium" scope="col">CA</th>
              <th className="px-4 py-3 text-right font-medium" scope="col">Marge</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {weekly.weeks.map((week) => (
              <tr key={week.isoWeekKey}>
                <th className="px-4 py-3 font-medium" scope="row">
                  {week.isoWeekKey}
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {week.startsOn} — {week.endsOn}
                  </span>
                </th>
                <td className="px-4 py-3">
                  {coverageLabel(week.coverage.status)} · {week.coverage.observedDates.length}/7
                </td>
                <td className="px-4 py-3 text-right">{quantityFormatter.format(week.totals.quantity)}</td>
                <td className="px-4 py-3 text-right">{euroFormatter.format(week.totals.revenueCents / 100)}</td>
                <td className="px-4 py-3 text-right">{euroFormatter.format(week.totals.marginCents / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-muted/45 p-4" aria-labelledby="monthly-reconciliation-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h4 id="monthly-reconciliation-title" className="font-medium">
            Réconciliation {reconciliation.periodKey}
          </h4>
          <p className="text-sm font-medium">{reconciliationLabel(reconciliation.status)}</p>
        </div>
        {reconciliation.deltas ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Écart CA : {euroFormatter.format(reconciliation.deltas.revenueCents / 100)}
            {reconciliation.deltas.revenueRatio === null
              ? " (ratio indisponible)"
              : ` (${ratioFormatter.format(reconciliation.deltas.revenueRatio)})`}
            {" · "}Écart marge : {euroFormatter.format(reconciliation.deltas.marginCents / 100)}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Les écarts ne sont calculés que lorsque le mois journalier est complet et qu’une synthèse mensuelle existe.
          </p>
        )}
        {reconciliation.warnings.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {reconciliation.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.02em]">{value}</p>
    </div>
  );
}
