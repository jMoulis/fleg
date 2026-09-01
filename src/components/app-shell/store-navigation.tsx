"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CircleGauge,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface StoreNavigationProps {
  organizationSlug: string;
  storeId: string;
  variant: "desktop" | "mobile";
}

const navigation = [
  { label: "Accueil", segment: "dashboard", icon: CircleGauge },
  { label: "Actions", segment: "actions", icon: ClipboardCheck },
  { label: "Produits", segment: "products", icon: Boxes },
  { label: "Imports", segment: "imports", icon: FileSpreadsheet },
  { label: "Décisions", segment: "decisions", icon: History, desktopOnly: true },
] as const;

export function StoreNavigation({
  organizationSlug,
  storeId,
  variant,
}: StoreNavigationProps) {
  const pathname = usePathname();
  const base = `/${organizationSlug}/stores/${storeId}`;

  if (variant === "mobile") {
    return (
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
      >
        {navigation
          .filter((item) => !("desktopOnly" in item && item.desktopOnly))
          .map(({ label, segment, icon: Icon }) => {
          const href = `${base}/${segment}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.7rem] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          );
          })}
        <span className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.7rem] font-medium text-muted-foreground">
          <MoreHorizontal aria-hidden="true" className="size-5" />
          Plus
        </span>
      </nav>
    );
  }

  return (
    <nav aria-label="Navigation principale" className="space-y-1">
      {navigation.map(({ label, segment, icon: Icon }) => {
        const href = `${base}/${segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
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
