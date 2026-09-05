import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentAnalysisResponseSchema,
  experimentEvaluateInputSchema,
} from "@/domain/experiments/evaluation-schemas";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { evaluateExperiment } from "@/server/services/evaluation-service";
import { getExperiment } from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; experimentId: string }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } =
      await routeContext.params;
    const experimentId = experimentIdSchema.parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.start", "analytics.read"],
      request.headers,
    );
    const evaluateInput = experimentEvaluateInputSchema.parse(
      await request.json(),
    );
    const experiment = await getExperiment({ context, experimentId });
    const controlContexts = await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds: experiment.baselineConfig.controlStoreIds,
      requestHeaders: request.headers,
    });
    const result = await evaluateExperiment({
      context,
      controlContexts,
      experimentId,
      evaluateInput,
      requestId,
    });
    return NextResponse.json(
      experimentAnalysisResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId, {
      route: "/api/stores/[storeId]/experiments/[experimentId]/evaluate",
      method: "POST",
    });
  }
}
