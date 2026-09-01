import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/formatting";
import { requireStoreContext } from "@/server/auth/store-context";
import { getDashboardMetrics } from "@/server/services/analytics-service";
import { getRecommendations } from "@/server/services/recommendation-service";

export const metadata: Metadata = { title: "Actions — F&L Cockpit" };

interface ActionsPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function ActionsPage({ params, searchParams }: ActionsPageProps) {
  const [{ organizationSlug, storeId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const context = await requireStoreContext(storeId, ["analytics.read"], requestHeaders);
  const dashboard = await getDashboardMetrics(context, query.period);

  if (!dashboard) {
    return <main className="p-8 text-sm text-muted-foreground">Aucune action sans données importées.</main>;
  }

  const recommendations = (await getRecommendations(context, dashboard.periodKey)).filter(
    (recommendation) => recommendation.type !== "HOLD",
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="text-sm font-semibold text-primary">Recommandations en brouillon</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Actions</h1>
      <p className="mt-2 text-sm text-muted-foreground">{recommendations.length} action(s) à examiner · {dashboard.periodKey}</p>
      <div className="mt-6 space-y-4">
        {recommendations.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Aucune action prioritaire.</CardContent></Card>
        ) : recommendations.map((recommendation) => (
          <Link
            key={recommendation.id}
            href={`/${organizationSlug}/stores/${storeId}/products/${recommendation.productId}?period=${dashboard.periodKey}`}
            className="block rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{recommendation.productLabel}</p>
                <p className="mt-1 text-sm text-muted-foreground">Effet CA estimé {formatMoney(recommendation.expectedRevenueEffectCents)}</p>
              </div>
              <Badge>{recommendation.type}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{recommendation.evidence[2]?.interpretation}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
