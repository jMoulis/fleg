import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeEuro,
  BarChart3,
  Bot,
  ChevronDown,
  CircleGauge,
  DatabaseZap,
  Leaf,
  Network,
  Scale,
  ShieldCheck,
  Store,
  Target,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { periodKeySchema } from "@/domain/imports/schemas";
import { networkDashboardQuerySchema } from "@/domain/network/schemas";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { formatMoney, formatQuantity, formatRatio } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { getNetworkDashboard } from "@/server/services/network-analytics-service";
import {
  listComparableStoresForOrganization,
  requireNetworkStoreSet,
} from "@/server/services/store-access-service";

export const metadata: Metadata = {
  title: "Vue réseau — F&L Cockpit",
};

interface NetworkPageProps {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{
    period?: string;
    scope?: string;
    storeId?: string | string[];
  }>;
}

function queryStoreIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatMeters(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} m`;
}

function networkHref(input: {
  organizationSlug: string;
  periodKey: string;
  storeId: string;
}) {
  const base = `/${input.organizationSlug}/stores/${input.storeId}/dashboard`;
  return input.periodKey ? `${base}?period=${input.periodKey}` : base;
}

function networkCopilotHref(input: {
  organizationSlug: string;
  periodKey: string;
  storeIds: string[];
}) {
  const query = new URLSearchParams();
  input.storeIds.forEach((storeId) => query.append("storeId", storeId));
  if (input.periodKey) query.set("period", input.periodKey);
  return `/${input.organizationSlug}/network/copilot?${query.toString()}`;
}

export default async function NetworkPage({
  params,
  searchParams,
}: NetworkPageProps) {
  const [{ organizationSlug }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  let comparableStores;

  try {
    comparableStores = await listComparableStoresForOrganization(
      organizationSlug,
      requestHeaders,
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    throw error;
  }

  if (comparableStores.length === 0) notFound();

  const requestedStoreIds = queryStoreIds(query.storeId);
  if (query.scope !== undefined && query.scope !== "custom") notFound();
  if (query.scope === "custom" && requestedStoreIds.length === 0) notFound();
  const parsedPeriod = query.period
    ? periodKeySchema.safeParse(query.period)
    : null;
  if (parsedPeriod && !parsedPeriod.success) notFound();

  let selected = comparableStores;
  if (requestedStoreIds.length > 0) {
    const parsedSelection = networkDashboardQuerySchema.safeParse({
      storeIds: requestedStoreIds,
      period: parsedPeriod?.data,
    });
    if (!parsedSelection.success) notFound();

    const comparableById = new Map(
      comparableStores.map((entry) => [entry.store.id, entry]),
    );
    if (parsedSelection.data.storeIds.some((id) => !comparableById.has(id))) {
      notFound();
    }
    selected = parsedSelection.data.storeIds.map(
      (id) => comparableById.get(id)!,
    );
  }

  let contexts = selected.map(({ context }) => context);
  try {
    if (requestedStoreIds.length > 0) {
      contexts = await requireNetworkStoreSet(requestedStoreIds, requestHeaders);
    }
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (
      error instanceof StoreAccessDeniedError ||
      error instanceof NetworkStoreSetError
    ) {
      notFound();
    }
    throw error;
  }

  const dashboard = await getNetworkDashboard(contexts, parsedPeriod?.data);
  const fallbackPeriod = parsedPeriod?.data ?? "";
  const periodKey = dashboard?.periodKey ?? fallbackPeriod;
  const backStore = selected[0]!.store;
  const selectedIds = new Set(selected.map(({ store }) => store.id));

  return (
    <div className="min-h-svh bg-muted/35">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/stores" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-4">F&amp;L Cockpit</p>
              <p className="mt-1 text-xs text-muted-foreground">Vue réseau</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={networkHref({
                organizationSlug,
                periodKey,
                storeId: backStore.id,
              })}
              className={buttonVariants({ variant: "ghost" })}
              aria-label="Retour au magasin"
            >
              <ArrowLeft aria-hidden="true" />
              <span className="hidden sm:inline">Retour au magasin</span>
            </Link>
            <Link href="/stores" className={buttonVariants({ variant: "outline" })}>
              <Store aria-hidden="true" />
              <span className="hidden sm:inline">Changer de magasin</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck aria-hidden="true" className="size-4" />
              {selected.length} magasin{selected.length > 1 ? "s" : ""} explicitement autorisé{selected.length > 1 ? "s" : ""}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              Tableau de bord réseau
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Totaux consolidés et comparaison normalisée par mètre commercial effectif. Le chiffre d’affaires brut n’est jamais utilisé seul pour classer les magasins.
            </p>
          </div>

          <form className="flex flex-wrap items-end gap-2" method="get">
            <input type="hidden" name="scope" value="custom" />
            <Link
              href={networkCopilotHref({
                organizationSlug,
                periodKey,
                storeIds: selected.map(({ store }) => store.id),
              })}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Bot aria-hidden="true" />
              Copilote réseau
            </Link>
            <details className="group relative">
              <summary className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer list-none")}>
                <Network aria-hidden="true" />
                Périmètre ({selected.length})
                <ChevronDown aria-hidden="true" className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
                <fieldset>
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Magasins comparables
                  </legend>
                  <div className="mt-2 grid gap-1">
                    {comparableStores.map(({ store }) => (
                      <label
                        key={store.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          name="storeId"
                          value={store.id}
                          defaultChecked={selectedIds.has(store.id)}
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{store.name}</span>
                          <span className="block text-xs text-muted-foreground">{store.code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </details>
            <label htmlFor="period" className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Période
              <input
                id="period"
                name="period"
                type="month"
                defaultValue={periodKey}
                className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <button type="submit" className={buttonVariants()}>
              Comparer
            </button>
          </form>
        </div>

        {!dashboard ? (
          <Card className="mt-8 border-primary/15 bg-primary/[0.035]">
            <CardContent className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <DatabaseZap aria-hidden="true" className="size-7" />
              </span>
              <h2 className="mt-5 text-xl font-semibold">Aucune donnée réseau</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Aucun des magasins sélectionnés ne possède encore de période de vente engagée. Importez les données magasin avant de lancer la comparaison.
              </p>
              <Link
                href={`/${organizationSlug}/stores/${backStore.id}/imports`}
                className={cn(buttonVariants({ size: "lg" }), "mt-6")}
              >
                Ouvrir les imports
              </Link>
            </CardContent>
          </Card>
        ) : (
          <NetworkDashboardContent
            dashboard={dashboard}
            organizationSlug={organizationSlug}
          />
        )}
      </main>
    </div>
  );
}

function NetworkDashboardContent({
  dashboard,
  organizationSlug,
}: {
  dashboard: NonNullable<Awaited<ReturnType<typeof getNetworkDashboard>>>;
  organizationSlug: string;
}) {
  const rankedStores = dashboard.stores.filter(
    (store) => store.normalizedRank !== null,
  );
  const maxProductivity = Math.max(
    1,
    ...rankedStores.map((store) => store.revenuePerEffectiveMeterCents ?? 0),
  );
  const marginLabel =
    dashboard.postMarkdownMarginCents === null
      ? "Marge brute réseau"
      : "Marge après démarque";
  const marginValue =
    dashboard.postMarkdownMarginCents ?? dashboard.marginCents;

  return (
    <>
      {dashboard.warnings.length > 0 ? (
        <div className="mt-6 grid gap-3" aria-label="Limites de la comparaison">
          {dashboard.warnings.map((warning) => (
            <Alert key={warning.code}>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Couverture à compléter</AlertTitle>
              <AlertDescription>{warning.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      <section aria-label="Indicateurs réseau" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={BadgeEuro}
          label="Chiffre d’affaires réseau"
          value={formatMoney(dashboard.revenueCents)}
          helper={dashboard.yearOverYearRatio === null ? "Comparatif N-1 incomplet" : `${formatRatio(dashboard.yearOverYearRatio)} vs N-1`}
        />
        <MetricCard
          icon={Scale}
          label={marginLabel}
          value={formatMoney(marginValue)}
          helper={`${formatRatio(dashboard.marginRatio)} de marge brute · ${formatMoney(dashboard.markdownCents)} de démarque`}
        />
        <MetricCard
          icon={Target}
          label="Atteinte de l’objectif"
          value={formatRatio(dashboard.targetAttainmentRatio)}
          helper={dashboard.targetRevenueCents === null ? "Objectifs incomplets" : `Objectif ${formatMoney(dashboard.targetRevenueCents)}`}
        />
        <MetricCard
          icon={Store}
          label="Couverture ventes"
          value={`${dashboard.storesWithData}/${dashboard.storeCount}`}
          helper={`${formatQuantity(dashboard.quantity)} unités consolidées`}
        />
      </section>

      <section className="mt-8" aria-labelledby="ranking-title">
        <div>
          <p className="text-sm font-semibold text-primary">Productivité comparable</p>
          <h2 id="ranking-title" className="mt-1 text-xl font-semibold">
            Classement normalisé
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            CA par mètre commercial effectif, uniquement lorsque la géométrie du plan est confirmée.
          </p>
        </div>
        {rankedStores.length === 0 ? (
          <Card className="mt-4">
            <CardContent className="flex gap-4 py-8">
              <CircleGauge aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">Classement indisponible</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Confirmez les dimensions commerciales d’au moins un plan magasin. Aucun classement de secours fondé sur le CA brut n’est produit.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-4">
            <CardContent className="grid gap-5 py-6">
              {rankedStores.map((store) => {
                const productivity = store.revenuePerEffectiveMeterCents ?? 0;
                const width = Math.max(4, Math.round((productivity / maxProductivity) * 100));
                return (
                  <div key={store.storeId}>
                    <div className="flex items-end justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <span className="mr-2 font-semibold">#{store.normalizedRank}</span>
                        <span className="font-medium">{store.name}</span>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatMoney(productivity)}/m
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMeters(store.effectiveCommercialWidthM)} effectifs · marge après démarque {formatMoney(store.postMarkdownMarginPerEffectiveMeterCents)}/m
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-8" aria-labelledby="comparison-title">
        <div className="flex items-center gap-2">
          <BarChart3 aria-hidden="true" className="size-5 text-primary" />
          <h2 id="comparison-title" className="text-xl font-semibold">Comparaison des magasins</h2>
        </div>

        <div className="mt-4 hidden overflow-hidden rounded-xl border bg-card md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/55 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Magasin</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">CA</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Marge</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">N-1</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Démarque</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Objectif</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dashboard.stores.map((store) => (
                <tr key={store.storeId} className="hover:bg-muted/35">
                  <th scope="row" className="px-4 py-4 font-medium">
                    <Link href={networkHref({ organizationSlug, periodKey: dashboard.periodKey, storeId: store.storeId })} className="hover:text-primary hover:underline">
                      {store.name}
                    </Link>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{store.code}</span>
                  </th>
                  <td className="px-4 py-4 text-right tabular-nums">{formatMoney(store.revenueCents)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{formatRatio(store.marginRatio)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{formatRatio(store.yearOverYearRatio)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{formatMoney(store.markdownCents)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{formatRatio(store.targetAttainmentRatio)}</td>
                  <td className="px-4 py-4 text-right">
                    <Badge variant={store.prioritizedActionCount > 0 ? "default" : "secondary"}>{store.prioritizedActionCount}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:hidden">
          {dashboard.stores.map((store) => (
            <Card key={store.storeId}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    <Link href={networkHref({ organizationSlug, periodKey: dashboard.periodKey, storeId: store.storeId })} className="hover:text-primary hover:underline">
                      {store.name}
                    </Link>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{store.code}</p>
                </div>
                {store.normalizedRank === null ? null : <Badge variant="secondary">#{store.normalizedRank}</Badge>}
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <MobileMetric label="CA" value={formatMoney(store.revenueCents)} />
                <MobileMetric label="Marge" value={formatRatio(store.marginRatio)} />
                <MobileMetric label="Évolution N-1" value={formatRatio(store.yearOverYearRatio)} />
                <MobileMetric label="Démarque" value={formatMoney(store.markdownCents)} />
                <MobileMetric label="Objectif" value={formatRatio(store.targetAttainmentRatio)} />
                <MobileMetric label="Actions" value={String(store.prioritizedActionCount)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Couverture des données réseau">
        <CoverageCard label="Comparatif N-1" count={dashboard.priorYearCoverageStoreCount} total={dashboard.storesWithData} />
        <CoverageCard label="Démarque" count={dashboard.markdownCoverageStoreCount} total={dashboard.storesWithData} />
        <CoverageCard label="Objectifs" count={dashboard.targetCoverageStoreCount} total={dashboard.storesWithData} />
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        Calcul {dashboard.calculationVersion} · période {dashboard.periodKey} · classement brut désactivé
      </p>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof BadgeEuro;
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
        <p className="text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}

function CoverageCard({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const complete = total > 0 && count === total;
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-5">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{count}/{total} magasins avec ventes</p>
        </div>
        <Badge variant={complete ? "default" : "secondary"}>{complete ? "Complet" : "Partiel"}</Badge>
      </CardContent>
    </Card>
  );
}
