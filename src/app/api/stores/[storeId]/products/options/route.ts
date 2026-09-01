import { NextResponse } from "next/server";

import { apiErrorSchema } from "@/domain/api/schemas";
import { productOptionsResponseSchema } from "@/domain/products/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { ProductRepository } from "@/server/repositories/product-repository";

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
    const products = await new ProductRepository(await getAppDb()).listOptions(
      context,
    );

    return NextResponse.json(
      productOptionsResponseSchema.parse({ products, requestId }),
    );
  } catch (error) {
    const unauthorized =
      error instanceof AuthenticationRequiredError ||
      error instanceof StoreAccessDeniedError;

    return NextResponse.json(
      apiErrorSchema.parse({
        code: unauthorized
          ? "STORE_NOT_FOUND_OR_FORBIDDEN"
          : "PRODUCT_OPTIONS_FAILED",
        message: unauthorized
          ? "Magasin introuvable ou accès refusé"
          : "Les produits ne peuvent pas être chargés",
        requestId,
      }),
      { status: unauthorized ? 404 : 503 },
    );
  }
}
