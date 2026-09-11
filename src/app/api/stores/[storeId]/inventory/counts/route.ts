import { NextResponse } from "next/server";

import {
  inventoryCountCreateInputSchema,
  inventoryCountResponseSchema,
  inventoryWorkspaceQuerySchema,
  inventoryWorkspaceResponseSchema,
} from "@/domain/inventory/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import { assertInventorySessionBinding } from "@/server/http/inventory-session-binding";
import {
  createInventoryCount,
  getInventoryWorkspace,
} from "@/server/services/inventory-service";

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
      ["inventory.read"],
      request.headers,
    );
    const query = inventoryWorkspaceQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const workspace = await getInventoryWorkspace({
      context,
      businessDate: query.businessDate,
    });
    return NextResponse.json(
      inventoryWorkspaceResponseSchema.parse({ workspace, requestId }),
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      method: "GET",
      requestId,
      route: "/api/stores/[storeId]/inventory/counts",
    });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.write"],
      request.headers,
    );
    await assertInventorySessionBinding(request.headers);
    const createInput = inventoryCountCreateInputSchema.parse(
      await request.json(),
    );
    const count = await createInventoryCount({
      context,
      createInput,
      requestId,
    });
    return NextResponse.json(
      inventoryCountResponseSchema.parse({ count, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      method: "POST",
      requestId,
      route: "/api/stores/[storeId]/inventory/counts",
    });
  }
}
