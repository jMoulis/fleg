import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, Leaf, ShieldCheck } from "lucide-react";

import { OrganizationOnboardingForm } from "@/components/admin/organization-onboarding-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { listManagedOrganizations } from "@/server/services/organization-admin-service";

export const metadata: Metadata = {
  title: "Nouvelle organisation — F&L Cockpit",
};

export default async function OnboardingPage() {
  let managedOrganizations;
  try {
    managedOrganizations = await listManagedOrganizations(await headers());
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    throw error;
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-svh bg-muted/35 px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <span className="font-semibold">F&amp;L Cockpit</span>
          </span>
          <Link href="/stores" className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft aria-hidden="true" /> Mes magasins
          </Link>
        </div>

        <div className="mt-10">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Onboarding multi-magasin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Créer un nouveau réseau
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Une organisation représente votre entreprise ou votre groupe. Les magasins resteront des périmètres métier distincts avec leurs propres accès.
          </p>
        </div>

        {managedOrganizations.length > 0 ? (
          <Card className="mt-7">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 aria-hidden="true" className="size-5 text-primary" />
                Organisations déjà administrées
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {managedOrganizations.map((organization) => (
                <Link
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 hover:bg-muted"
                  href={`/${organization.organizationSlug}/admin`}
                  key={organization.organizationId}
                >
                  <span className="font-medium">{organization.organizationName}</span>
                  <Badge variant="secondary">Administrer</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-7">
          <CardHeader>
            <CardTitle>Organisation et premier magasin</CardTitle>
          </CardHeader>
          <CardContent>
            <OrganizationOnboardingForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
