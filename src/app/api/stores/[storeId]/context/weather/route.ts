import { NextResponse } from "next/server";

import {
  weatherObservationCreateInputSchema,
  weatherObservationResponseSchema,
} from "@/domain/context-observations/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { contextObservationErrorResponse } from "@/server/http/context-observation-error-response";
import { createWeatherObservation } from "@/server/services/context-observation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["context.write"],
      request.headers,
    );
    const createInput = weatherObservationCreateInputSchema.parse(
      await request.json(),
    );
    const observation = await createWeatherObservation({
      context,
      createInput,
      requestId,
    });
    return NextResponse.json(
      weatherObservationResponseSchema.parse({ observation, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return contextObservationErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/context/weather",
      method: "POST",
    });
  }
}
