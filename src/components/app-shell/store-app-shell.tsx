import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  Leaf,
  Network,
  Store,
} from "lucide-react";

import { StoreNavigation } from "@/components/app-shell/store-navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StoreAppShellProps {
  organizationSlug: string;
  storeId: string;
  canCompareStores: boolean;
  canUseAi: boolean;
  children: ReactNode;
}

export function StoreAppShell({
  organizationSlug,
  storeId,
  canCompareStores,
  canUseAi,
  children,
}: StoreAppShellProps) {
  const dashboardHref = `/${organizationSlug}/stores/${storeId}/dashboard`;

  return (
    <div className="min-h-svh bg-muted/35 pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={dashboardHref} className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-4">F&amp;L Cockpit</p>
              <p className="mt-1 text-xs text-muted-foreground">Tableau de bord</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
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
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-w-0 max-w-[15rem] justify-start",
              )}
            >
              <Store aria-hidden="true" />
              <span className="truncate">Magasin autorisé</span>
              <ChevronDown aria-hidden="true" className="ml-auto" />
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
        variant="mobile"
      />
    </div>
  );
}
