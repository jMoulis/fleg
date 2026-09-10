import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ListPagination({
  ariaLabel,
  currentPage,
  itemLabel,
  nextHref,
  pageSize,
  previousHref,
  totalItems,
  totalPages,
}: {
  ariaLabel: string;
  currentPage: number;
  itemLabel: string;
  nextHref: string | null;
  pageSize: number;
  previousHref: string | null;
  totalItems: number;
  totalPages: number;
}) {
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" role="status">
        {firstItem}–{lastItem} sur {totalItems} {itemLabel}
      </p>
      {totalPages > 1 ? (
        <nav aria-label={ariaLabel} className="flex items-center gap-2">
          {previousHref ? (
            <Link
              aria-label="Page précédente"
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={previousHref}
            >
              <ChevronLeft aria-hidden="true" />
              <span className="hidden sm:inline">Précédente</span>
            </Link>
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "opacity-50",
              )}
            >
              <ChevronLeft />
              <span className="hidden sm:inline">Précédente</span>
            </span>
          )}
          <span aria-current="page" className="text-sm tabular-nums">
            Page {currentPage}/{totalPages}
          </span>
          {nextHref ? (
            <Link
              aria-label="Page suivante"
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={nextHref}
            >
              <span className="hidden sm:inline">Suivante</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "opacity-50",
              )}
            >
              <span className="hidden sm:inline">Suivante</span>
              <ChevronRight />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
