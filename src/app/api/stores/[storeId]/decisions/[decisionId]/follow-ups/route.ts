import { NextResponse } from "next/server";
import * as z from "zod";

import {
  recommendationFollowUpResponseSchema,
  recommendationFollowUpScheduleInputSchema,
} from "@/domain/decisions/follow-up-schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { recommendationFollowUpErrorResponse } from "@/server/http/recommendation-follow-up-error-response";
import { scheduleRecommendationFollowUp } from "@/server/services/recommendation-follow-up-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; decisionId: string }>;
}

const decisionIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, decisionId: rawDecisionId } = await routeContext.params;
    const decisionId = decisionIdSchema.parse(rawDecisionId);
    const context = await requireStoreContext(
      storeId,
      ["recommendations.approve"],
      request.headers,
    );
    const scheduleInput = recommendationFollowUpScheduleInputSchema.parse(
      await request.json(),
    );
    const followUp = await scheduleRecommendationFollowUp({
      context,
      decisionId,
      scheduleInput,
      requestId,
    });

    return NextResponse.json(
      recommendationFollowUpResponseSchema.parse({ followUp, requestId }),
    );
  } catch (error) {
    return recommendationFollowUpErrorResponse({
      error,
      method: "POST",
      requestId,
      route: "/api/stores/[storeId]/decisions/[decisionId]/follow-ups",
    });
  }
}
