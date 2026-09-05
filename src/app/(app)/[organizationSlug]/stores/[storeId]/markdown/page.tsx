import type { Metadata } from "next";
import { headers } from "next/headers";
import { PackageX } from "lucide-react";

import { MarkdownManager } from "@/components/markdown/markdown-manager";
import { requireStoreContext } from "@/server/auth/store-context";
import { ProductRepository } from "@/server/repositories/product-repository";
import { getAppDb } from "@/server/db/mongo-client";
import { listMarkdown } from "@/server/services/markdown-service";

export const metadata: Metadata = {
  title: "Démarque — F&L Cockpit",
};

interface MarkdownPageProps {
  params: Promise<{ storeId: string }>;
}

export default async function MarkdownPage({ params }: MarkdownPageProps) {
  const [{ storeId }, requestHeaders] = await Promise.all([params, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["analytics.read"],
    requestHeaders,
  );
  const db = await getAppDb();
  const [initialMarkdown, products] = await Promise.all([
    listMarkdown({ context, query: {} }),
    new ProductRepository(db).listOptions(context),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <PackageX aria-hidden="true" className="size-4" />
          Pertes et réductions
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
          Démarque
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Consignez les pertes par produit sans modifier les ventes ni la marge
          théorique importées.
        </p>
      </div>

      <MarkdownManager
        canWrite={context.permissions.includes("markdown.write")}
        initialDate={new Date().toISOString().slice(0, 10)}
        initialMarkdown={initialMarkdown}
        products={products}
        storeId={storeId}
      />
    </main>
  );
}
