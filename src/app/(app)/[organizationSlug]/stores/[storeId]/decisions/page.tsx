import type { Metadata } from "next";
import { headers } from "next/headers";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/formatting";
import { requireStoreContext } from "@/server/auth/store-context";
import { listDecisionLog } from "@/server/services/decision-service";

export const metadata: Metadata = { title: "Journal des décisions — F&L Cockpit" };

interface DecisionsPageProps {
  params: Promise<{ storeId: string }>;
}

const decisionLabels = {
  accepted: "Acceptée",
  modified: "Modifiée",
  rejected: "Rejetée",
  deferred: "Différée",
} as const;

export default async function DecisionsPage({ params }: DecisionsPageProps) {
  const [{ storeId }, requestHeaders] = await Promise.all([params, headers()]);
  const context = await requireStoreContext(storeId, ["analytics.read"], requestHeaders);
  const decisions = await listDecisionLog(context);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="text-sm font-semibold text-primary">Traçabilité</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Journal des décisions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Snapshots immuables des recommandations et arbitrages managers.
      </p>

      {decisions.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <History aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">Aucune décision enregistrée</h2>
            <p className="mt-2 text-sm text-muted-foreground">Les décisions prises depuis les fiches produits apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {decisions.map((decision) => (
            <article key={decision.id} className="rounded-2xl border bg-card p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{decision.recommendationSnapshot.productLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recommandation {decision.recommendationSnapshot.type} · effet estimé {formatMoney(decision.recommendationSnapshot.expectedRevenueEffectCents)}
                  </p>
                </div>
                <Badge>{decisionLabels[decision.decision]}</Badge>
              </div>
              {decision.rationale ? (
                <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-6">{decision.rationale}</p>
              ) : null}
              <p className="mt-4 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(decision.decidedAt))} · acteur {decision.actorUserId}
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
