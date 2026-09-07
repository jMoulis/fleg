import { NextResponse } from "next/server";
import * as z from "zod";

import { PhotoValidationError } from "@/domain/attachments/photo-validation";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  AttachmentConflictError,
  AttachmentLimitError,
  AttachmentNotFoundError,
  AttachmentReferenceError,
} from "@/server/repositories/attachment-repository";

export function attachmentErrorResponse(input: {
  error: unknown;
  requestId: string;
  route: string;
  method: "GET" | "POST" | "DELETE";
}) {
  const unauthorized =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError;
  const notFound = input.error instanceof AttachmentNotFoundError;
  const invalid =
    input.error instanceof z.ZodError ||
    input.error instanceof SyntaxError ||
    input.error instanceof PhotoValidationError ||
    input.error instanceof AttachmentReferenceError;
  const conflict =
    input.error instanceof AttachmentLimitError ||
    input.error instanceof AttachmentConflictError;
  reportUnexpectedApiError({
    error: input.error,
    expected: unauthorized || notFound || invalid || conflict,
    requestId: input.requestId,
    route: input.route,
    method: input.method,
  });

  const message =
    input.error instanceof PhotoValidationError ||
    input.error instanceof AttachmentReferenceError ||
    input.error instanceof AttachmentNotFoundError ||
    input.error instanceof AttachmentLimitError ||
    input.error instanceof AttachmentConflictError
      ? input.error.message
      : unauthorized
        ? "Magasin introuvable ou accès refusé"
        : invalid
          ? "La demande de photo contient des valeurs invalides"
          : "La photo n’a pas pu être traitée";
  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : notFound
          ? "ATTACHMENT_NOT_FOUND"
          : invalid
            ? "INVALID_ATTACHMENT"
            : conflict
              ? input.error instanceof AttachmentLimitError
                ? "ATTACHMENT_LIMIT_REACHED"
                : "ATTACHMENT_CONFLICT"
              : "ATTACHMENT_FAILED",
      message,
      requestId: input.requestId,
    }),
    {
      status: unauthorized || notFound ? 404 : invalid ? 400 : conflict ? 409 : 503,
    },
  );
}
