import { NextResponse } from "next/server";
import * as z from "zod";

import {
  dashboardResponseSchema,
  periodQuerySchema,
} from "@/domain/analytics/schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { getDashboardMetrics } from "@/server/services/analytics-service";

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
    const dashboard = await getDashboardMetrics(context, query.period);

    return NextResponse.json(
      dashboardResponseSchema.parse({ dashboard, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof z.ZodError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid,
      requestId,
      route: "/api/stores/[storeId]/dashboard",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_PERIOD"
            : "DASHBOARD_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Période invalide"
            : "Le tableau de bord ne peut pas être calculé",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
