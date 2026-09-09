import type { Metadata } from "next";
import { headers } from "next/headers";
import { CloudSun } from "lucide-react";

import { BusinessContextManager } from "@/components/context-observations/business-context-manager";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { ProductRepository } from "@/server/repositories/product-repository";
import { getBusinessContextView } from "@/server/services/context-observation-service";

export const metadata: Metadata = {
  title: "Contexte commercial et météo — F&L Cockpit",
};

interface BusinessContextPageProps {
  params: Promise<{ storeId: string }>;
}

export default async function BusinessContextPage({
  params,
}: BusinessContextPageProps) {
  const [{ storeId }, requestHeaders] = await Promise.all([params, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["analytics.read"],
    requestHeaders,
  );
  const [initialView, products] = await Promise.all([
    getBusinessContextView(context, {}),
    new ProductRepository(await getAppDb()).listOptions(context),
  ]);

  return (
    <main className="mx-auto w-full max-w-[105rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <CloudSun aria-hidden="true" className="size-4" />
          Preuves contextuelles
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
          Contexte promotionnel et météo
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Consignez ce qui a réellement été observé par date. Une information
          absente reste inconnue et ces preuves ne modifient ni les ventes, ni
          les stocks, ni les prévisions.
        </p>
      </div>

      <BusinessContextManager
        canWrite={context.permissions.includes("context.write")}
        initialDate={new Date().toISOString().slice(0, 10)}
        initialView={initialView}
        products={products}
        storeId={storeId}
      />
    </main>
  );
}
