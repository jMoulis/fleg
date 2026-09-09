import "server-only";

import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  OrderSuggestionConflictError,
  OrderSuggestionDecisionError,
  OrderSuggestionInputChangedError,
  OrderSuggestionNotFoundError,
} from "@/server/repositories/order-suggestion-repository";
import { OrderSuggestionNonOrderingDayError } from "@/server/services/order-suggestion-service";

export function orderSuggestionErrorResponse(input: {
  error: unknown;
  requestId: string;
  route: string;
  method: "GET" | "POST";
}) {
  const notFound =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError ||
    input.error instanceof OrderSuggestionNotFoundError;
  const invalid =
    input.error instanceof z.ZodError ||
    input.error instanceof OrderSuggestionDecisionError ||
    input.error instanceof OrderSuggestionNonOrderingDayError;
  const conflict =
    input.error instanceof OrderSuggestionConflictError ||
    input.error instanceof OrderSuggestionInputChangedError;
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
        ? "ORDER_SUGGESTION_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_ORDER_SUGGESTION"
          : conflict
            ? "ORDER_SUGGESTION_CONFLICT"
            : "ORDER_SUGGESTION_FAILED",
      message:
        input.error instanceof Error
          ? input.error.message
          : "La proposition de commande n’a pas pu être traitée",
      requestId: input.requestId,
    }),
    { status: notFound ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
