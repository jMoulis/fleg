import { NextResponse } from "next/server";
import * as z from "zod";

import {
  trueXyzAnalysisResponseSchema,
  trueXyzQuerySchema,
} from "@/domain/analytics/true-xyz-schemas";
import { apiErrorSchema } from "@/domain/api/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { GranularSalesProductNotFoundError } from "@/server/repositories/granular-sales-repository";
import { getTrueXyzAnalysis } from "@/server/services/true-xyz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const query = trueXyzQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const context = await requireStoreContext(
      storeId,
      ["analytics.read"],
      request.headers,
    );
    const analysis = await getTrueXyzAnalysis(context, query);

    return NextResponse.json(
      trueXyzAnalysisResponseSchema.parse({ ...analysis, requestId }),
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
      route: "/api/stores/[storeId]/products/xyz",
      method: "GET",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_OR_PRODUCT_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_TRUE_XYZ_QUERY"
            : "TRUE_XYZ_READ_FAILED",
        message: unauthorized
          ? "Magasin ou produit introuvable, ou accès refusé"
          : invalid
            ? "Paramètres de calcul XYZ invalides"
            : "La classification XYZ ne peut pas être calculée",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : 503 },
    );
  }
}
