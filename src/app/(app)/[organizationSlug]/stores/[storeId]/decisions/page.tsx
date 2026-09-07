import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { History } from "lucide-react";

import { RecommendationFollowUpManager } from "@/components/decisions/recommendation-follow-up-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { shiftMonth } from "@/domain/analytics/calculations";
import type { ExperimentDecisionRecord } from "@/domain/decisions/schemas";
import {
  experimentManagerDecisionLabels,
  experimentVerdictLabels,
} from "@/domain/experiments/labels";
import { formatMoney, formatRatio } from "@/lib/formatting";
import { requireStoreContext } from "@/server/auth/store-context";
import { getDecisionWorkspace } from "@/server/services/decision-service";

export const metadata: Metadata = { title: "Journal des décisions — F&L Cockpit" };

interface DecisionsPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

const decisionLabels = {
  accepted: "Acceptée",
  modified: "Modifiée",
  rejected: "Rejetée",
  deferred: "Différée",
} as const;

function formatExperimentUplift(decision: ExperimentDecisionRecord): string {
  const uplift = decision.analysisSnapshot.metrics.find(
    ({ metric }) => metric === decision.experimentSnapshot.primaryMetric,
  )?.relativeUplift;
  return typeof uplift === "number" ? ` · uplift ${formatRatio(uplift)}` : "";
}

export default async function DecisionsPage({ params }: DecisionsPageProps) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const context = await requireStoreContext(storeId, ["analytics.read"], requestHeaders);
  const { decisions, followUps } = await getDecisionWorkspace({
    context,
    requestHeaders,
  });
  const followUpByDecisionId = new Map(
    followUps.map((followUp) => [followUp.recommendationDecisionId, followUp]),
  );
  const canManageFollowUps = context.permissions.includes(
    "recommendations.approve",
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="text-sm font-semibold text-primary">Traçabilité</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Journal des décisions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Snapshots immuables des recommandations, résultats avant/après, plans IA,
        conclusions de tests et arbitrages managers.
      </p>

      {decisions.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <History aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">Aucune décision enregistrée</h2>
            <p className="mt-2 text-sm text-muted-foreground">Les décisions prises depuis les fiches produits, le Copilote et les tests apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {decisions.map((decision) => (
            <article key={decision.id} className="rounded-2xl border bg-card p-5 shadow-xs">
              {decision.entryType === "recommendation" ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge className="mb-2" variant="outline">Recommandation</Badge>
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
                  {decision.decision === "accepted" ||
                  decision.decision === "modified" ? (
                    <RecommendationFollowUpManager
                      canManage={canManageFollowUps}
                      decisionId={decision.id}
                      defaultAfterPeriodKey={shiftMonth(
                        decision.recommendationSnapshot.periodKey,
                        1,
                      )}
                      defaultDueOn={`${shiftMonth(
                        decision.recommendationSnapshot.periodKey,
                        1,
                      )}-28`}
                      initialFollowUp={
                        followUpByDecisionId.get(decision.id) ?? null
                      }
                      storeId={storeId}
                    />
                  ) : null}
                </>
              ) : decision.entryType === "experiment_conclusion" ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge className="mb-2" variant="outline">Conclusion de test</Badge>
                      <Link
                        className="block font-semibold underline-offset-4 hover:underline"
                        href={`/${organizationSlug}/stores/${storeId}/experiments/${decision.experimentId}`}
                      >
                        {decision.experimentSnapshot.title}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Verdict manager {experimentVerdictLabels[decision.managerVerdict]}
                        {formatExperimentUplift(decision)}
                      </p>
                    </div>
                    <Badge>
                      {experimentManagerDecisionLabels[decision.decision]}
                    </Badge>
                  </div>
                  <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-6">
                    {decision.rationale}
                  </p>
                  {decision.reusableTags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {decision.reusableTags.map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge className="mb-2" variant="outline">Plan d’action IA</Badge>
                      <Link
                        className="block font-semibold underline-offset-4 hover:underline"
                        href={`/${organizationSlug}/stores/${storeId}/copilot`}
                      >
                        {decision.actionPlanSnapshot.title}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {decision.actionPlanSnapshot.actions.length} action{decision.actionPlanSnapshot.actions.length > 1 ? "s" : ""} proposée{decision.actionPlanSnapshot.actions.length > 1 ? "s" : ""} · aucune exécution automatique
                      </p>
                    </div>
                    <Badge>
                      {decision.decision === "approved" ? "Approuvé" : "Refusé"}
                    </Badge>
                  </div>
                  <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm leading-6">
                    {decision.rationale}
                  </p>
                </>
              )}
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
