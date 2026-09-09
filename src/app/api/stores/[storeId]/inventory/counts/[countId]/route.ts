import { NextResponse } from "next/server";

import {
  inventoryCountResponseSchema,
  inventoryCountUpdateInputSchema,
} from "@/domain/inventory/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import { saveInventoryCount } from "@/server/services/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; countId: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, countId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.write"],
      request.headers,
    );
    const updateInput = inventoryCountUpdateInputSchema.parse(
      await request.json(),
    );
    const count = await saveInventoryCount({
      context,
      countId,
      updateInput,
      requestId,
    });
    return NextResponse.json(
      inventoryCountResponseSchema.parse({ count, requestId }),
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      method: "PATCH",
      requestId,
      route: "/api/stores/[storeId]/inventory/counts/[countId]",
    });
  }
}
