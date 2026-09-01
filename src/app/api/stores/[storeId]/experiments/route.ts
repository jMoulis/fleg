import { NextResponse } from "next/server";

import {
  experimentCreateInputSchema,
  experimentResponseSchema,
  experimentsResponseSchema,
} from "@/domain/experiments/schemas";
import { requireExperimentControlContexts } from "@/server/auth/experiment-controls";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import {
  createExperiment,
  listExperiments,
} from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["experiments.read"],
      request.headers,
    );
    const experiments = await listExperiments(context);
    return NextResponse.json(
      experimentsResponseSchema.parse({ experiments, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["experiments.write"],
      request.headers,
    );
    const createInput = experimentCreateInputSchema.parse(await request.json());
    const controlContexts = await requireExperimentControlContexts({
      primaryContext: context,
      controlStoreIds: createInput.baselineConfig.controlStoreIds,
      requestHeaders: request.headers,
    });
    const experiment = await createExperiment({
      context,
      controlContexts,
      createInput,
      requestId,
    });
    return NextResponse.json(
      experimentResponseSchema.parse({ experiment, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}
