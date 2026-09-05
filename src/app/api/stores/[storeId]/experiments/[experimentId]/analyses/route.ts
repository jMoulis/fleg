import { NextResponse } from "next/server";
import * as z from "zod";

import { experimentAnalysesResponseSchema } from "@/domain/experiments/evaluation-schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { experimentErrorResponse } from "@/server/http/experiment-error-response";
import { listExperimentAnalyses } from "@/server/services/evaluation-service";

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
      ["experiments.read"],
      request.headers,
    );
    const analyses = await listExperimentAnalyses({ context, experimentId });
    return NextResponse.json(
      experimentAnalysesResponseSchema.parse({ analyses, requestId }),
    );
  } catch (error) {
    return experimentErrorResponse(error, requestId);
  }
}
