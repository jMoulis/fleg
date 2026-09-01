import { NextResponse } from "next/server";
import * as z from "zod";

import {
  periodQuerySchema,
  productMetricsResponseSchema,
} from "@/domain/analytics/schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { getProductMetrics } from "@/server/services/analytics-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const query = periodQuerySchema.parse({
      period: new URL(request.url).searchParams.get("period"),
    });
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const result = await getProductMetrics(context, query.period);

    return NextResponse.json(
      productMetricsResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof z.ZodError;

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_PERIOD"
            : "PRODUCT_METRICS_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Période invalide"
            : "Les indicateurs produits ne peuvent pas être calculés",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
