import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Bot, Leaf, ShieldCheck, Store } from "lucide-react";

import { NetworkCopilot } from "@/components/ai/store-copilot";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { periodKeySchema } from "@/domain/imports/schemas";
import { networkDashboardQuerySchema } from "@/domain/network/schemas";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { requireNetworkAiContexts } from "@/server/auth/ai-context";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { getCopilotConfigurationStatus } from "@/server/env";
import { getNetworkDashboard } from "@/server/services/network-analytics-service";
import { listComparableStoresForOrganization } from "@/server/services/store-access-service";

export const metadata: Metadata = {
  title: "Copilote réseau — F&L Cockpit",
};

interface NetworkCopilotPageProps {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{
    period?: string;
    storeId?: string | string[];
  }>;
}

function queryStoreIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function backHref(input: {
  organizationSlug: string;
  storeIds: string[];
  period?: string;
}): string {
  const query = new URLSearchParams({ scope: "custom" });
  input.storeIds.forEach((storeId) => query.append("storeId", storeId));
  if (input.period) query.set("period", input.period);
  return `/${input.organizationSlug}/network?${query.toString()}`;
}

export default async function NetworkCopilotPage({
  params,
  searchParams,
}: NetworkCopilotPageProps) {
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
  const selectedStoreIds =
    requestedStoreIds.length > 0
      ? requestedStoreIds
      : comparableStores.map(({ store }) => store.id);
  const parsedSelection = networkDashboardQuerySchema.safeParse({
    storeIds: selectedStoreIds,
    period: query.period,
  });
  if (!parsedSelection.success) notFound();

  const availableStoreIds = new Set(
    comparableStores.map(({ store }) => store.id),
  );
  if (selectedStoreIds.some((storeId) => !availableStoreIds.has(storeId))) {
    notFound();
  }
  const parsedPeriod = query.period
    ? periodKeySchema.safeParse(query.period)
    : null;
  if (parsedPeriod && !parsedPeriod.success) notFound();

  let contexts;
  try {
    contexts = await requireNetworkAiContexts(selectedStoreIds, requestHeaders);
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

  const dashboard = await getNetworkDashboard(
    contexts,
    parsedPeriod?.data,
  );
  const activePeriod = parsedPeriod?.data ?? dashboard?.periodKey;
  const configuration = getCopilotConfigurationStatus();

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
              <p className="mt-1 text-xs text-muted-foreground">Copilote réseau</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={backHref({
                organizationSlug,
                storeIds: selectedStoreIds,
                period: activePeriod,
              })}
              className={buttonVariants({ variant: "ghost" })}
            >
              <ArrowLeft aria-hidden="true" />
              <span className="hidden sm:inline">Retour au réseau</span>
            </Link>
            <Link href="/stores" className={buttonVariants({ variant: "outline" })}>
              <Store aria-hidden="true" />
              <span className="hidden sm:inline">Changer de magasin</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Périmètre réseau explicitement autorisé
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bot aria-hidden="true" className="size-5" />
            </span>
            <h1 className="text-3xl font-semibold tracking-[-0.035em]">
              Copilote réseau
            </h1>
            <Badge variant="secondary">
              {selectedStoreIds.length} magasin{selectedStoreIds.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Interrogez les écarts de productivité, marge, démarque et objectifs sur le périmètre sélectionné. Le classement reste normalisé par mètre commercial confirmé.
          </p>
        </div>

        <div className="mt-7">
          <NetworkCopilot
            storeIds={selectedStoreIds}
            initialPeriod={activePeriod}
            providerConfigured={configuration.configured}
            model={configuration.model}
          />
        </div>
      </main>
    </div>
  );
}
