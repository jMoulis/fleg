import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import * as z from "zod";

import { ExperimentWizard } from "@/components/experiments/experiment-wizard";
import { buttonVariants } from "@/components/ui/button";
import { isExperimentDefinitionEditable } from "@/domain/experiments/lifecycle";
import { requireStoreContext } from "@/server/auth/store-context";
import { ExperimentNotFoundError } from "@/server/repositories/experiment-repository";
import {
  getExperiment,
  getExperimentWorkspace,
} from "@/server/services/experiment-service";

export const metadata: Metadata = {
  title: "Modifier le test — F&L Cockpit",
};

interface EditExperimentPageProps {
  params: Promise<{
    organizationSlug: string;
    storeId: string;
    experimentId: string;
  }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export default async function EditExperimentPage({
  params,
}: EditExperimentPageProps) {
  const [{ organizationSlug, storeId, experimentId: rawId }, requestHeaders] =
    await Promise.all([params, headers()]);
  const parsedId = experimentIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  const context = await requireStoreContext(
    storeId,
    ["experiments.write"],
    requestHeaders,
  );
  const baseHref = `/${organizationSlug}/stores/${storeId}/experiments`;
  let experiment;
  try {
    experiment = await getExperiment({
      context,
      experimentId: parsedId.data,
    });
  } catch (error) {
    if (error instanceof ExperimentNotFoundError) notFound();
    throw error;
  }
  if (!isExperimentDefinitionEditable(experiment.status)) {
    redirect(`${baseHref}/${experiment.id}`);
  }
  const workspace = await getExperimentWorkspace(context);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href={`${baseHref}/${experiment.id}`}>
        <ArrowLeft aria-hidden="true" />
        Retour au test
      </Link>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
        <PencilLine aria-hidden="true" className="size-4" />
        Définition modifiable
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
        Modifier l’expérience
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Les changements seront interdits dès le démarrage effectif.
      </p>

      <ExperimentWizard
        baseHref={baseHref}
        commercialEvents={workspace.commercialEvents}
        fixtures={workspace.fixtures}
        initialExperiment={experiment}
        products={workspace.products}
        storeId={storeId}
      />
    </main>
  );
}
