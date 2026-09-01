import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeEuro,
  Boxes,
  DatabaseZap,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatQuantity, formatRatio } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { requireStoreContext } from "@/server/auth/store-context";
import { getDashboardMetrics } from "@/server/services/analytics-service";
import { getRecommendations } from "@/server/services/recommendation-service";

export const metadata: Metadata = {
  title: "Tableau de bord — F&L Cockpit",
};

interface StoreDashboardPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ period?: string }>;
}

const recommendationLabels = {
  PUSH: "À pousser",
  REDUCE: "À réduire",
  HOLD: "À maintenir",
  MARGIN_WATCH: "Marge à surveiller",
  TRAFFIC_PROTECT: "Trafic à protéger",
} as const;

export default async function StoreDashboardPage({
  params,
  searchParams,
}: StoreDashboardPageProps) {
  const [{ organizationSlug, storeId }, query, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["analytics.read"],
    requestHeaders,
  );
  const dashboard = await getDashboardMetrics(context, query.period);

  if (!dashboard) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Contexte magasin autorisé
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Tableau de bord
          </h1>
        </div>
        <Card className="mt-8 border-primary/15 bg-primary/[0.035]">
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <DatabaseZap aria-hidden="true" className="size-7" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">Aucune donnée engagée</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Importez un export Mercalys pour calculer les indicateurs et recommandations de ce magasin.
            </p>
            <Link
              href={`/${organizationSlug}/stores/${storeId}/imports`}
              className={cn(buttonVariants({ size: "lg" }), "mt-6")}
            >
              Importer Mercalys
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const recommendations = await getRecommendations(context, dashboard.periodKey);
  const prioritized = recommendations
    .filter((recommendation) => recommendation.type !== "HOLD")
    .slice(0, 4);
  const productHref = `/${organizationSlug}/stores/${storeId}/products?period=${dashboard.periodKey}`;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Révision des données {dashboard.dataRevision}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Tableau de bord
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Période {dashboard.periodKey} · calcul {dashboard.calculationVersion}
          </p>
        </div>
        <form className="flex items-end gap-2" method="get">
          <label htmlFor="period" className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Période
            <input
              id="period"
              name="period"
              type="month"
              defaultValue={dashboard.periodKey}
              className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <button className={buttonVariants({ variant: "outline" })} type="submit">
            Afficher
          </button>
        </form>
      </div>

      <section aria-label="Indicateurs magasin" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={BadgeEuro}
          label="Chiffre d’affaires"
          value={formatMoney(dashboard.revenueCents)}
          helper={
            dashboard.yearOverYearRatio === null
              ? "Comparatif N-1 indisponible"
              : `${formatRatio(dashboard.yearOverYearRatio)} vs N-1`
          }
        />
        <MetricCard
          icon={Scale}
          label="Marge brute"
          value={formatMoney(dashboard.marginCents)}
          helper={`${formatRatio(dashboard.marginRatio)} du CA`}
        />
        <MetricCard
          icon={Boxes}
          label="Produits analysés"
          value={String(dashboard.productCount)}
          helper={`${formatQuantity(dashboard.quantity)} unités observées`}
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Actions prioritaires"
          value={String(prioritized.length)}
          helper={`${recommendations.length} recommandations expliquées`}
        />
      </section>

      <section className="mt-8" aria-labelledby="actions-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">À décider</p>
            <h2 id="actions-title" className="mt-1 text-xl font-semibold">
              Actions prioritaires
            </h2>
          </div>
          <Link href={productHref} className={buttonVariants({ variant: "outline" })}>
            Voir les produits
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        {prioritized.length === 0 ? (
          <Card className="mt-4">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucun signal prioritaire pour cette période. Les recommandations de maintien restent consultables dans les produits.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {prioritized.map((recommendation) => (
              <Link
                key={recommendation.id}
                href={`/${organizationSlug}/stores/${storeId}/products/${recommendation.productId}?period=${dashboard.periodKey}`}
                className="group rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{recommendation.productLabel}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Effet CA estimé {formatMoney(recommendation.expectedRevenueEffectCents)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {recommendationLabels[recommendation.type]}
                  </Badge>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {recommendation.evidence[0]?.interpretation}
                </p>
              </Link>
            ))}
          </div>
        )}
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
  icon: typeof BadgeEuro;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon aria-hidden="true" className="size-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}
