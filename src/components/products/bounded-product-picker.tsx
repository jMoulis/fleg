import { BoundedOptionPicker } from "@/components/ui/bounded-option-picker";
import type { ProductOption } from "@/domain/products/schemas";

export function BoundedProductPicker({
  actionLabel = "Sélectionner",
  collapseOnSelect = true,
  disabled = false,
  id,
  label,
  onSelect,
  products,
  selectedProductId,
}: {
  actionLabel?: string;
  collapseOnSelect?: boolean;
  disabled?: boolean;
  id: string;
  label: string;
  onSelect: (productId: string) => void;
  products: ProductOption[];
  selectedProductId: string;
}) {
  return (
    <BoundedOptionPicker
      actionLabel={actionLabel}
      collapseOnSelect={collapseOnSelect}
      disabled={disabled}
      emptyMessage="Aucun produit ne correspond à cette recherche."
      id={id}
      itemLabel="produit(s)"
      label={label}
      onSelect={onSelect}
      options={products}
      placeholder="Rechercher par nom…"
      selectedId={selectedProductId}
      testIdPrefix="product-picker"
    />
  );
}
