import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShieldCheck, SlidersHorizontal } from "lucide-react";

import { PhotoAttachmentManager } from "@/components/attachments/photo-attachment-manager";
import { StoreConfigurationManager } from "@/components/configuration/store-configuration-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireStoreContext } from "@/server/auth/store-context";
import { listPhotoAttachments } from "@/server/services/attachment-service";
import { getStoreConfigurationWorkspace } from "@/server/services/store-configuration-service";

export const metadata: Metadata = {
  title: "Paramètres magasin — F&L Cockpit",
};

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}) {
  const [{ storeId }, requestHeaders] = await Promise.all([params, headers()]);
  const context = await requireStoreContext(
    storeId,
    ["stores.read", "analytics.read"],
    requestHeaders,
  );
  const [workspace, attachments] = await Promise.all([
    getStoreConfigurationWorkspace(context),
    listPhotoAttachments({ context, targetTypes: ["store"] }),
  ]);
  const canEditSettings = context.permissions.includes("settings.write");
  const canEditTargets = context.permissions.includes("targets.write");
  const canWriteAttachments = context.permissions.includes("attachments.write");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <ShieldCheck aria-hidden="true" className="size-4" />
        Configuration du magasin autorisé
      </p>
      <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-[-0.035em]">
        <SlidersHorizontal aria-hidden="true" className="size-7 text-primary" />
        Paramètres magasin
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        Ajustez les objectifs et hypothèses de calcul. Chaque modification est versionnée et auditée ; les valeurs par défaut restent explicites.
      </p>

      {!canEditSettings && !canEditTargets ? (
        <Alert className="mt-6">
          <AlertTitle>Consultation uniquement</AlertTitle>
          <AlertDescription>
            Votre rôle permet de consulter les paramètres, mais pas de les modifier.
          </AlertDescription>
        </Alert>
      ) : null}

      <StoreConfigurationManager
        canEditSettings={canEditSettings}
        canEditTargets={canEditTargets}
        initialWorkspace={workspace}
        storeId={storeId}
      />

      <section className="mt-8" aria-label="Photos du magasin">
        <PhotoAttachmentManager
          canWrite={canWriteAttachments}
          description="Conservez des vues générales du magasin comme observations datées, sans modifier les données d’implantation."
          initialAttachments={attachments}
          storeId={storeId}
          targets={[
            {
              label: "Magasin",
              description: "Vue générale rattachée au magasin autorisé.",
              target: { type: "store" },
            },
          ]}
          title="Photos du magasin"
        />
      </section>
    </main>
  );
}
