import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import { layoutResponseSchema } from "@/domain/space/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { getCurrentStoreLayout } from "@/server/services/layout-service";

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
      ["stores.read"],
      request.headers,
    );
    const result = await getCurrentStoreLayout(context);

    return NextResponse.json(
      layoutResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof z.ZodError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized,
      requestId,
      route: "/api/stores/[storeId]/layout",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_LAYOUT"
            : "LAYOUT_READ_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Le plan enregistré est invalide"
            : "Le plan du magasin ne peut pas être chargé",
        requestId,
      }),
      { status: unauthorized ? 404 : 503 },
    );
  }
}
