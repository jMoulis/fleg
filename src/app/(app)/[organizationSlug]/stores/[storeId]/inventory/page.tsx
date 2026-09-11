import type { Metadata } from "next";
import { headers } from "next/headers";
import { Warehouse } from "lucide-react";

import { InventoryCountManager } from "@/components/inventory/inventory-count-manager";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { getInventoryWorkspace } from "@/server/services/inventory-service";

export const metadata: Metadata = {
  title: "Stocks — F&L Cockpit",
};

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ businessDate?: string }>;
}) {
  const [{ storeId }, query, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const parsedQuery = inventoryWorkspaceQuerySchema.safeParse({
    businessDate:
      query.businessDate ?? new Date().toISOString().slice(0, 10),
  });
  const businessDate = parsedQuery.success
    ? parsedQuery.data.businessDate
    : new Date().toISOString().slice(0, 10);
  const context = await requireStoreContext(
    storeId,
    ["inventory.read"],
    requestHeaders,
  );
  const workspace = await getInventoryWorkspace({ context, businessDate });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Warehouse aria-hidden="true" className="size-4" />
        Relevé opérationnel
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
        Stocks du matin
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Comptez les colis en réserve, puis ajoutez le reste présent en rayon.
        Le colisage utilisé est conservé avec chaque relevé, même s’il change à
        la commande suivante.
      </p>

      <aside className="mt-6 rounded-xl border p-4 text-sm">
        <a className="font-semibold text-primary underline" href={`/offline?storeId=${storeId}&businessDate=${businessDate}`}>
          Préparer la consultation hors connexion
        </a>
        <p className="mt-2 text-muted-foreground">Téléchargez le catalogue complet avant de perdre le réseau. Lecture seule pour le moment ; la saisie des stocks reste connectée.</p>
      </aside>
      <InventoryCountManager
        canWrite={context.permissions.includes("inventory.write")}
        initialWorkspace={workspace}
        key={businessDate}
        storeId={storeId}
      />
    </main>
  );
}
