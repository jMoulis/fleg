import { NextResponse } from "next/server";
import * as z from "zod";

import {
  experimentAnalysisResponseSchema,
  experimentEvaluateInputSchema,
} from "@/domain/experiments/evaluation-schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { evaluateExperiment } from "@/server/services/evaluation-service";

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
      ["experiments.start"],
      request.headers,
    );
    const evaluateInput = experimentEvaluateInputSchema.parse(
      await request.json(),
    );
    const result = await evaluateExperiment({
      context,
      experimentId,
      evaluateInput,
      requestId,
    });
    return NextResponse.json(
      experimentAnalysisResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}
