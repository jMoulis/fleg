import { NextResponse } from "next/server";
import * as z from "zod";

import { apiErrorSchema } from "@/domain/api/schemas";
import {
  allocationPlanCreateInputSchema,
  allocationPlanResponseSchema,
} from "@/domain/space/allocation-schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";
import { reportUnexpectedApiError } from "@/server/http/api-error-monitor";
import {
  AllocationPlanConflictError,
  InvalidAllocationPlanError,
} from "@/server/repositories/allocation-repository";
import {
  createStoreAllocationPlan,
  getCurrentAllocationPlan,
} from "@/server/services/allocation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

const allocationPlanQuerySchema = z.object({
  layoutVersionId: z.string().regex(/^[a-f\d]{24}$/i),
});

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const { layoutVersionId } = allocationPlanQuerySchema.parse({
      layoutVersionId: new URL(request.url).searchParams.get("layoutVersionId"),
    });

    const plan = await getCurrentAllocationPlan({
      context,
      layoutVersionId,
    });

    return NextResponse.json(
      allocationPlanResponseSchema.parse({ plan, requestId }),
    );
  } catch (error) {
    return allocationErrorResponse(error, requestId, "GET");
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();

  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["allocations.write"],
      request.headers,
    );
    const createInput = allocationPlanCreateInputSchema.parse(
      await request.json(),
    );
    const plan = await createStoreAllocationPlan({
      context,
      createInput,
      requestId,
    });

    return NextResponse.json(
      allocationPlanResponseSchema.parse({ plan, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return allocationErrorResponse(error, requestId, "POST");
  }
}

function allocationErrorResponse(
  error: unknown,
  requestId: string,
  method: "GET" | "POST",
) {
  const unauthorized =
    error instanceof AuthenticationRequiredError ||
    error instanceof StoreAccessDeniedError;
  const invalid =
    error instanceof z.ZodError || error instanceof InvalidAllocationPlanError;
  const conflict = error instanceof AllocationPlanConflictError;

  reportUnexpectedApiError({
    error,
    expected: unauthorized || invalid || conflict,
    requestId,
    route: "/api/stores/[storeId]/allocations",
    method,
  });

  return NextResponse.json(
    apiErrorSchema.parse({
      code: unauthorized
        ? "STORE_NOT_FOUND_OR_FORBIDDEN"
        : invalid
          ? "INVALID_ALLOCATION_PLAN"
          : conflict
            ? "ALLOCATION_PLAN_CONFLICT"
            : "ALLOCATION_PLAN_FAILED",
      message: unauthorized
        ? "Magasin introuvable ou accès refusé"
        : invalid
          ? error instanceof InvalidAllocationPlanError
            ? error.message
            : "Le plan d'allocation contient des valeurs invalides"
          : conflict
            ? "Le plan a changé. Rechargez la page avant de réessayer."
            : "Le plan d'allocation n'a pas pu être enregistré",
      requestId,
    }),
    { status: unauthorized ? 404 : invalid ? 400 : conflict ? 409 : 503 },
  );
}
