import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import { storesResponseSchema } from "@/domain/stores/schemas";
import { AuthenticationRequiredError } from "@/server/auth/session";
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
