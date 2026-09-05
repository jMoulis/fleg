import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  layoutResponseSchema,
  layoutVersionCreateInputSchema,
} from "@/domain/space/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { LayoutVersionConflictError } from "@/server/repositories/layout-repository";
import { createStoreLayoutVersion } from "@/server/services/layout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["layouts.write"],
      request.headers,
    );
    const createInput = layoutVersionCreateInputSchema.parse(
      await request.json(),
    );
    const result = await createStoreLayoutVersion({
      context,
      createInput,
      requestId,
    });

    return NextResponse.json(
      layoutResponseSchema.parse({ ...result, requestId }),
      { status: 201 },
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;
    const invalid = error instanceof z.ZodError;
    const conflict = error instanceof LayoutVersionConflictError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized || invalid || conflict,
      requestId,
      route: "/api/stores/[storeId]/layout/versions",
      method: "POST",
    });

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : invalid
            ? "INVALID_LAYOUT_VERSION"
            : conflict
              ? "LAYOUT_VERSION_CONFLICT"
              : "LAYOUT_VERSION_CREATE_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : invalid
            ? "Le plan contient des valeurs invalides"
            : conflict
              ? "Une version plus récente existe. Rechargez le plan avant de réessayer."
              : "La nouvelle version du plan n'a pas pu être créée",
        requestId,
      }),
      { status: unauthorized ? 404 : invalid ? 400 : conflict ? 409 : 503 },
    );
  }
}
