import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { PhotoAttachmentManager } from "@/components/attachments/photo-attachment-manager";
import { TgPlanner } from "@/components/commercial-events/tg-planner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStoreContext } from "@/server/auth/store-context";
import { listPhotoAttachments } from "@/server/services/attachment-service";
import { getCommercialEventWorkspace } from "@/server/services/commercial-event-service";

export const metadata: Metadata = {
  title: "Planning TG — F&L Cockpit",
};

interface TgPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

export default async function TgPage({ params }: TgPageProps) {
  const [{ organizationSlug, storeId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const context = await requireStoreContext(
    storeId,
    ["stores.read"],
    requestHeaders,
  );
  const [workspace, attachments] = await Promise.all([
    getCommercialEventWorkspace(context),
    listPhotoAttachments({ context, targetTypes: ["commercial_event"] }),
  ]);
  const spaceHref = `/${organizationSlug}/stores/${storeId}/space`;

  return (
    <main className="mx-auto w-full max-w-[105rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CalendarDays aria-hidden="true" className="size-4" />
            Animation commerciale
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Planning des têtes de gondole
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Planifiez les thèmes, produits et objectifs de chaque TG, puis
            saisissez les résultats une fois l’opération terminée.
          </p>
        </div>
      </div>

      {!workspace.layout ? (
        <Card className="mt-8">
          <CardContent className="py-14 text-center">
            <h2 className="text-2xl font-semibold">Aucun plan magasin</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Créez d’abord le plan qui définit les têtes de gondole.
            </p>
            <Link className={buttonVariants({ className: "mt-5" })} href={spaceHref}>
              Configurer l’espace
            </Link>
          </CardContent>
        </Card>
      ) : workspace.endcaps.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-14 text-center">
            <h2 className="text-2xl font-semibold">Aucune tête de gondole</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajoutez au moins une TG dans le plan courant avant de planifier.
            </p>
            <Link className={buttonVariants({ className: "mt-5" })} href={`${spaceHref}/edit`}>
              Modifier le plan
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {workspace.products.length === 0 ? (
            <Alert className="mt-6">
              <AlertTitle>Aucun produit disponible</AlertTitle>
              <AlertDescription>
                Importez une période Mercalys avant de créer une opération.
              </AlertDescription>
            </Alert>
          ) : null}
          <TgPlanner
            canPublish={context.permissions.includes("tg.publish")}
            endcaps={workspace.endcaps}
            initialEvents={workspace.events}
            layoutVersionId={workspace.layout.id}
            products={workspace.products}
            storeId={storeId}
          />
        </>
      )}

      <section className="mt-8" aria-label="Photos des opérations commerciales">
        <PhotoAttachmentManager
          canWrite={context.permissions.includes("attachments.write")}
          description="Rattachez les photos terrain à une opération existante pour conserver le contexte observé avant, pendant ou après sa diffusion."
          initialAttachments={attachments}
          storeId={storeId}
          targets={workspace.events.map((event) => ({
            label: `${event.title} · ${event.fixtureName}`,
            description: `${event.startsOn} → ${event.endsOn} · ${event.status}`,
            target: { type: "commercial_event", eventId: event.id },
          }))}
          title="Photos des opérations"
        />
      </section>
    </main>
  );
}
