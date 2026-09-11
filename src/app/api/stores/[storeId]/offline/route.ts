import { NextResponse } from "next/server";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import { prepareOfflineWorkspace } from "@/server/services/offline-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  route: { params: Promise<{ storeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.read"],
      request.headers,
    );
    const query = inventoryWorkspaceQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(
      await prepareOfflineWorkspace({
        context,
        businessDate: query.businessDate,
        headers: request.headers,
      }),
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      requestId,
      method: "GET",
      route: "/api/stores/[storeId]/offline",
    });
  }
}
