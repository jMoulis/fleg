import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { InventoryCountValidationError } from "@/domain/inventory/calculations";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  InventoryConflictError,
  InventoryNotFoundError,
  InventoryReferenceError,
} from "@/server/repositories/inventory-repository";

export function inventoryErrorResponse(input: {
  error: unknown;
  method: "GET" | "POST" | "PATCH";
  requestId: string;
  route: string;
}) {
  const unauthorized =
    input.error instanceof AuthenticationRequiredError ||
    input.error instanceof StoreAccessDeniedError;
  const notFound = input.error instanceof InventoryNotFoundError;
  const invalid =
    input.error instanceof z.ZodError ||
    input.error instanceof InventoryCountValidationError ||
    input.error instanceof InventoryReferenceError;
  const conflict = input.error instanceof InventoryConflictError;
  reportUnexpectedApiError({
    error: input.error,
    expected: unauthorized || notFound || invalid || conflict,
    requestId: input.requestId,
    route: input.route,
    method: input.method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : notFound
          ? "INVENTORY_NOT_FOUND"
        : invalid
          ? "INVALID_INVENTORY_COUNT"
          : conflict
            ? "INVENTORY_CONFLICT"
            : "INVENTORY_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : notFound
          ? "Comptage introuvable ou accès refusé"
        : input.error instanceof InventoryCountValidationError ||
            input.error instanceof InventoryReferenceError ||
            input.error instanceof InventoryConflictError
          ? input.error.message
          : invalid
            ? "Le comptage contient des valeurs invalides"
            : "Le comptage de stock est temporairement indisponible",
      requestId: input.requestId,
    }),
    {
      status:
        unauthorized || notFound ? 404 : invalid ? 400 : conflict ? 409 : 503,
    },
  );
}
