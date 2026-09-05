import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { networkDashboardQuerySchema, networkDashboardResponseSchema } from "@/domain/network/schemas";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { getNetworkDashboard } from "@/server/services/network-analytics-service";
import { requireNetworkStoreSet } from "@/server/services/store-access-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readStoreIds(searchParams: URLSearchParams): string[] {
  const repeated = searchParams.getAll("storeId");
  const grouped = searchParams
    .getAll("storeIds")
    .flatMap((value) => value.split(","));

  return [...repeated, ...grouped]
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const searchParams = new URL(request.url).searchParams;
    const query = networkDashboardQuerySchema.parse({
      storeIds: readStoreIds(searchParams),
      period: searchParams.get("period") ?? undefined,
    });
    const contexts = await requireNetworkStoreSet(
      query.storeIds,
      request.headers,
    );
    const dashboard = await getNetworkDashboard(contexts, query.period);

    return NextResponse.json(
      networkDashboardResponseSchema.parse({ dashboard, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError ||
      error instanceof NetworkStoreSetError;
    const invalid = error instanceof z.ZodError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid,
      requestId,
      route: "/api/network/dashboard",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_SET_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_NETWORK_QUERY"
            : "NETWORK_DASHBOARD_FAILED",
        message: unauthorized
          ? "Périmètre réseau introuvable ou accès refusé"
          : invalid
            ? "Sélection de magasins ou période invalide"
            : "Le tableau de bord réseau ne peut pas être calculé",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
