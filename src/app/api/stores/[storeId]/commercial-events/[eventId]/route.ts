import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  commercialEventResponseSchema,
  commercialEventUpdateInputSchema,
} from "@/domain/commercial-events/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  CommercialEventConflictError,
  CommercialEventScheduleConflictError,
  InvalidCommercialEventReferenceError,
} from "@/server/repositories/commercial-event-repository";
import { updateCommercialEvent } from "@/server/services/commercial-event-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; eventId: string }>;
}

const eventIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId, eventId: rawEventId } = await routeContext.params;
    const eventId = eventIdSchema.parse(rawEventId);
    const context = await requireStoreContext(
      storeId,
      ["tg.publish"],
      request.headers,
    );
    const updateInput = commercialEventUpdateInputSchema.parse(
      await request.json(),
    );
    const event = await updateCommercialEvent({
      context,
      eventId,
      updateInput,
      requestId,
    });

    return NextResponse.json(
      commercialEventResponseSchema.parse({ event, requestId }),
    );
  } catch (error) {
    return commercialEventErrorResponse(error, requestId);
  }
}

function commercialEventErrorResponse(error: unknown, requestId: string) {
  const unauthorized =
    error instanceof AuthenticationRequiredError ||
    error instanceof StoreAccessDeniedError;
  const invalid =
    error instanceof z.ZodError ||
    error instanceof InvalidCommercialEventReferenceError;
  const scheduleConflict = error instanceof CommercialEventScheduleConflictError;
  const conflict = error instanceof CommercialEventConflictError;
  reportUnexpectedApiError({
    error,
    expected: unauthorized || invalid || scheduleConflict || conflict,
    requestId,
    route: "/api/stores/[storeId]/commercial-events/[eventId]",
    method: "PATCH",
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_COMMERCIAL_EVENT"
          : scheduleConflict
            ? "COMMERCIAL_EVENT_SCHEDULE_CONFLICT"
            : conflict
              ? "COMMERCIAL_EVENT_CONFLICT"
              : "COMMERCIAL_EVENT_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : invalid
          ? error instanceof InvalidCommercialEventReferenceError
            ? error.message
            : "L'opération commerciale contient des valeurs invalides"
          : scheduleConflict || conflict
            ? error.message
            : "L'opération commerciale n'a pas pu être enregistrée",
      requestId,
    }),
    {
      status: unauthorized
        ? 404
        : invalid
          ? 400
          : scheduleConflict || conflict
            ? 409
            : 503,
    },
  );
}
