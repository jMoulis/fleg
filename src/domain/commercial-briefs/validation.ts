import { z } from "zod";
import {
  briefExtractionSchema,
  briefPagesSchema,
  type BriefExtraction,
  type BriefField,
  type BriefPages,
} from "./schemas";

const dates = new Set([
  "coverage_start",
  "coverage_end",
  "sale_start",
  "sale_end",
  "delivery_start",
  "delivery_end",
  "order_deadline",
]);
const prices = new Set(["purchase_price_cents", "selling_price_cents"]);
const normalize = (text: string) =>
  text.normalize("NFC").replace(/\s+/g, " ").trim();

export function displayBriefValue(
  field: Pick<BriefField, "key" | "value">,
): string {
  if (field.value === null) return "";
  if (prices.has(field.key) && typeof field.value === "number")
    return (field.value / 100).toFixed(2).replace(".", ",");
  if (field.key === "margin_ratio" && typeof field.value === "number")
    return String(Math.round(field.value * 1_000_000) / 10_000).replace(
      ".",
      ",",
    );
  return String(field.value);
}
export function parseBriefEditedValue(
  key: BriefField["key"],
  raw: string,
): BriefField["value"] {
  const value = raw.trim();
  if (!value) return null;
  if (prices.has(key)) {
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error("Prix invalide");
    const [whole, decimals = ""] = value.replace(",", ".").split(".");
    return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  }
  if (key === "margin_ratio") {
    if (!/^-?\d+(?:[.,]\d{1,4})?$/.test(value))
      throw new Error("Pourcentage invalide");
    return Number(value.replace(",", ".")) / 100;
  }
  return value;
}

export function validateBriefValues(
  fields: Pick<BriefField, "key" | "value">[],
) {
  if (new Set(fields.map((f) => f.key)).size !== fields.length)
    throw new Error("Champs répétés");
  for (const field of fields) {
    if (field.value === null) continue; // Unknown never becomes zero.
    if (prices.has(field.key))
      z.number().int().min(0).max(100_000_000).parse(field.value);
    else if (field.key === "margin_ratio")
      z.number().min(-10).max(1).parse(field.value);
    else if (dates.has(field.key)) z.iso.date().parse(field.value);
    else if (field.key === "price_qualifier")
      z.enum(["exact", "starting_from", "less_than", "maximum"]).parse(
        field.value,
      );
    else if (field.key === "plu")
      z.string()
        .regex(/^\d{3,8}$/)
        .parse(field.value);
    else if (field.key === "ean")
      z.string()
        .regex(/^(\d{8}|\d{12,14})$/)
        .parse(field.value);
    else z.string().min(1).max(500).parse(field.value);
  }
  const get = (key: BriefField["key"]) =>
    fields.find((f) => f.key === key)?.value;
  for (const [start, end] of [
    ["sale_start", "sale_end"],
    ["delivery_start", "delivery_end"],
    ["coverage_start", "coverage_end"],
  ] as const) {
    const a = get(start),
      b = get(end);
    if (typeof a === "string" && typeof b === "string" && a > b)
      throw new Error("Dates contradictoires");
  }
  if (typeof get("selling_price_cents") === "number" && !get("price_qualifier"))
    throw new Error("Nature du prix manquante");
  return fields;
}

export function validateBriefExtraction(
  raw: unknown,
  rawPages: BriefPages,
): BriefExtraction {
  const pages = briefPagesSchema.parse(rawPages);
  const result = briefExtractionSchema.parse(raw);
  if (new TextEncoder().encode(JSON.stringify(result)).length > 120_000)
    throw new Error("Résultat hors budget de stockage");
  for (const section of result.sections) {
    validateBriefValues(section.fields);
    for (const evidence of [
      section.evidence,
      ...section.fields.map((f) => f.evidence),
    ]) {
      const page = pages.find((p) => p.page === evidence.page);
      const quote = normalize(evidence.excerpt);
      if (!page || !quote || !normalize(page.text).includes(quote))
        throw new Error("Preuve absente de la page source");
    }
  }
  return result;
}
