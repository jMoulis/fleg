"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Boxes,
  CalendarRange,
  CircleGauge,
  CloudSun,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  FlaskConical,
  PackageX,
  Warehouse,
  Ruler,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface StoreNavigationProps {
  organizationSlug: string;
  storeId: string;
  canUseAi: boolean;
  canReadInventory: boolean;
  variant: "desktop" | "mobile";
}

const navigation = [
  { label: "Accueil", segment: "dashboard", icon: CircleGauge },
  { label: "Actions", segment: "actions", icon: ClipboardCheck },
  { label: "Produits", segment: "products", icon: Boxes },
  {
    label: "Stocks",
    segment: "inventory",
    icon: Warehouse,
    requiresInventory: true,
  },
  { label: "Espace", segment: "space", icon: Ruler },
  { label: "Contexte", segment: "context", icon: CloudSun },
  { label: "TG", segment: "tg", icon: CalendarRange },
  { label: "Tests", segment: "experiments", icon: FlaskConical },
  { label: "Démarque", segment: "markdown", icon: PackageX },
  { label: "Imports", segment: "imports", icon: FileSpreadsheet },
  { label: "Décisions", segment: "decisions", icon: History, desktopOnly: true },
  {
    label: "Paramètres",
    segment: "settings",
    icon: SlidersHorizontal,
    desktopOnly: true,
  },
  {
    label: "Copilote",
    segment: "copilot",
    icon: Bot,
    desktopOnly: true,
    requiresAi: true,
  },
] as const;

export function StoreNavigation({
  organizationSlug,
  storeId,
  canUseAi,
  canReadInventory,
  variant,
}: StoreNavigationProps) {
  const pathname = usePathname();
  const base = `/${organizationSlug}/stores/${storeId}`;

  if (variant === "mobile") {
    return (
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-50 isolate flex w-full max-w-[100vw] overflow-x-auto border-t bg-background px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
      >
        {navigation
          .filter(
            (item) =>
              !("desktopOnly" in item && item.desktopOnly) &&
              !("requiresInventory" in item &&
                item.requiresInventory &&
                !canReadInventory) &&
              !("requiresAi" in item && item.requiresAi && !canUseAi),
          )
          .map(({ label, segment, icon: Icon }) => {
            const href = `${base}/${segment}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={segment}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[0.6rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </Link>
            );
          })}
      </nav>
    );
  }

  return (
    <nav aria-label="Navigation principale" className="space-y-1">
      {navigation
        .filter(
          (item) =>
            !("requiresInventory" in item &&
              item.requiresInventory &&
              !canReadInventory) &&
            !("requiresAi" in item && item.requiresAi && !canUseAi),
        )
        .map(({ label, segment, icon: Icon }) => {
          const href = `${base}/${segment}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}
