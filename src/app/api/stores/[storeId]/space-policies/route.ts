import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  productSpacePolicySetResponseSchema,
  productSpacePolicySetUpdateInputSchema,
} from "@/domain/space/product-space-policy-schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  ProductSpacePolicyConflictError,
  ProductSpacePolicyReferenceError,
} from "@/server/repositories/product-space-policy-repository";
import {
  getProductSpacePolicySet,
  updateProductSpacePolicySet,
} from "@/server/services/product-space-policy-service";

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
      ["stores.read", "analytics.read"],
      request.headers,
    );
    const policySet = await getProductSpacePolicySet(context);

    return NextResponse.json(
      productSpacePolicySetResponseSchema.parse({ policySet, requestId }),
    );
  } catch (error) {
    return policyErrorResponse(error, requestId, "GET");
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["allocations.write"],
      request.headers,
    );
    const updateInput = productSpacePolicySetUpdateInputSchema.parse(
      await request.json(),
    );
    const policySet = await updateProductSpacePolicySet({
      context,
      updateInput,
      requestId,
    });

    return NextResponse.json(
      productSpacePolicySetResponseSchema.parse({ policySet, requestId }),
    );
  } catch (error) {
    return policyErrorResponse(error, requestId, "PATCH");
  }
}

function policyErrorResponse(
  error: unknown,
  requestId: string,
  method: "GET" | "PATCH",
) {
  const unauthorized =
    error instanceof AuthenticationRequiredError ||
    error instanceof StoreAccessDeniedError;
  const invalid =
    error instanceof z.ZodError ||
    error instanceof ProductSpacePolicyReferenceError;
  const conflict = error instanceof ProductSpacePolicyConflictError;

  reportUnexpectedApiError({
    error,
    expected: unauthorized || invalid || conflict,
    requestId,
    route: "/api/stores/[storeId]/space-policies",
    method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_PRODUCT_SPACE_POLICY"
          : conflict
            ? "PRODUCT_SPACE_POLICY_CONFLICT"
            : "PRODUCT_SPACE_POLICY_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : invalid
          ? error instanceof ProductSpacePolicyReferenceError
            ? error.message
            : "Les contraintes produits contiennent des valeurs invalides"
          : conflict
            ? error.message
            : "Les contraintes produits n’ont pas pu être enregistrées",
      requestId,
    }),
    { status: unauthorized ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
