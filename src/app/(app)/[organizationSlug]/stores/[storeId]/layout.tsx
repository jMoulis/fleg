import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { StoreAppShell } from "@/components/app-shell/store-app-shell";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { requireStoreContext } from "@/server/auth/store-context";

interface StoreLayoutProps {
  children: ReactNode;
  params: Promise<{ organizationSlug: string; storeId: string }>;
}

export default async function StoreLayout({
  children,
  params,
}: StoreLayoutProps) {
  const { organizationSlug, storeId } = await params;
  let canCompareStores = false;
  let canUseAi = false;

  try {
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      await headers(),
    );
    canCompareStores =
      context.permissions.includes("analytics.read") &&
      context.permissions.includes("analytics.compare_stores");
    canUseAi =
      context.permissions.includes("analytics.read") &&
      context.permissions.includes("ai.use");
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/sign-in");
    }

    if (error instanceof StoreAccessDeniedError) {
      notFound();
    }

    throw error;
  }

  return (
    <StoreAppShell
      organizationSlug={organizationSlug}
      storeId={storeId}
      canCompareStores={canCompareStores}
      canUseAi={canUseAi}
    >
      {children}
    </StoreAppShell>
  );
}
