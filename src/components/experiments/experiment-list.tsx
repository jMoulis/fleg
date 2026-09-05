"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, FlaskConical, MapPin, Plus } from "lucide-react";

import {
  experimentMetricLabels,
  experimentStatusLabels,
  experimentTypeLabels,
} from "@/domain/experiments/labels";
import { getExperimentListView } from "@/domain/experiments/presentation";
import type {
  Experiment,
  ExperimentFixtureOption,
} from "@/domain/experiments/schemas";
import type { ProductOption } from "@/domain/products/schemas";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ExperimentListProps {
  baseHref: string;
  canWrite: boolean;
  experiments: Experiment[];
  fixtures: ExperimentFixtureOption[];
  products: ProductOption[];
}

const views = [
  { id: "prepare", label: "À préparer" },
  { id: "running", label: "En cours" },
  { id: "analyze", label: "À analyser" },
  { id: "finished", label: "Terminés" },
] as const;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function statusVariant(status: Experiment["status"]) {
  if (status === "cancelled") return "destructive" as const;
  if (status === "draft" || status === "awaiting_data") {
    return "secondary" as const;
  }
  if (status === "archived" || status === "concluded") {
    return "outline" as const;
  }
  return "default" as const;
}

export function ExperimentList({
  baseHref,
  canWrite,
  experiments,
  fixtures,
  products,
}: ExperimentListProps) {
  const initialView =
    views.find(({ id }) =>
      experiments.some((experiment) => getExperimentListView(experiment.status) === id),
    )?.id ?? "prepare";
  const [view, setView] = useState<(typeof views)[number]["id"]>(initialView);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.label])),
    [products],
  );
  const fixtureById = useMemo(
    () => new Map(fixtures.map((fixture) => [fixture.id, fixture.label])),
    [fixtures],
  );
  const visibleExperiments = experiments.filter(
    (experiment) => getExperimentListView(experiment.status) === view,
  );

  return (
    <>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="État des tests">
        {views.map((candidate) => {
          const count = experiments.filter(
            (experiment) =>
              getExperimentListView(experiment.status) === candidate.id,
          ).length;
          const selected = view === candidate.id;
          return (
            <Button
              aria-selected={selected}
              className="shrink-0"
              key={candidate.id}
              onClick={() => setView(candidate.id)}
              role="tab"
              type="button"
              variant={selected ? "default" : "outline"}
            >
              {candidate.label}
              <span className={cn("rounded-full px-1.5 text-xs", selected ? "bg-background/20" : "bg-muted")}>
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      {visibleExperiments.length === 0 ? (
        <Card className="mt-5">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FlaskConical aria-hidden="true" className="size-9 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Aucun test dans cette catégorie</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Une expérience permet de formaliser une hypothèse avant de modifier la présentation du rayon.
            </p>
            {canWrite ? (
              <Link className={buttonVariants({ className: "mt-5" })} href={`${baseHref}/new`}>
                <Plus aria-hidden="true" />
                Nouveau test
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {visibleExperiments.map((experiment) => {
            const productLabels = experiment.productIds
              .map((productId) => productById.get(productId))
              .filter((label): label is string => Boolean(label));
            const fixtureId = experiment.treatmentPlan.fixtureId;
            return (
              <Link
                className="group rounded-2xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm"
                href={`${baseHref}/${experiment.id}`}
                key={experiment.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {experimentTypeLabels[experiment.type]}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold leading-tight group-hover:text-primary">
                      {experiment.title}
                    </h2>
                  </div>
                  <Badge variant={statusVariant(experiment.status)}>
                    {experimentStatusLabels[experiment.status]}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {experiment.hypothesis}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarRange aria-hidden="true" className="size-3.5" />
                    {dateFormatter.format(new Date(experiment.plannedStartAt))} – {dateFormatter.format(new Date(experiment.plannedEndAt))}
                  </span>
                  {fixtureId ? (
                    <span className="flex items-center gap-1.5">
                      <MapPin aria-hidden="true" className="size-3.5" />
                      {fixtureById.get(fixtureId) ?? fixtureId}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                  <Badge variant="outline">
                    KPI · {experimentMetricLabels[experiment.primaryMetric]}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {productLabels.length > 0
                      ? productLabels.join(", ")
                      : experiment.family ?? "Périmètre rayon"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
