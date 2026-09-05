import { NextResponse } from "next/server";
import * as z from "zod";

import { experimentAnalysesResponseSchema } from "@/domain/experiments/evaluation-schemas";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { listExperimentAnalyses } from "@/server/services/evaluation-service";
import { getExperiment } from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; experimentId: string }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } =
      await routeContext.params;
    const experimentId = experimentIdSchema.parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.read", "analytics.read"],
      request.headers,
    );
    const experiment = await getExperiment({ context, experimentId });
    await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds: experiment.baselineConfig.controlStoreIds,
      requestHeaders: request.headers,
    });
    const analyses = await listExperimentAnalyses({ context, experimentId });
    return NextResponse.json(
      experimentAnalysesResponseSchema.parse({ analyses, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId, {
      route: "/api/stores/[storeId]/experiments/[experimentId]/analyses",
      method: "GET",
    });
  }
}
