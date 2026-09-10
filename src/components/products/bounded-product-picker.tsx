"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BoundedListPagination } from "@/components/ui/bounded-list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductOption } from "@/domain/products/schemas";
import { cn } from "@/lib/utils";

const defaultPageSize = 10;

export function BoundedProductPicker({
  disabled = false,
  id,
  label,
  onSelect,
  products,
  selectedProductId,
}: {
  disabled?: boolean;
  id: string;
  label: string;
  onSelect: (productId: string) => void;
  products: ProductOption[];
  selectedProductId: string;
}) {
  const [open, setOpen] = useState(!selectedProductId);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const filteredProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            !normalizedSearch ||
            product.label
              .toLocaleLowerCase("fr-FR")
              .includes(normalizedSearch),
        )
        .sort((first, second) => first.label.localeCompare(second.label, "fr")),
    [normalizedSearch, products],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredProducts.length / defaultPageSize),
  );
  const safePage = Math.min(page, pageCount);
  const visibleProducts = filteredProducts.slice(
    (safePage - 1) * defaultPageSize,
    safePage * defaultPageSize,
  );
  const selectedProduct = productById.get(selectedProductId);

  if (!open && selectedProduct) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate">{selectedProduct.label}</span>
          </span>
          <Button
            disabled={disabled}
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Changer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-search`}>{label}</Label>
          {selectedProduct ? (
            <Button
              onClick={() => setOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoComplete="off"
            className="pl-9"
            disabled={disabled}
            id={`${id}-search`}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par nom…"
            value={search}
          />
        </div>
      </div>

      <BoundedListPagination
        ariaLabel={`Pagination — ${label}`}
        currentPage={safePage}
        itemLabel="produit(s)"
        onPageChange={setPage}
        pageSize={defaultPageSize}
        totalItems={filteredProducts.length}
      />

      <div
        className="max-h-64 divide-y overflow-y-auto rounded-lg border"
        data-product-picker-page-size={defaultPageSize}
      >
        {visibleProducts.map((product) => {
          const selected = product.id === selectedProductId;
          return (
            <button
              aria-label={`Sélectionner ${product.label}`}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                selected && "bg-primary/10 text-primary",
              )}
              data-product-picker-option
              disabled={disabled}
              key={product.id}
              onClick={() => {
                onSelect(product.id);
                setSearch("");
                setPage(1);
                setOpen(false);
              }}
              type="button"
            >
              <span className="min-w-0 truncate font-medium">
                {product.label}
              </span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
        {visibleProducts.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Aucun produit ne correspond à cette recherche.
          </p>
        ) : null}
      </div>
    </div>
  );
}
