"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BoundedListPagination({
  ariaLabel,
  currentPage,
  itemLabel,
  onPageChange,
  pageSize,
  totalItems,
}: {
  ariaLabel: string;
  currentPage: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(currentPage, 1), pageCount);
  const firstItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground" role="status">
        {firstItem}–{lastItem} sur {totalItems} {itemLabel}
      </p>
      {pageCount > 1 ? (
        <nav aria-label={ariaLabel} className="flex items-center gap-2">
          <Button
            aria-label="Page précédente"
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span aria-current="page" className="text-xs tabular-nums">
            Page {safePage}/{pageCount}
          </span>
          <Button
            aria-label="Page suivante"
            disabled={safePage === pageCount}
            onClick={() => onPageChange(safePage + 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
