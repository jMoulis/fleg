import { NextResponse } from "next/server";
import * as z from "zod";

import {
  dailySalesReadResponseSchema,
  granularSalesRangeQuerySchema,
} from "@/domain/analytics/granular-sales-schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { GranularSalesProductNotFoundError } from "@/server/repositories/granular-sales-repository";
import { getDailySalesView } from "@/server/services/granular-sales-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const query = granularSalesRangeQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const result = await getDailySalesView(context, query);

    return NextResponse.json(
      dailySalesReadResponseSchema.parse({ ...result, requestId }),
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
      route: "/api/stores/[storeId]/sales/daily",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_OR_PRODUCT_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_GRANULAR_SALES_RANGE"
            : "DAILY_SALES_READ_FAILED",
        message: unauthorized
          ? "Magasin ou produit introuvable, ou accès refusé"
          : invalid
            ? "Plage de dates invalide"
            : "Les ventes journalières ne peuvent pas être consultées",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
