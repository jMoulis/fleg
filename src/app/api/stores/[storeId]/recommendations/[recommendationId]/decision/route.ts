import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  decisionResponseSchema,
  recommendationDecisionInputSchema,
} from "@/domain/decisions/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { recordRecommendationDecision } from "@/server/services/decision-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; recommendationId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId, recommendationId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["recommendations.approve"],
      request.headers,
    );
    const decisionInput = recommendationDecisionInputSchema.parse(
      await request.json(),
    );
    const decision = await recordRecommendationDecision({
      context,
      recommendationId,
      decisionInput,
      requestId,
    });

    return NextResponse.json(
      decisionResponseSchema.parse({ decision, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof z.ZodError;

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_DECISION"
            : "DECISION_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Décision invalide"
            : "La décision n’a pas pu être enregistrée",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
