import { NextResponse } from "next/server";
import * as z from "zod";

import { periodQuerySchema } from "@/domain/analytics/schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { recommendationsResponseSchema } from "@/domain/recommendations/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { getRecommendations } from "@/server/services/recommendation-service";

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
    const recommendations = await getRecommendations(context, query.period);

    return NextResponse.json(
      recommendationsResponseSchema.parse({
        periodKey: query.period,
        recommendations,
        requestId,
      }),
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
            : "RECOMMENDATIONS_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Période invalide"
            : "Les recommandations ne peuvent pas être générées",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
