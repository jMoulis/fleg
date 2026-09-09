import { NextResponse } from "next/server";

import {
  orderSuggestionApprovalInputSchema,
  orderSuggestionIdSchema,
  orderSuggestionResponseSchema,
} from "@/domain/ordering/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { orderSuggestionErrorResponse } from "@/server/http/order-suggestion-error-response";
import { approveOrderSuggestion } from "@/server/services/order-suggestion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; suggestionId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, suggestionId: suggestionIdInput } =
      await routeContext.params;
    const suggestionId = orderSuggestionIdSchema.parse(suggestionIdInput);
    const context = await requireStoreContext(
      storeId,
      ["analytics.read", "inventory.read", "recommendations.approve"],
      request.headers,
    );
    const approvalInput = orderSuggestionApprovalInputSchema.parse(
      await request.json(),
    );
    const suggestion = await approveOrderSuggestion({
      context,
      suggestionId,
      approvalInput,
      requestId,
    });
    return NextResponse.json(
      orderSuggestionResponseSchema.parse({ suggestion, requestId }),
    );
  } catch (error) {
    return orderSuggestionErrorResponse({
      error,
      requestId,
      route:
        "/api/stores/[storeId]/order-suggestions/[suggestionId]/approve",
      method: "POST",
    });
  }
}
