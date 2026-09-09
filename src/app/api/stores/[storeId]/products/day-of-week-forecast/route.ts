import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  dayOfWeekForecastAnalysisResponseSchema,
  dayOfWeekForecastQuerySchema,
} from "@/domain/forecasting/day-of-week-forecast-schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { GranularSalesProductNotFoundError } from "@/server/repositories/granular-sales-repository";
import { getDayOfWeekForecast } from "@/server/services/day-of-week-forecast-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const query = dayOfWeekForecastQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const forecast = await getDayOfWeekForecast(context, query);

    return NextResponse.json(
      dayOfWeekForecastAnalysisResponseSchema.parse({
        ...forecast,
        requestId,
      }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError ||
      error instanceof GranularSalesProductNotFoundError;
    const invalid = error instanceof z.ZodError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid,
      requestId,
      route: "/api/stores/[storeId]/products/day-of-week-forecast",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_OR_PRODUCT_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_DAY_OF_WEEK_FORECAST_QUERY"
            : "DAY_OF_WEEK_FORECAST_READ_FAILED",
        message: unauthorized
          ? "Magasin ou produit introuvable, ou accès refusé"
          : invalid
            ? "Paramètres de prévision journalière invalides"
            : "La prévision par jour de semaine ne peut pas être calculée",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
