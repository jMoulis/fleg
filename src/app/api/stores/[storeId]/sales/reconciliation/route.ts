import { NextResponse } from "next/server";
import * as z from "zod";

import {
  granularSalesReconciliationQuerySchema,
  monthlySalesReconciliationResponseSchema,
} from "@/domain/analytics/granular-sales-schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { GranularSalesProductNotFoundError } from "@/server/repositories/granular-sales-repository";
import { getMonthlySalesReconciliation } from "@/server/services/granular-sales-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const query = granularSalesReconciliationQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const result = await getMonthlySalesReconciliation(context, query);

    return NextResponse.json(
      monthlySalesReconciliationResponseSchema.parse({ ...result, requestId }),
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
      route: "/api/stores/[storeId]/sales/reconciliation",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_OR_PRODUCT_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_RECONCILIATION_PERIOD"
            : "SALES_RECONCILIATION_FAILED",
        message: unauthorized
          ? "Magasin ou produit introuvable, ou accès refusé"
          : invalid
            ? "Période de réconciliation invalide"
            : "La réconciliation des ventes ne peut pas être calculée",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
