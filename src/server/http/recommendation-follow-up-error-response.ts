import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  InvalidRecommendationFollowUpError,
  RecommendationFollowUpConflictError,
  RecommendationFollowUpNotFoundError,
  RecommendationOutcomeUnavailableError,
} from "@/server/repositories/recommendation-follow-up-repository";

export function recommendationFollowUpErrorResponse(input: {
  error: unknown;
  method: "POST" | "PATCH";
  requestId: string;
  route: string;
}) {
  const notFound =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError ||
    input.error instanceof RecommendationFollowUpNotFoundError;
  const invalid =
    input.error instanceof z.ZodError ||
    input.error instanceof InvalidRecommendationFollowUpError;
  const conflict =
    input.error instanceof RecommendationFollowUpConflictError ||
    input.error instanceof RecommendationOutcomeUnavailableError;

  reportUnexpectedApiError({
    error: input.error,
    expected: notFound || invalid || conflict,
    requestId: input.requestId,
    route: input.route,
    method: input.method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: notFound
        ? "STORE_DECISION_OR_FOLLOW_UP_NOT_FOUND"
        : invalid
          ? "INVALID_RECOMMENDATION_FOLLOW_UP"
          : conflict
            ? input.error instanceof RecommendationOutcomeUnavailableError
              ? input.error.code
              : "RECOMMENDATION_FOLLOW_UP_CONFLICT"
            : "RECOMMENDATION_FOLLOW_UP_FAILED",
      message: notFound
        ? "Magasin, décision ou suivi introuvable, ou accès refusé"
        : invalid || conflict
          ? input.error instanceof Error
            ? input.error.message
            : "Suivi invalide"
          : "Le suivi de la recommandation n’a pas pu être enregistré",
      requestId: input.requestId,
    }),
    { status: notFound ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
