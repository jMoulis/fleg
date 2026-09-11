import { NextResponse } from "next/server";
import {
  inventorySyncInputSchema,
  syncConflictSchema,
} from "@/domain/offline/sync";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { inventoryErrorResponse } from "@/server/http/inventory-error-response";
import {
  InventorySyncRepository,
  InventorySyncConflict,
} from "@/server/repositories/inventory-sync-repository";
import { getOfflineAccess } from "@/server/services/offline-service";
import { InventoryReferenceError } from "@/server/repositories/inventory-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Route = { params: Promise<{ storeId: string }> };
const headers = { "Cache-Control": "no-store" };

async function readPayload(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InventoryReferenceError("Envoi vide");
  // 2,000 numeric lines fit below this transport limit; reject before JSON allocation.
  const maxBytes = 1_048_576;
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new InventoryReferenceError(
          "Envoi trop volumineux (maximum 1 Mio)",
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new InventoryReferenceError("Envoi JSON invalide");
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request, route: Route) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.write"],
      request.headers,
    );
    const { identity } = await getOfflineAccess(context, request.headers);
    if (
      identity.sessionBinding !== request.headers.get("x-fleg-session-binding")
    )
      throw new StoreAccessDeniedError();
    const input = inventorySyncInputSchema.parse(await readPayload(request));
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    const receipt = await new InventorySyncRepository(db, client).apply(
      context,
      input,
      requestId,
    );
    return NextResponse.json(receipt, { headers });
  } catch (error) {
    if (error instanceof InventorySyncConflict)
      return NextResponse.json(
        syncConflictSchema.parse({
          kind: "conflict",
          current: error.current,
          message: error.message,
        }),
        { status: 409, headers },
      );
    return inventoryErrorResponse({
      error,
      requestId,
      method: "POST",
      route: "/api/stores/[storeId]/offline/sync",
    });
  }
}

export async function GET(request: Request, route: Route) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await route.params;
    const context = await requireStoreContext(
      storeId,
      ["inventory.write"],
      request.headers,
    );
    const { identity } = await getOfflineAccess(context, request.headers);
    if (
      identity.sessionBinding !== request.headers.get("x-fleg-session-binding")
    )
      throw new StoreAccessDeniedError();
    const { businessDate } = inventoryWorkspaceQuerySchema.parse({
      businessDate: new URL(request.url).searchParams.get("businessDate"),
    });
    const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
    return NextResponse.json(
      {
        count: await new InventorySyncRepository(db, client).current(
          context,
          businessDate,
        ),
      },
      { headers },
    );
  } catch (error) {
    return inventoryErrorResponse({
      error,
      requestId,
      method: "GET",
      route: "/api/stores/[storeId]/offline/sync",
    });
  }
}
