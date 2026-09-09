import "server-only";

import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  ContextObservationConflictError,
  ContextObservationReferenceError,
} from "@/server/repositories/context-observation-repository";

export function contextObservationErrorResponse(input: {
  error: unknown;
  requestId: string;
  route: string;
  method: "GET" | "POST";
}) {
  const notFound =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError ||
    input.error instanceof ContextObservationReferenceError;
  const invalid = input.error instanceof z.ZodError;
  const conflict = input.error instanceof ContextObservationConflictError;
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
        ? "STORE_OR_CONTEXT_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_CONTEXT_OBSERVATION"
          : conflict
            ? "CONTEXT_OBSERVATION_CONFLICT"
            : "CONTEXT_OBSERVATION_FAILED",
      message: notFound
        ? "Magasin, produit ou source contextuelle introuvable, ou accès refusé"
        : invalid
          ? "L’observation contextuelle contient des valeurs invalides"
          : conflict
            ? input.error instanceof ContextObservationConflictError
              ? input.error.message
              : "Conflit lors de l’enregistrement du contexte"
            : "L’observation contextuelle n’a pas pu être traitée",
      requestId: input.requestId,
    }),
    { status: notFound ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
