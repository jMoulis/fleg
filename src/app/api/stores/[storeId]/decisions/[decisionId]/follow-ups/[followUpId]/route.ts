import { NextResponse } from "next/server";
import * as z from "zod";

import {
  recommendationFollowUpCompleteInputSchema,
  recommendationFollowUpResponseSchema,
} from "@/domain/decisions/follow-up-schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { recommendationFollowUpErrorResponse } from "@/server/http/recommendation-follow-up-error-response";
import { completeRecommendationFollowUp } from "@/server/services/recommendation-follow-up-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    storeId: string;
    decisionId: string;
    followUpId: string;
  }>;
}

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const {
      storeId,
      decisionId: rawDecisionId,
      followUpId: rawFollowUpId,
    } = await routeContext.params;
    const decisionId = mongoIdSchema.parse(rawDecisionId);
    const followUpId = mongoIdSchema.parse(rawFollowUpId);
    const context = await requireStoreContext(
      storeId,
      ["recommendations.approve"],
      request.headers,
    );
    const completeInput = recommendationFollowUpCompleteInputSchema.parse(
      await request.json(),
    );
    const followUp = await completeRecommendationFollowUp({
      context,
      decisionId,
      followUpId,
      completeInput,
      requestId,
    });

    return NextResponse.json(
      recommendationFollowUpResponseSchema.parse({ followUp, requestId }),
    );
  } catch (error) {
    return recommendationFollowUpErrorResponse({
      error,
      method: "PATCH",
      requestId,
      route:
        "/api/stores/[storeId]/decisions/[decisionId]/follow-ups/[followUpId]",
    });
  }
}
