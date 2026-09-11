import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { businessDateAt } from "@/domain/offline/inventory-draft";
import { requireStoreContext } from "@/server/auth/store-context";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { getAppDb } from "@/server/db/mongo-client";
import { StoreRepository } from "@/server/repositories/store-repository";

export const metadata: Metadata = { title: "Stocks — F&L Cockpit" };

// The server entry authorizes the store; all counting uses the same static client entry.
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ businessDate?: string }>;
}) {
  const [{ storeId, organizationSlug }, query, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["inventory.read"],
    requestHeaders,
  );
  const store = await new StoreRepository(
    await getAppDb(),
  ).getOfflineReferenceMetadata(context);
  if (!store) throw new StoreAccessDeniedError();
  const today = businessDateAt(Date.now(), store.timeZone);
  const parsed = inventoryWorkspaceQuerySchema.safeParse({
    businessDate: query.businessDate ?? today,
  });
  const target = new URLSearchParams({
    storeId: context.storeId,
    businessDate: parsed.success ? parsed.data.businessDate : today,
    organizationSlug,
    open: "1",
  });
  redirect(`/offline?${target}`);
}
