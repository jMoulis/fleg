import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";

import { ExperimentList } from "@/components/experiments/experiment-list";
import { buttonVariants } from "@/components/ui/button";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { getExperimentWorkspace } from "@/server/services/experiment-service";

export const metadata: Metadata = {
  title: "Tests & Expériences — F&L Cockpit",
};

interface ExperimentsPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

export default async function ExperimentsPage({ params }: ExperimentsPageProps) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const context = await requireStoreContext(
    storeId,
    ["experiments.read"],
    requestHeaders,
  );
  const workspace = await getExperimentWorkspace(context);
  await requireExperimentControlContexts({
    primaryContext: context,
    controlStoreIds: [
      ...new Set(
        workspace.experiments.flatMap(
          (experiment) => experiment.baselineConfig.controlStoreIds,
        ),
      ),
    ],
    requestHeaders,
  });
  const baseHref = `/${organizationSlug}/stores/${storeId}/experiments`;
  const canWrite = context.permissions.includes("experiments.write");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <FlaskConical aria-hidden="true" className="size-4" />
            Apprendre avant de généraliser
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Tests & Expériences
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cadrez une hypothèse, confirmez son exécution en rayon et attendez les données avant de conclure.
          </p>
        </div>
        {canWrite ? (
          <Link className={buttonVariants({ className: "hidden sm:inline-flex" })} href={`${baseHref}/new`}>
            <Plus aria-hidden="true" />
            Nouveau test
          </Link>
        ) : null}
      </div>

      <ExperimentList
        baseHref={baseHref}
        canWrite={canWrite}
        experiments={workspace.experiments}
        fixtures={workspace.fixtures}
        products={workspace.products}
      />

      {canWrite ? (
        <Link
          aria-label="Créer un nouveau test"
          className={buttonVariants({ className: "fixed bottom-20 right-4 z-20 size-12 rounded-full p-0 shadow-lg sm:hidden" })}
          href={`${baseHref}/new`}
        >
          <Plus aria-hidden="true" className="size-5" />
        </Link>
      ) : null}
    </main>
  );
}
