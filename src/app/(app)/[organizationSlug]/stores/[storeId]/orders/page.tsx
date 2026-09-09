import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShoppingBasket } from "lucide-react";

import { OrderSuggestionManager } from "@/components/ordering/order-suggestion-manager";
import { orderSuggestionWorkspaceQuerySchema } from "@/domain/ordering/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { getOrderSuggestionWorkspace } from "@/server/services/order-suggestion-service";

export const metadata: Metadata = {
  title: "Commande — F&L Cockpit",
};

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ orderDate?: string }>;
}) {
  const [{ organizationSlug, storeId }, query, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const parsedQuery = orderSuggestionWorkspaceQuerySchema.safeParse({
    orderDate: query.orderDate ?? new Date().toISOString().slice(0, 10),
  });
  const orderDate = parsedQuery.success
    ? parsedQuery.data.orderDate
    : new Date().toISOString().slice(0, 10);
  const context = await requireStoreContext(
    storeId,
    ["analytics.read", "inventory.read"],
    requestHeaders,
  );
  const workspace = await getOrderSuggestionWorkspace({ context, orderDate });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <ShoppingBasket aria-hidden="true" className="size-4" />
        Flux tendu et fraîcheur
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
        Commande du matin
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Préparez une quantité destinée à partir sur les jours couverts, après
        le tri et le comptage. Le stock final cible reste nul par défaut pour
        limiter la casse et préserver la fraîcheur.
      </p>

      <OrderSuggestionManager
        canApprove={context.permissions.includes("recommendations.approve")}
        initialWorkspace={workspace}
        key={orderDate}
        organizationSlug={organizationSlug}
        storeId={storeId}
      />
    </main>
  );
}
