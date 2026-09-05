import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";

import { ExperimentWizard } from "@/components/experiments/experiment-wizard";
import { buttonVariants } from "@/components/ui/button";
import { requireStoreContext } from "@/server/auth/store-context";
import { getExperimentWorkspace } from "@/server/services/experiment-service";

export const metadata: Metadata = {
  title: "Nouveau test — F&L Cockpit",
};

interface NewExperimentPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

export default async function NewExperimentPage({
  params,
}: NewExperimentPageProps) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const context = await requireStoreContext(
    storeId,
    ["experiments.write"],
    requestHeaders,
  );
  const workspace = await getExperimentWorkspace(context);
  const baseHref = `/${organizationSlug}/stores/${storeId}/experiments`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href={baseHref}>
        <ArrowLeft aria-hidden="true" />
        Retour aux tests
      </Link>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
        <FlaskConical aria-hidden="true" className="size-4" />
        Nouveau protocole terrain
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
        Préparer une expérience
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Définissez l’action et les critères de succès avant de modifier le rayon.
      </p>

      <ExperimentWizard
        baseHref={baseHref}
        commercialEvents={workspace.commercialEvents}
        fixtures={workspace.fixtures}
        products={workspace.products}
        storeId={storeId}
      />
    </main>
  );
}
