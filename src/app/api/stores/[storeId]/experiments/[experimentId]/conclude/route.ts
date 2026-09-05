import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentConclusionInputSchema,
  experimentConclusionResponseSchema,
} from "@/domain/experiments/conclusion";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { concludeExperiment } from "@/server/services/conclusion-service";
import { getExperiment } from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; experimentId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } = await routeContext.params;
    const experimentId = z.string().regex(/^[a-f\d]{24}$/i).parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.conclude", "analytics.read"],
      request.headers,
    );
    const conclusionInput = experimentConclusionInputSchema.parse(
      await request.json(),
    );
    const experiment = await getExperiment({ context, experimentId });
    const controlContexts = await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds: experiment.baselineConfig.controlStoreIds,
      requestHeaders: request.headers,
    });
    const result = await concludeExperiment({
      context,
      controlContexts,
      experimentId,
      conclusionInput,
      requestId,
    });
    return NextResponse.json(
      experimentConclusionResponseSchema.parse({ ...result, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId, {
      route: "/api/stores/[storeId]/experiments/[experimentId]/conclude",
      method: "POST",
    });
  }
}
