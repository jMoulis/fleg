import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  commercialEventCreateInputSchema,
  commercialEventResponseSchema,
  commercialEventsResponseSchema,
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
import {
  createCommercialEvent,
  listCommercialEvents,
} from "@/server/services/commercial-event-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const events = await listCommercialEvents(context);

    return NextResponse.json(
      commercialEventsResponseSchema.parse({ events, requestId }),
    );
  } catch (error) {
    return commercialEventErrorResponse(error, requestId, "GET");
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["tg.publish"],
      request.headers,
    );
    const createInput = commercialEventCreateInputSchema.parse(
      await request.json(),
    );
    const event = await createCommercialEvent({
      context,
      createInput,
      requestId,
    });

    return NextResponse.json(
      commercialEventResponseSchema.parse({ event, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return commercialEventErrorResponse(error, requestId, "POST");
  }
}

function commercialEventErrorResponse(
  error: unknown,
  requestId: string,
  method: "GET" | "POST",
) {
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
    route: "/api/stores/[storeId]/commercial-events",
    method,
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
