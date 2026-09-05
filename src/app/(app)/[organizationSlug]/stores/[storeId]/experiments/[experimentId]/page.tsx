import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import * as z from "zod";

import { ExperimentDetail } from "@/components/experiments/experiment-detail";
import { requireStoreContext } from "@/server/auth/store-context";
import { ExperimentNotFoundError } from "@/server/repositories/experiment-repository";
import { getExperimentBaseline } from "@/server/services/baseline-service";
import { listExperimentAnalyses } from "@/server/services/evaluation-service";
import {
  getExperiment,
  getExperimentWorkspace,
} from "@/server/services/experiment-service";

export const metadata: Metadata = {
  title: "Détail du test — F&L Cockpit",
};

interface ExperimentPageProps {
  params: Promise<{
    organizationSlug: string;
    storeId: string;
    experimentId: string;
  }>;
  searchParams: Promise<{
    saved?: string;
    planned?: string;
    createdDraft?: string;
  }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export default async function ExperimentPage({
  params,
  searchParams,
}: ExperimentPageProps) {
  const [
    { organizationSlug, storeId, experimentId: rawId },
    query,
    requestHeaders,
  ] = await Promise.all([params, searchParams, headers()]);
  const parsedId = experimentIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  const context = await requireStoreContext(
    storeId,
    ["experiments.read"],
    requestHeaders,
  );
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
  const [workspace, baseline, analyses] = await Promise.all([
    getExperimentWorkspace(context),
    getExperimentBaseline({
      context,
      experimentId: parsedId.data,
    }),
    listExperimentAnalyses({
      context,
      experimentId: parsedId.data,
    }),
  ]);
  const initialNotice = query.createdDraft === "1"
    ? "createdDraft"
    : query.planned === "1"
      ? "planned"
      : query.saved === "1"
        ? "saved"
        : undefined;

  return (
    <ExperimentDetail
      baseHref={`/${organizationSlug}/stores/${storeId}/experiments`}
      baseline={baseline}
      canEvaluate={context.permissions.includes("experiments.start")}
      canStart={context.permissions.includes("experiments.start")}
      canWrite={context.permissions.includes("experiments.write")}
      fixtures={workspace.fixtures}
      initialExperiment={experiment}
      initialAnalyses={analyses}
      initialNotice={initialNotice}
      products={workspace.products}
      storeId={storeId}
      userId={context.userId}
    />
  );
}
