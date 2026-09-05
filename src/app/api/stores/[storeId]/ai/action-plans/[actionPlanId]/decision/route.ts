import { NextResponse } from "next/server";
import * as z from "zod";

import {
  aiActionPlanDecisionInputSchema,
  aiActionPlanDecisionResponseSchema,
  aiActionPlanIdSchema,
} from "@/domain/ai/action-plans";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  AiActionPlanAlreadyDecidedError,
  AiActionPlanNotFoundError,
} from "@/server/repositories/ai-action-plan-repository";
import { decideAiActionPlan } from "@/server/services/ai-action-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; actionPlanId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId, actionPlanId: rawActionPlanId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["recommendations.approve"],
      request.headers,
    );
    const actionPlanId = aiActionPlanIdSchema.parse(rawActionPlanId);
    const decisionInput = aiActionPlanDecisionInputSchema.parse(
      await request.json(),
    );
    const actionPlan = await decideAiActionPlan({
      context,
      actionPlanId,
      decisionInput,
      requestId,
    });

    return NextResponse.json(
      aiActionPlanDecisionResponseSchema.parse({ actionPlan, requestId }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError ||
      error instanceof AiActionPlanNotFoundError;
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    const conflict = error instanceof AiActionPlanAlreadyDecidedError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid || conflict,
      requestId,
      route: "/api/stores/[storeId]/ai/action-plans/[actionPlanId]/decision",
      method: "POST",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_AI_ACTION_PLAN_DECISION"
            : conflict
              ? "AI_ACTION_PLAN_ALREADY_DECIDED"
              : "AI_ACTION_PLAN_DECISION_FAILED",
        message: unauthorized
          ? "Plan d’action introuvable ou accès refusé"
          : invalid
            ? "Décision de plan d’action invalide"
            : conflict
              ? "Ce plan d’action a déjà reçu une décision"
              : "La décision n’a pas pu être enregistrée",
        requestId,
      }),
      {
        status: unauthorized ? 404 : invalid ? 400 : conflict ? 409 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
