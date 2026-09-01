import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { productMatrixQuerySchema } from "@/domain/products/schemas";
import { formatMoney, formatQuantity, formatRatio } from "@/lib/formatting";
import { requireStoreContext } from "@/server/auth/store-context";
import {
  getDashboardMetrics,
  getProductMetrics,
} from "@/server/services/analytics-service";
import { getRecommendations } from "@/server/services/recommendation-service";

export const metadata: Metadata = {
  title: "Produits — F&L Cockpit",
};

interface ProductsPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{
    period?: string;
    q?: string;
    abc?: string;
    sort?: string;
  }>;
}

const recommendationLabels = {
  PUSH: "Pousser",
  REDUCE: "Réduire",
  HOLD: "Maintenir",
  MARGIN_WATCH: "Marge",
  TRAFFIC_PROTECT: "Trafic",
} as const;

export default async function ProductsPage({
  params,
  searchParams,
}: ProductsPageProps) {
  const [{ organizationSlug, storeId }, rawQuery, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const query = productMatrixQuerySchema.parse(rawQuery);
  const context = await requireStoreContext(
    storeId,
    ["analytics.read"],
    requestHeaders,
  );
  const dashboard = await getDashboardMetrics(context, query.period);

  if (!dashboard) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold">Aucun produit à analyser</h1>
        <p className="mt-2 text-sm text-muted-foreground">Importez d’abord une période Mercalys.</p>
      </main>
    );
  }

  const [metrics, recommendations] = await Promise.all([
    getProductMetrics(context, dashboard.periodKey),
    getRecommendations(context, dashboard.periodKey),
  ]);
  const recommendationByProduct = new Map(
    recommendations.map((recommendation) => [recommendation.productId, recommendation]),
  );
  const normalizedSearch = query.q.toLocaleLowerCase("fr-FR");
  const products = metrics.products
    .filter(
      (product) =>
        (!normalizedSearch ||
          product.label.toLocaleLowerCase("fr-FR").includes(normalizedSearch)) &&
        (!query.abc || product.abcClass === query.abc),
    )
    .sort((a, b) => {
      switch (query.sort) {
        case "margin_desc":
          return b.marginCents - a.marginCents;
        case "forecast_desc":
          return (b.forecastRevenueCents ?? -1) - (a.forecastRevenueCents ?? -1);
        case "label_asc":
          return a.label.localeCompare(b.label, "fr");
        default:
          return b.revenueCents - a.revenueCents;
      }
    });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <p className="text-sm font-semibold text-primary">Matrice de décision</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Produits</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {products.length} produit(s) · période {dashboard.periodKey}
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto]" method="get">
        <input type="hidden" name="period" value={dashboard.periodKey} />
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Recherche
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Banane, pomme…"
            className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          ABC
          <select name="abc" defaultValue={query.abc ?? ""} className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground">
            <option value="">Toutes</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Trier par
          <select name="sort" defaultValue={query.sort} className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground">
            <option value="revenue_desc">CA</option>
            <option value="margin_desc">Marge</option>
            <option value="forecast_desc">Prévision</option>
            <option value="label_asc">Libellé</option>
          </select>
        </label>
        <button className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">
          Filtrer
        </button>
      </form>

      {products.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucun produit ne correspond à ces filtres.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 space-y-3 md:hidden">
            {products.map((product) => {
              const recommendation = recommendationByProduct.get(product.productId);
              return (
                <Link
                  key={product.productId}
                  href={`/${organizationSlug}/stores/${storeId}/products/${product.productId}?period=${dashboard.periodKey}`}
                  className="block rounded-2xl border bg-card p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{product.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatMoney(product.revenueCents)} · marge {formatRatio(product.marginRatio)}
                      </p>
                    </div>
                    <Badge>ABC {product.abcClass}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <span><span className="block text-xs text-muted-foreground">Prévision</span>{formatMoney(product.forecastRevenueCents)}</span>
                    <span><span className="block text-xs text-muted-foreground">Recommandation</span>{recommendation ? recommendationLabels[recommendation.type] : "—"}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 hidden overflow-x-auto rounded-2xl border bg-card md:block">
            <table className="w-full min-w-[62rem] border-collapse text-sm">
              <caption className="sr-only">Matrice des produits pour {dashboard.periodKey}</caption>
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted px-4 py-3 font-medium">Produit</th>
                  <th className="px-4 py-3 font-medium">ABC</th>
                  <th className="px-4 py-3 text-right font-medium">CA</th>
                  <th className="px-4 py-3 text-right font-medium">Marge</th>
                  <th className="px-4 py-3 text-right font-medium">Quantité</th>
                  <th className="px-4 py-3 text-right font-medium">YoY</th>
                  <th className="px-4 py-3 text-right font-medium">Prévision</th>
                  <th className="px-4 py-3 font-medium">Confiance</th>
                  <th className="px-4 py-3 font-medium">Recommandation</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const recommendation = recommendationByProduct.get(product.productId);
                  return (
                    <tr key={product.productId} className="border-t hover:bg-muted/35">
                      <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium">
                        <Link className="hover:text-primary hover:underline" href={`/${organizationSlug}/stores/${storeId}/products/${product.productId}?period=${dashboard.periodKey}`}>
                          {product.label}
                        </Link>
                      </th>
                      <td className="px-4 py-3"><Badge variant="outline">{product.abcClass}</Badge></td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(product.revenueCents)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(product.marginCents)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(product.quantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRatio(product.yearOverYearRatio)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(product.forecastRevenueCents)}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{product.confidence}</Badge></td>
                      <td className="px-4 py-3">{recommendation ? recommendationLabels[recommendation.type] : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
