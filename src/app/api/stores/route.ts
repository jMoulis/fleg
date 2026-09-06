import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  storeAdminResponseSchema,
  storeCreateInputSchema,
} from "@/domain/admin/schemas";
import { storesResponseSchema } from "@/domain/stores/schemas";
import { requireOrganizationAdminById } from "@/server/auth/organization-admin-context";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import { createStore } from "@/server/services/organization-admin-service";
import { listAuthorizedStores } from "@/server/services/store-access-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const stores = await listAuthorizedStores(request.headers);

    return NextResponse.json(
      storesResponseSchema.parse({ stores, requestId }),
    );
  } catch (error) {
    const unauthorized = error instanceof AuthenticationRequiredError;
    reportUnexpectedApiError({
      error,
      expected: unauthorized,
      requestId,
      route: "/api/stores",
      method: "GET",
    });
    const response = apiErrorSchema.parse({
      code: unauthorized ? "AUTHENTICATION_REQUIRED" : "SERVICE_UNAVAILABLE",
      message: unauthorized
        ? "Authentification requise"
        : "Le service magasins est temporairement indisponible",
      requestId,
    });

    return NextResponse.json(response, { status: unauthorized ? 401 : 503 });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const createInput = storeCreateInputSchema.parse(await request.json());
    const context = await requireOrganizationAdminById(
      createInput.organizationId,
      request.headers,
    );
    const store = await createStore({ context, createInput, requestId });

    return NextResponse.json(
      storeAdminResponseSchema.parse({ store, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/stores",
      method: "POST",
    });
  }
}
