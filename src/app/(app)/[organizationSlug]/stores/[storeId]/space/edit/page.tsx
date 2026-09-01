import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LayoutEditor } from "@/components/space/layout-editor";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { getCurrentStoreLayout } from "@/server/services/layout-service";

export const metadata: Metadata = {
  title: "Modifier le plan — F&L Cockpit",
};

interface EditStoreSpacePageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

export default async function EditStoreSpacePage({
  params,
}: EditStoreSpacePageProps) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  let context: AuthorizedStoreContext;

  try {
    context = await requireStoreContext(
      storeId,
      ["layouts.write"],
      requestHeaders,
    );
  } catch (error) {
    if (error instanceof StoreAccessDeniedError) {
      notFound();
    }

    throw error;
  }

  const { layout } = await getCurrentStoreLayout(context);

  if (!layout) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardContent className="py-12 text-center">
            <h1 className="text-xl font-semibold">Aucun plan à modifier</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Initialisez d’abord une version de référence pour ce magasin.
            </p>
            <Link
              className={`${buttonVariants({ variant: "outline" })} mt-5`}
              href={`/${organizationSlug}/stores/${storeId}/space`}
            >
              Retour à Espace
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <LayoutEditor
        layout={layout}
        organizationSlug={organizationSlug}
        storeId={storeId}
      />
    </main>
  );
}
