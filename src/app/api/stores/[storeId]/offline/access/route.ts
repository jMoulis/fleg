import { NextResponse } from "next/server";
import { requireStoreContext } from "@/server/auth/store-context";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import { getOfflineAccess } from "@/server/services/offline-service";

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
    const { identity } = await getOfflineAccess(context, request.headers);
    return NextResponse.json(identity);
  } catch (error) {
    return inventoryErrorResponse({
      error,
      requestId,
      method: "GET",
      route: "/api/stores/[storeId]/offline/access",
    });
  }
}
