import type { BriefExtraction } from "@/domain/commercial-briefs/schemas";
export const briefTestPages = [
  {
    page: 1,
    text: "Promotion poires. Vente du 14 au 20 septembre 2026. Livraison le 13 septembre 2026. Commande avant le 12 septembre 2026. PLU 4001. Prix public : moins de 2,60 € le kg. Marge annoncée 25%.",
  },
];
export function briefTestExtraction(): BriefExtraction {
  const evidence = { page: 1, excerpt: briefTestPages[0]!.text };
  return {
    sections: [
      {
        kind: "promotion",
        evidence,
        fields: [
          {
            key: "product_label",
            value: "poires",
            evidence,
            confidence: "high",
          },
          { key: "plu", value: "4001", evidence, confidence: "high" },
          {
            key: "selling_price_cents",
            value: 260,
            evidence,
            confidence: "medium",
          },
          {
            key: "price_qualifier",
            value: "less_than",
            evidence,
            confidence: "medium",
          },
          {
            key: "sale_start",
            value: "2026-09-14",
            evidence,
            confidence: "high",
          },
          {
            key: "sale_end",
            value: "2026-09-20",
            evidence,
            confidence: "high",
          },
          {
            key: "delivery_start",
            value: "2026-09-13",
            evidence,
            confidence: "high",
          },
          {
            key: "order_deadline",
            value: "2026-09-12",
            evidence,
            confidence: "high",
          },
          { key: "margin_ratio", value: 0.25, evidence, confidence: "medium" },
          { key: "unit", value: "kg", evidence, confidence: "high" },
        ],
      },
    ],
  };
}
export const briefTestConfig = {
  model: "synthetic-test-only",
  inputRate: 25,
  outputRate: 200,
  dailyBudgetCents: 100,
};
