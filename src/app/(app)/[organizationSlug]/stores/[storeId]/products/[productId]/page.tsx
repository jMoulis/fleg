import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, CircleGauge, Scale } from "lucide-react";

import { RecommendationDecisionForm } from "@/components/decisions/recommendation-decision-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatQuantity, formatRatio } from "@/lib/formatting";
import { requireStoreContext } from "@/server/auth/store-context";
import { getDashboardMetrics, getProductMetrics } from "@/server/services/analytics-service";
import { getRecommendations } from "@/server/services/recommendation-service";

export const metadata: Metadata = { title: "Détail produit — F&L Cockpit" };

interface ProductDetailPageProps {
  params: Promise<{ organizationSlug: string; storeId: string; productId: string }>;
  searchParams: Promise<{ period?: string }>;
}

const typeLabels = {
  PUSH: "Pousser",
  REDUCE: "Réduire",
  HOLD: "Maintenir",
  MARGIN_WATCH: "Surveiller la marge",
  TRAFFIC_PROTECT: "Protéger le trafic",
} as const;

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const [{ organizationSlug, storeId, productId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const context = await requireStoreContext(storeId, ["analytics.read"], requestHeaders);
  const dashboard = await getDashboardMetrics(context, query.period);

  if (!dashboard) notFound();

  const [metrics, recommendations] = await Promise.all([
    getProductMetrics(context, dashboard.periodKey),
    getRecommendations(context, dashboard.periodKey),
  ]);
  const product = metrics.products.find((item) => item.productId === productId);
  const recommendation = recommendations.find((item) => item.productId === productId);

  if (!product || !recommendation) notFound();

  const canApprove = context.permissions.includes("recommendations.approve");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Produit · {dashboard.periodKey}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{product.label}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>ABC {product.abcClass}</Badge>
            <Badge variant="secondary">Confiance {product.confidence}</Badge>
            <Badge variant="outline">{typeLabels[recommendation.type]}</Badge>
          </div>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Effet CA estimé</p>
          <p className="mt-1 text-lg font-semibold">{formatMoney(recommendation.expectedRevenueEffectCents)}</p>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs produit">
        <DetailMetric icon={ArrowUpRight} label="CA observé" value={formatMoney(product.revenueCents)} helper={`${formatRatio(product.yearOverYearRatio)} vs N-1`} />
        <DetailMetric icon={Scale} label="Marge" value={formatMoney(product.marginCents)} helper={formatRatio(product.marginRatio)} />
        <DetailMetric icon={CircleGauge} label="Prévision" value={formatMoney(product.forecastRevenueCents)} helper={`Indice retenu ${product.retainedSeasonalityIndex.toFixed(2)}`} />
        <DetailMetric icon={ArrowDownLeft} label="Quantité" value={formatQuantity(product.quantity)} helper="Valeur observée" />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pourquoi cette recommandation ?</CardTitle>
            <p className="text-sm text-muted-foreground">Chaque signal conserve sa valeur et son interprétation.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendation.evidence.map((evidence) => (
              <div key={evidence.signal} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium">{evidence.label}</p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {evidence.value === null ? "—" : evidence.value.toFixed(3)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{evidence.interpretation}</p>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Modèle {recommendation.modelVersion} · calcul {recommendation.calculationVersion} · révision {recommendation.inputRevision}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Décision manager</CardTitle>
            <p className="text-sm text-muted-foreground">
              La recommandation reste un brouillon tant qu’une décision explicite n’est pas enregistrée.
            </p>
          </CardHeader>
          <CardContent>
            {canApprove ? (
              <RecommendationDecisionForm
                storeId={storeId}
                recommendationId={recommendation.id}
                currentType={recommendation.type}
                decisionLogHref={`/${organizationSlug}/stores/${storeId}/decisions`}
              />
            ) : (
              <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                Votre rôle permet la lecture, mais pas la validation des recommandations.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon aria-hidden="true" className="size-4 text-primary" />
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}
