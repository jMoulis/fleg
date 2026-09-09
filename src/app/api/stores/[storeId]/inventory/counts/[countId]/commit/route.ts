import { NextResponse } from "next/server";

import {
  inventoryCommitResponseSchema,
  inventoryCountCommitInputSchema,
} from "@/domain/inventory/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import { commitInventoryCount } from "@/server/services/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string; countId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId, countId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.write"],
      request.headers,
    );
    const commitInput = inventoryCountCommitInputSchema.parse(
      await request.json(),
    );
    const result = await commitInventoryCount({
      context,
      countId,
      commitInput,
      requestId,
    });
    return NextResponse.json(
      inventoryCommitResponseSchema.parse({ result, requestId }),
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      method: "POST",
      requestId,
      route: "/api/stores/[storeId]/inventory/counts/[countId]/commit",
    });
  }
}
