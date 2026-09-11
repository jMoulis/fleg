import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  CircleHelp,
  Network,
  Settings2,
  SlidersHorizontal,
  Store,
} from "lucide-react";

import { StoreNavigation } from "@/components/app-shell/store-navigation";
import { AppBrand } from "@/components/app-shell/app-brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StoreAppShellProps {
  organizationSlug: string;
  storeId: string;
  canCompareStores: boolean;
  canManageOrganization: boolean;
  canReadInventory: boolean;
  canUseAi: boolean;
  children: ReactNode;
}

export function StoreAppShell({
  organizationSlug,
  storeId,
  canCompareStores,
  canManageOrganization,
  canReadInventory,
  canUseAi,
  children,
}: StoreAppShellProps) {
  const dashboardHref = `/${organizationSlug}/stores/${storeId}/dashboard`;

  return (
    <div className="min-h-svh overflow-x-clip bg-muted/35 pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={dashboardHref} className="flex items-center gap-3">
            <AppBrand subtitle="Tableau de bord" />
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/${organizationSlug}/stores/${storeId}/help`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "shrink-0 md:hidden",
              )}
              aria-label="Ouvrir l’aide et le guide utilisateur"
            >
              <CircleHelp aria-hidden="true" />
            </Link>
            <Link
              href={`/${organizationSlug}/stores/${storeId}/settings`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "shrink-0 md:hidden",
              )}
              aria-label="Ouvrir les paramètres du magasin"
            >
              <SlidersHorizontal aria-hidden="true" />
            </Link>
            {canManageOrganization ? (
              <Link
                href={`/${organizationSlug}/admin`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "shrink-0",
                )}
                aria-label="Administrer l’organisation"
              >
                <Settings2 aria-hidden="true" />
              </Link>
            ) : null}
            {canUseAi ? (
              <Link
                href={`/${organizationSlug}/stores/${storeId}/copilot`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "md:hidden",
                )}
                aria-label="Ouvrir le Copilote analytique"
              >
                <Bot aria-hidden="true" />
              </Link>
            ) : null}
            {canCompareStores ? (
              <Link
                href={`/${organizationSlug}/network`}
                className={buttonVariants({ variant: "ghost" })}
                aria-label="Ouvrir la vue réseau"
              >
                <Network aria-hidden="true" />
                <span className="hidden sm:inline">Réseau</span>
              </Link>
            ) : null}
            <Link
              href="/stores"
              aria-label="Magasin autorisé"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-w-0 max-w-[15rem] justify-start max-sm:size-9 max-sm:px-0",
              )}
            >
              <Store aria-hidden="true" />
              <span className="truncate max-sm:hidden">Magasin autorisé</span>
              <ChevronDown
                aria-hidden="true"
                className="ml-auto max-sm:hidden"
              />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[100rem]">
        <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-56 shrink-0 border-r bg-background p-4 md:block">
          <StoreNavigation
            organizationSlug={organizationSlug}
            storeId={storeId}
            canUseAi={canUseAi}
            canReadInventory={canReadInventory}
            variant="desktop"
          />
        </aside>
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </div>
      </div>

      <StoreNavigation
        organizationSlug={organizationSlug}
        storeId={storeId}
        canUseAi={canUseAi}
        canReadInventory={canReadInventory}
        variant="mobile"
      />
    </div>
  );
}
