import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentConclusionInputSchema,
  experimentConclusionResponseSchema,
} from "@/domain/experiments/conclusion";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { concludeExperiment } from "@/server/services/conclusion-service";

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
      ["experiments.conclude"],
      request.headers,
    );
    const conclusionInput = experimentConclusionInputSchema.parse(
      await request.json(),
    );
    const result = await concludeExperiment({
      context,
      experimentId,
      conclusionInput,
      requestId,
    });
    return NextResponse.json(
      experimentConclusionResponseSchema.parse({ ...result, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}
