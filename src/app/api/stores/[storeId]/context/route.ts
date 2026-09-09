import { NextResponse } from "next/server";

import {
  businessContextRangeQuerySchema,
  businessContextResponseSchema,
} from "@/domain/context-observations/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { contextObservationErrorResponse } from "@/server/http/context-observation-error-response";
import { getBusinessContextView } from "@/server/services/context-observation-service";

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
      ["analytics.read"],
      request.headers,
    );
    const url = new URL(request.url);
    const query = businessContextRangeQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
    const businessContext = await getBusinessContextView(context, query);
    return NextResponse.json(
      businessContextResponseSchema.parse({
        context: businessContext,
        requestId,
      }),
    );
  } catch (error) {
    return contextObservationErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/context",
      method: "GET",
    });
  }
}
