import type { Metadata } from "next";
import { headers } from "next/headers";
import { BookOpenCheck, CircleHelp } from "lucide-react";

import { UserGuideBrowser } from "@/components/help/user-guide-browser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { userGuideSections } from "@/domain/help/user-guide";
import { requireStoreContext } from "@/server/auth/store-context";

export const metadata: Metadata = {
  title: "Aide et guide utilisateur — F&L Cockpit",
};

export default async function StoreHelpPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  await requireStoreContext(storeId, ["stores.read"], requestHeaders);
  const baseHref = `/${organizationSlug}/stores/${storeId}/help`;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <CircleHelp aria-hidden="true" className="size-4" />
        Aide métier intégrée
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
        Aide et guide utilisateur
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Retrouvez les parcours du rayon, la définition des indices et les
        premières vérifications en cas de problème. Commencez par le chapitre
        qui correspond à votre tâche du moment.
      </p>

      <Alert className="mt-6 max-w-3xl">
        <BookOpenCheck aria-hidden="true" />
        <AlertTitle>Trois repères essentiels</AlertTitle>
        <AlertDescription>
          Un champ vide reste inconnu, un calcul reste distinct d’un fait
          observé, et une proposition n’est jamais exécutée automatiquement.
        </AlertDescription>
      </Alert>

      <UserGuideBrowser
        baseHref={baseHref}
        sections={userGuideSections}
      />
    </main>
  );
}
