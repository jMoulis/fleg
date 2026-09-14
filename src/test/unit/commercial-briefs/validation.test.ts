import { describe, expect, it } from "vitest";
import {
  briefPagesSchema,
  briefPolicy,
} from "@/domain/commercial-briefs/schemas";
import {
  validateBriefExtraction,
  validateBriefValues,
  displayBriefValue,
  parseBriefEditedValue,
} from "@/domain/commercial-briefs/validation";
import {
  briefTestExtraction,
  briefTestPages,
} from "@/test/helpers/commercial-brief-fixture";

describe("commercial brief evidence and business boundaries", () => {
  it("edits euros and percentages without exposing storage units or rounding hidden precision", () => {
    expect(displayBriefValue({ key: "selling_price_cents", value: 260 })).toBe(
      "2,60",
    );
    expect(parseBriefEditedValue("selling_price_cents", "2,50")).toBe(250);
    expect(() =>
      parseBriefEditedValue("selling_price_cents", "2,505"),
    ).toThrow();
    expect(displayBriefValue({ key: "margin_ratio", value: 0.2879 })).toBe(
      "28,79",
    );
    expect(parseBriefEditedValue("margin_ratio", "28,79")).toBe(0.2879);
    expect(displayBriefValue({ key: "selling_price_cents", value: null })).toBe(
      "",
    );
    expect(parseBriefEditedValue("selling_price_cents", " ")).toBeNull();
    expect(parseBriefEditedValue("selling_price_cents", "0")).toBe(0);
  });
  it("preserves cents, less-than price semantics and distinct sale/delivery/order dates", () => {
    expect(
      validateBriefExtraction(briefTestExtraction(), briefTestPages),
    ).toEqual(briefTestExtraction());
  });
  it("does not invent missing values or convert unknown to zero", () => {
    expect(
      validateBriefValues([
        { key: "purchase_price_cents", value: null },
        { key: "delivery_end", value: null },
      ])[0]!.value,
    ).toBeNull();
  });
  it.each(
    [
      [{ key: "purchase_price_cents", value: 2.6 }],
      [{ key: "selling_price_cents", value: 260 }],
      [{ key: "selling_price_cents", value: "260" }],
      [{ key: "margin_ratio", value: 25 }],
      [{ key: "sale_start", value: "2026-02-30" }],
      [
        { key: "sale_start", value: "2026-09-20" },
        { key: "sale_end", value: "2026-09-14" },
      ],
      [{ key: "plu", value: 4001 }],
      [
        { key: "product_label", value: "one" },
        { key: "product_label", value: "two" },
      ],
    ].map((fields) => ({ fields })),
  )("rejects invalid/ambiguous typed values $fields", ({ fields }) => {
    expect(() =>
      validateBriefExtraction(
        {
          sections: [
            {
              ...briefTestExtraction().sections[0],
              fields: fields.map((f) => ({
                ...f,
                evidence: { page: 1, excerpt: "Promotion poires." },
                confidence: "low",
              })),
            },
          ],
        },
        briefTestPages,
      ),
    ).toThrow();
  });
  it("rejects invented page citations or quotes, but tolerates extraction whitespace", () => {
    for (const evidence of [
      { page: 2, excerpt: "Promotion poires." },
      { page: 1, excerpt: "Invented source" },
      { page: 1, excerpt: "   " },
    ]) {
      const draft = briefTestExtraction();
      draft.sections[0]!.fields[0]!.evidence = evidence;
      expect(() => validateBriefExtraction(draft, briefTestPages)).toThrow();
    }
    const draft = briefTestExtraction();
    draft.sections[0]!.fields[0]!.evidence.excerpt = "Promotion\npoires.";
    expect(validateBriefExtraction(draft, briefTestPages)).toEqual(draft);
  });
  it("limits selected text and rejects empty/scanned or repeated pages", () => {
    for (const pages of [
      [{ page: 1, text: " " }],
      [...briefTestPages, ...briefTestPages],
      Array.from({ length: 13 }, (_, i) => ({ page: i + 1, text: "text" })),
      [
        { page: 1, text: "a".repeat(20_000) },
        { page: 2, text: "b".repeat(briefPolicy.maxCharacters) },
      ],
    ])
      expect(() => briefPagesSchema.parse(pages)).toThrow();
  });
  it("rejects commands, product IDs and arbitrary additional fields from model output", () => {
    expect(() =>
      validateBriefExtraction(
        { ...briefTestExtraction(), execute: "publish" },
        briefTestPages,
      ),
    ).toThrow();
    const draft = briefTestExtraction();
    expect(() =>
      validateBriefExtraction(
        { sections: [{ ...draft.sections[0], productId: "a".repeat(24) }] },
        briefTestPages,
      ),
    ).toThrow();
  });
});
