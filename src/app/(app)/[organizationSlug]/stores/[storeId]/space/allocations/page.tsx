import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MonitorCog } from "lucide-react";
import * as z from "zod";

import { AllocationPlanner } from "@/components/space/allocation-planner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAllocationWorkspace } from "@/server/services/allocation-service";

export const metadata: Metadata = {
  title: "Allocations — F&L Cockpit",
};

interface AllocationPageProps {
  params: Promise<{ organizationSlug: string; storeId: string }>;
  searchParams: Promise<{ savedPlanVersion?: string }>;
}

export default async function AllocationPage({
  params,
  searchParams,
}: AllocationPageProps) {
  const [{ organizationSlug, storeId }, query, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const savedPlanVersion = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(query.savedPlanVersion);
  const context = await requireStoreContext(
    storeId,
    ["stores.read", "analytics.read"],
    requestHeaders,
  );
  const workspace = await getAllocationWorkspace(context);
  const spaceHref = `/${organizationSlug}/stores/${storeId}/space`;

  if (!workspace.layout) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link className={buttonVariants({ variant: "ghost" })} href={spaceHref}>
          <ArrowLeft aria-hidden="true" />
          Retour à Espace
        </Link>
        <Card className="mt-8">
          <CardContent className="py-14 text-center">
            <h1 className="text-2xl font-semibold">Aucun plan à allouer</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Créez d’abord une version du plan magasin.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            href={spaceHref}
          >
            <ArrowLeft aria-hidden="true" />
            Retour à Espace
          </Link>
          <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
            <MonitorCog aria-hidden="true" className="size-4" />
            Planificateur desktop
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Allocation de l’espace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {workspace.layout.name} · plan {workspace.layout.version}
            {workspace.plan ? ` · allocation ${workspace.plan.version}` : " · aucune allocation enregistrée"}
          </p>
        </div>
        <Badge className="w-fit" variant="secondary">
          Brouillon manager
        </Badge>
      </div>

      {savedPlanVersion.success ? (
        <Alert className="mt-6 border-primary/25 bg-primary/[0.04]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>
            Allocation {savedPlanVersion.data} enregistrée
          </AlertTitle>
          <AlertDescription>
            La version précédente reste conservée dans l’historique.
          </AlertDescription>
        </Alert>
      ) : null}

      {workspace.products.length === 0 ? (
        <Alert className="mt-6">
          <AlertTitle>Aucun produit disponible</AlertTitle>
          <AlertDescription>
            Importez une période Mercalys avant de préparer une allocation.
          </AlertDescription>
        </Alert>
      ) : null}

      <AllocationPlanner
        basis={workspace.basis}
        canWrite={context.permissions.includes("allocations.write")}
        capacities={workspace.capacities}
        initialPlan={workspace.plan}
        layoutVersion={workspace.layout.version}
        layoutVersionId={workspace.layout.id}
        products={workspace.products}
        storeId={storeId}
      />
    </main>
  );
}
