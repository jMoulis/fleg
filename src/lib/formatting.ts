const euroFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const quantityFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});

export function formatMoney(cents: number | null): string {
  return cents === null ? "—" : euroFormatter.format(cents / 100);
}

export function formatRatio(ratio: number | null): string {
  return ratio === null ? "—" : percentFormatter.format(ratio);
}

export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity);
}
