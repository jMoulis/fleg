import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Bot, ShieldCheck } from "lucide-react";

import { StoreCopilot } from "@/components/ai/store-copilot";
import { periodKeySchema } from "@/domain/imports/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { requireStoreAiContext } from "@/server/auth/ai-context";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { getCopilotConfigurationStatus } from "@/server/env";
import { listAiActionPlans } from "@/server/services/ai-action-plan-service";
import { getDashboardMetrics } from "@/server/services/analytics-service";

export const metadata: Metadata = {
  title: "Copilote — F&L Cockpit",
};

interface StoreCopilotPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function StoreCopilotPage({
  params,
  searchParams,
}: StoreCopilotPageProps) {
  const [{ storeId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const requestedPeriod = query.period
    ? periodKeySchema.safeParse(query.period)
    : null;
  if (requestedPeriod && !requestedPeriod.success) notFound();

  let context;
  try {
    context = await requireStoreAiContext(storeId, requestHeaders);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof StoreAccessDeniedError) notFound();
    throw error;
  }

  const [dashboard, initialActionPlans] = await Promise.all([
    getDashboardMetrics(context, requestedPeriod?.data),
    listAiActionPlans({ context, limit: 10 }),
  ]);
  const activePeriod = requestedPeriod?.data ?? dashboard?.periodKey;
  const configuration = getCopilotConfigurationStatus();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Données magasin autorisées · brouillons sous contrôle
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bot aria-hidden="true" className="size-5" />
          </span>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">
            Copilote analytique
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Posez une question sur les ventes, la marge, les produits, la démarque, l’espace ou les opérations commerciales. Les preuves et limites restent visibles sous la réponse.
        </p>
      </div>

      <div className="mt-7">
        <StoreCopilot
          storeId={storeId}
          initialPeriod={activePeriod}
          providerConfigured={configuration.configured}
          model={configuration.model}
          initialActionPlans={initialActionPlans}
          canApprove={context.permissions.includes("recommendations.approve")}
        />
      </div>
    </main>
  );
}
