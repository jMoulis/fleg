"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BoundedListPagination } from "@/components/ui/bounded-list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface BoundedOptionPickerOption {
  id: string;
  label: string;
  description?: string;
}

export function BoundedOptionPicker({
  actionLabel = "Sélectionner",
  collapseOnSelect = true,
  disabled = false,
  emptyMessage = "Aucun résultat ne correspond à cette recherche.",
  id,
  itemLabel,
  label,
  onClear,
  onSelect,
  options,
  pageSize = 10,
  placeholder = "Rechercher…",
  selectedId,
  testIdPrefix,
}: {
  actionLabel?: string;
  collapseOnSelect?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  id: string;
  itemLabel: string;
  label: string;
  onClear?: () => void;
  onSelect: (optionId: string) => void;
  options: BoundedOptionPickerOption[];
  pageSize?: number;
  placeholder?: string;
  selectedId: string;
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(!selectedId);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const filteredOptions = useMemo(
    () =>
      options
        .filter((option) => {
          if (!normalizedSearch) return true;
          return [option.label, option.description]
            .filter((value): value is string => Boolean(value))
            .some((value) =>
              value.toLocaleLowerCase("fr-FR").includes(normalizedSearch),
            );
        })
        .sort((first, second) => first.label.localeCompare(second.label, "fr")),
    [normalizedSearch, options],
  );
  const pageCount = Math.max(1, Math.ceil(filteredOptions.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleOptions = filteredOptions.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const selectedOption = optionById.get(selectedId);

  if (!open && selectedOption) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate">{selectedOption.label}</span>
              {selectedOption.description ? (
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                  {selectedOption.description}
                </span>
              ) : null}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {onClear ? (
              <Button
                disabled={disabled}
                onClick={() => {
                  onClear();
                  setOpen(true);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Délier
              </Button>
            ) : null}
            <Button
              disabled={disabled}
              onClick={() => setOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Changer
            </Button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-search`}>{label}</Label>
          {selectedOption ? (
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
            placeholder={placeholder}
            value={search}
          />
        </div>
      </div>

      <BoundedListPagination
        ariaLabel={`Pagination — ${label}`}
        currentPage={safePage}
        itemLabel={itemLabel}
        onPageChange={setPage}
        pageSize={pageSize}
        totalItems={filteredOptions.length}
      />

      <div
        className="max-h-64 divide-y overflow-y-auto rounded-lg border"
        data-bounded-picker-page-size={pageSize}
        {...(testIdPrefix
          ? { [`data-${testIdPrefix}-page-size`]: pageSize }
          : {})}
      >
        {visibleOptions.map((option) => {
          const selected = option.id === selectedId;
          return (
            <button
              aria-label={`${actionLabel} ${option.label}`}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                selected && "bg-primary/10 text-primary",
              )}
              data-bounded-picker-option
              {...(testIdPrefix
                ? { [`data-${testIdPrefix}-option`]: true }
                : {})}
              disabled={disabled}
              key={option.id}
              onClick={() => {
                onSelect(option.id);
                setSearch("");
                setPage(1);
                if (collapseOnSelect) setOpen(false);
              }}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <Check aria-hidden="true" className="shrink-0" />
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {actionLabel}
                </span>
              )}
            </button>
          );
        })}
        {visibleOptions.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
