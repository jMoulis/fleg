import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentFinishInputSchema,
  experimentResponseSchema,
} from "@/domain/experiments/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { finishExperiment } from "@/server/services/experiment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; experimentId: string }>;
}

const experimentIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, experimentId: rawExperimentId } = await routeContext.params;
    const experimentId = experimentIdSchema.parse(rawExperimentId);
    const context = await requireStoreContext(
      storeId,
      ["experiments.start"],
      request.headers,
    );
    const finishInput = experimentFinishInputSchema.parse(await request.json());
    const experiment = await finishExperiment({
      context,
      experimentId,
      finishInput,
      requestId,
    });
    return NextResponse.json(
      experimentResponseSchema.parse({ experiment, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}
