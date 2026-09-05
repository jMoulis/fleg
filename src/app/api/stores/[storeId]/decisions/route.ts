import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import { decisionLogResponseSchema } from "@/domain/decisions/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { listDecisionLog } from "@/server/services/decision-service";

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
    const decisions = await listDecisionLog({
      context,
      requestHeaders: request.headers,
    });

    return NextResponse.json(
      decisionLogResponseSchema.parse({ decisions, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized,
      requestId,
      route: "/api/stores/[storeId]/decisions",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : "DECISION_LOG_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : "Le journal des décisions ne peut pas être chargé",
        requestId,
      }),
      { status: unauthorized ? 404 : 503 },
    );
  }
}
