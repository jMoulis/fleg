import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import {
  ExperimentConflictError,
  ExperimentNotFoundError,
  ExperimentTransitionError,
  InvalidExperimentReferenceError,
} from "@/server/repositories/experiment-repository";

export function experimentErrorResponse(error: unknown, requestId: string) {
  const notFound =
    error instanceof AuthenticationRequiredError ||
    error instanceof StoreAccessDeniedError ||
    error instanceof ExperimentNotFoundError;
  const invalid =
    error instanceof z.ZodError ||
    error instanceof InvalidExperimentReferenceError;
  const conflict =
    error instanceof ExperimentConflictError ||
    error instanceof ExperimentTransitionError;

  return NextResponse.json(
    apiErrorSchema.parse({
      code: notFound
        ? "STORE_OR_EXPERIMENT_NOT_FOUND"
        : invalid
          ? "INVALID_EXPERIMENT"
          : conflict
            ? error instanceof ExperimentTransitionError
              ? error.code
              : "EXPERIMENT_CONFLICT"
            : "EXPERIMENT_FAILED",
      message: notFound
        ? "Magasin ou expérience introuvable, ou accès refusé"
        : invalid
          ? error instanceof InvalidExperimentReferenceError
            ? error.message
            : "La définition de l'expérience contient des valeurs invalides"
          : conflict
            ? error.message
            : "L'expérience n'a pas pu être enregistrée",
      requestId,
    }),
    { status: notFound ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
