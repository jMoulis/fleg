import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Leaf, Settings2, ShieldCheck } from "lucide-react";

import { OrganizationAdminPanel } from "@/components/admin/organization-admin-panel";
import { buttonVariants } from "@/components/ui/button";
import { OrganizationAdminAccessDeniedError } from "@/domain/admin/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireOrganizationAdminBySlug } from "@/server/auth/organization-admin-context";
import { getInvitationEmailConfigurationStatus } from "@/server/env";
import { getOrganizationAdminWorkspace } from "@/server/services/organization-admin-service";

export const metadata: Metadata = {
  title: "Administration — F&L Cockpit",
};

export default async function OrganizationAdminPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const [{ organizationSlug }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  let context;
  try {
    context = await requireOrganizationAdminBySlug(
      organizationSlug,
      requestHeaders,
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof OrganizationAdminAccessDeniedError) notFound();
    throw error;
  }
  const workspace = await getOrganizationAdminWorkspace({
    context,
    requestHeaders,
  });
  const invitationEmailConfigured =
    getInvitationEmailConfigurationStatus().configured;
  const firstStore = workspace.stores.find(({ active }) => active);

  return (
    <div className="min-h-svh bg-muted/35">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/stores" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">F&amp;L Cockpit</span>
              <span className="block text-xs text-muted-foreground">Administration</span>
            </span>
          </Link>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={
              firstStore
                ? `/${organizationSlug}/stores/${firstStore.id}/dashboard`
                : "/stores"
            }
          >
            <ArrowLeft aria-hidden="true" /> Retour au cockpit
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8 max-w-3xl">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Propriétaire ou administrateur vérifié côté serveur
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-[-0.035em]">
            <Settings2 aria-hidden="true" className="size-7 text-primary" />
            {workspace.organization.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Créez les magasins, invitez les membres et attribuez uniquement les permissions nécessaires à chaque périmètre.
          </p>
        </div>
        <OrganizationAdminPanel
          invitationEmailConfigured={invitationEmailConfigured}
          workspace={workspace}
        />
      </main>
    </div>
  );
}
