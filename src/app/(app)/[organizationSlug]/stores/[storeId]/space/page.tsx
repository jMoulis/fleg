import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Layers3, Maximize2, MonitorCog, Pencil, Ruler, ShieldCheck } from "lucide-react";
import * as z from "zod";

import { LayoutPlan } from "@/components/space/layout-plan";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStoreContext } from "@/server/auth/store-context";
import { getCurrentStoreLayout } from "@/server/services/layout-service";
import type { FixtureType } from "@/domain/space/schemas";

export const metadata: Metadata = {
  title: "Espace — F&L Cockpit",
};

interface StoreSpacePageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ savedVersion?: string }>;
}

const meterFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

const layoutStatusLabels = {
  seed_dimensions_to_confirm: "Dimensions à confirmer",
  draft: "Brouillon",
  active: "Plan actif",
  superseded: "Version remplacée",
} as const;

const fixtureTypeLabels: Record<FixtureType, string> = {
  island: "Îlot",
  endcap: "TG",
  wall: "Mur",
  bin: "Bac",
};

export default async function StoreSpacePage({ params, searchParams }: StoreSpacePageProps) {
  const [{ organizationSlug, storeId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const savedVersion = z.coerce.number().int().positive().safeParse(query.savedVersion);
  const context = await requireStoreContext(
    storeId,
    ["stores.read"],
    requestHeaders,
  );
  const { layout, summary } = await getCurrentStoreLayout(context);

  if (!layout || !summary) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Contexte magasin autorisé
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Espace</h1>
        <Card className="mt-8">
          <CardContent className="py-14 text-center">
            <Ruler aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Aucun plan versionné</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Le plan de référence doit être initialisé pour ce magasin avant de
              pouvoir préparer une implantation.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Plan magasin autorisé
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Espace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {layout.name} · version {layout.version}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="w-fit gap-1.5">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            {layoutStatusLabels[layout.status]}
          </Badge>
          {context.permissions.includes("layouts.write") ? (
            <Link
              className={buttonVariants()}
              href={`/${organizationSlug}/stores/${storeId}/space/edit`}
            >
              <Pencil aria-hidden="true" />
              Modifier le plan
            </Link>
          ) : null}
          {context.permissions.includes("analytics.read") ? (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/${organizationSlug}/stores/${storeId}/space/allocations`}
            >
              <MonitorCog aria-hidden="true" />
              Allouer l’espace
            </Link>
          ) : null}
        </div>
      </div>

      {savedVersion.success ? (
        <Alert className="mt-6 border-primary/25 bg-primary/[0.04]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Version {savedVersion.data} enregistrée</AlertTitle>
          <AlertDescription>
            Le plan précédent est conservé et cette nouvelle version est disponible comme brouillon.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Capacité du plan" className="mt-8 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={Layers3}
          label="Mobilier"
          value={`${summary.fixtureCount} éléments`}
          helper={`${summary.faceCount} faces · ${summary.moduleCount} modules · ${summary.shelfCount} niveaux`}
        />
        <MetricCard
          icon={Maximize2}
          label="Surface d’exposition"
          value={`${meterFormatter.format(summary.shelfDisplayAreaM2)} m²`}
          helper={`${meterFormatter.format(summary.fixtureFloorAreaM2)} m² d’emprise mobilier`}
        />
        <MetricCard
          icon={Ruler}
          label="Largeur commerciale effective"
          value={`${meterFormatter.format(summary.effectiveCommercialWidthM)} m`}
          helper="Coefficients conservés avec la version"
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.5fr)]">
        <section aria-labelledby="plan-title">
          <div className="mb-4">
            <p className="text-sm font-semibold text-primary">Implantation</p>
            <h2 id="plan-title" className="mt-1 text-xl font-semibold">
              Aperçu de la version {layout.version}
            </h2>
          </div>
          <LayoutPlan layout={layout} />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Aperçu normalisé : il sert à identifier les mobiliers et leurs
            relations, pas à effectuer un relevé métrique du magasin.
          </p>
        </section>

        <aside aria-labelledby="fixtures-title">
          <h2 id="fixtures-title" className="text-xl font-semibold">Mobilier référencé</h2>
          <div className="mt-4 space-y-3">
            {layout.fixtures.map((fixture) => (
              <Card key={fixture.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{fixture.name}</CardTitle>
                    <Badge variant="outline">
                      {fixtureTypeLabels[fixture.type]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {meterFormatter.format(fixture.depthM)} × {meterFormatter.format(fixture.widthM)} m
                  · {fixture.faces.length} {fixture.faces.length > 1 ? "faces" : "face"}
                  · {fixture.faces.reduce((total, face) => total + face.modules.length, 0)} modules
                </CardContent>
              </Card>
            ))}
          </div>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="notes-title">
        <Card className="border-amber-500/25 bg-amber-500/[0.04]">
          <CardHeader>
            <CardTitle id="notes-title">Hypothèses de la version</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              {layout.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Layers3;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon aria-hidden="true" className="size-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-[-0.035em]">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}
