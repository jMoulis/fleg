import { NextResponse } from "next/server";

import {
  orderSuggestionCreateInputSchema,
  orderSuggestionResponseSchema,
  orderSuggestionWorkspaceQuerySchema,
  orderSuggestionWorkspaceResponseSchema,
} from "@/domain/ordering/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { orderSuggestionErrorResponse } from "@/server/http/order-suggestion-error-response";
import {
  createOrderSuggestion,
  getOrderSuggestionWorkspace,
} from "@/server/services/order-suggestion-service";

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
      ["analytics.read", "inventory.read"],
      request.headers,
    );
    const query = orderSuggestionWorkspaceQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const workspace = await getOrderSuggestionWorkspace({
      context,
      orderDate: query.orderDate,
    });
    return NextResponse.json(
      orderSuggestionWorkspaceResponseSchema.parse({ ...workspace, requestId }),
    );
  } catch (error) {
    return orderSuggestionErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/order-suggestions",
      method: "GET",
    });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["analytics.read", "inventory.read", "recommendations.approve"],
      request.headers,
    );
    const createInput = orderSuggestionCreateInputSchema.parse(
      await request.json(),
    );
    const suggestion = await createOrderSuggestion({
      context,
      createInput,
      requestId,
    });
    return NextResponse.json(
      orderSuggestionResponseSchema.parse({ suggestion, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return orderSuggestionErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/order-suggestions",
      method: "POST",
    });
  }
}
