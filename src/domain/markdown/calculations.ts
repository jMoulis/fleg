import type { MarkdownFact } from "@/domain/markdown/schemas";

export interface MarkdownPeriodSummary {
  amountCents: number;
  quantity: number | null;
  factCount: number;
}

export function summarizeMarkdownFacts(
  facts: Pick<MarkdownFact, "amountCents" | "quantity">[],
): MarkdownPeriodSummary {
  const quantities = facts.filter(
    (fact): fact is typeof fact & { quantity: number } => fact.quantity !== null,
  );
  return {
    amountCents: facts.reduce((sum, fact) => sum + fact.amountCents, 0),
    quantity:
      quantities.length === facts.length
        ? quantities.reduce((sum, fact) => sum + fact.quantity, 0)
        : null,
    factCount: facts.length,
  };
}

export function calculatePostMarkdownMargin(input: {
  grossMarginCents: number;
  markdownCents: number;
}): number {
  return input.grossMarginCents - input.markdownCents;
}
