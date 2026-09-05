import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentResponseSchema,
  experimentUpdateInputSchema,
} from "@/domain/experiments/schemas";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import {
  getExperiment,
  updateExperimentDefinition,
} from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; experimentId: string }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } = await routeContext.params;
    const experimentId = experimentIdSchema.parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.read"],
      request.headers,
    );
    const experiment = await getExperiment({ context, experimentId });
    await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds: experiment.baselineConfig.controlStoreIds,
      requestHeaders: request.headers,
    });
    return NextResponse.json(
      experimentResponseSchema.parse({ experiment, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId, {
      route: "/api/stores/[storeId]/experiments/[experimentId]",
      method: "GET",
    });
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } = await routeContext.params;
    const experimentId = experimentIdSchema.parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.write"],
      request.headers,
    );
    const updateInput = experimentUpdateInputSchema.parse(await request.json());
    const controlStoreIds =
      updateInput.action === "cancel"
        ? []
        : updateInput.baselineConfig.controlStoreIds;
    const controlContexts = await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds,
      requestHeaders: request.headers,
    });
    const experiment = await updateExperimentDefinition({
      context,
      controlContexts,
      experimentId,
      updateInput,
      requestId,
    });
    return NextResponse.json(
      experimentResponseSchema.parse({ experiment, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId, {
      route: "/api/stores/[storeId]/experiments/[experimentId]",
      method: "PATCH",
    });
  }
}
