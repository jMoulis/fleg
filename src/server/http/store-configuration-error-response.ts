import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { StoreConfigurationConflictError } from "@/server/repositories/store-configuration-repository";

export function storeConfigurationErrorResponse(input: {
  error: unknown;
  invalidCode: string;
  invalidMessage: string;
  method: "GET" | "PATCH" | "PUT";
  requestId: string;
  route: string;
}) {
  const unauthorized =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError;
  const invalid = input.error instanceof z.ZodError;
  const configurationConflict =
    input.error instanceof StoreConfigurationConflictError
      ? input.error
      : null;
  const conflict = configurationConflict !== null;
  const conflictMessage = configurationConflict?.message ?? "Conflit de configuration";
  reportUnexpectedApiError({
    error: input.error,
    expected: unauthorized || invalid || conflict,
    requestId: input.requestId,
    route: input.route,
    method: input.method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? input.invalidCode
          : conflict
            ? "STORE_CONFIGURATION_CONFLICT"
            : "STORE_CONFIGURATION_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : invalid
          ? input.invalidMessage
          : conflict
            ? conflictMessage
            : "La configuration du magasin est temporairement indisponible",
      requestId: input.requestId,
    }),
    { status: unauthorized ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
