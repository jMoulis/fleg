import { NextResponse } from "next/server";
import * as z from "zod";

import { OrganizationAdminAccessDeniedError } from "@/domain/admin/authorization";
import { apiErrorSchema } from "@/domain/api/schemas";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  StoreAdminConflictError,
  StoreAdminReferenceError,
} from "@/server/repositories/store-admin-repository";
import {
  InvitationRecipientExistsError,
  InvitationRegistrationUnavailableError,
} from "@/server/services/invitation-registration-service";

function authApiStatus(error: unknown): number | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("statusCode" in error) ||
    typeof error.statusCode !== "number"
  ) {
    return null;
  }
  return error.statusCode >= 400 && error.statusCode < 500
    ? error.statusCode
    : null;
}

export function adminApiErrorResponse(input: {
  error: unknown;
  requestId: string;
  route: string;
  method: string;
}) {
  const error = input.error;
  const unauthenticated = error instanceof AuthenticationRequiredError;
  const unauthorized =
    error instanceof OrganizationAdminAccessDeniedError ||
    error instanceof StoreAdminReferenceError;
  const invalid = error instanceof z.ZodError;
  const conflict = error instanceof StoreAdminConflictError;
  const invitationUnavailable =
    error instanceof InvitationRegistrationUnavailableError;
  const recipientExists = error instanceof InvitationRecipientExistsError;
  const providerStatus = authApiStatus(error);
  const expected =
    unauthenticated ||
    unauthorized ||
    invalid ||
    conflict ||
    invitationUnavailable ||
    recipientExists ||
    providerStatus !== null;
  const status = unauthenticated
    ? 401
    : unauthorized
      ? 404
      : invitationUnavailable
        ? 404
        : invalid
        ? 400
        : conflict || recipientExists
          ? 409
          : (providerStatus ?? 503);
  const code = unauthenticated
    ? "AUTHENTICATION_REQUIRED"
    : unauthorized
      ? "ORGANIZATION_NOT_FOUND_OR_FORBIDDEN"
      : invitationUnavailable
        ? "INVITATION_NOT_FOUND"
      : invalid
        ? "INVALID_ADMIN_COMMAND"
        : conflict || recipientExists
          ? error instanceof StoreAdminConflictError
            ? error.code
            : recipientExists
              ? "INVITATION_RECIPIENT_EXISTS"
              : "STORE_ADMIN_CONFLICT"
          : providerStatus !== null
            ? "IDENTITY_COMMAND_REJECTED"
            : "ADMIN_COMMAND_FAILED";
  const message = unauthenticated
    ? "Authentification requise"
    : unauthorized
      ? "Organisation ou ressource introuvable"
      : invitationUnavailable
        ? error.message
      : invalid
        ? "Le formulaire contient des valeurs invalides"
        : conflict || recipientExists
          ? error instanceof StoreAdminConflictError
            ? error.message
            : recipientExists
              ? error.message
              : "La ressource a été modifiée simultanément"
          : providerStatus !== null
            ? error instanceof Error
              ? error.message
              : "L’opération d’identité a été refusée"
            : "L’opération d’administration n’a pas pu être terminée";

  reportUnexpectedApiError({
    error,
    expected,
    requestId: input.requestId,
    route: input.route,
    method: input.method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({ code, message, requestId: input.requestId }),
    { status },
  );
}
