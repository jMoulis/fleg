import { createHash } from "node:crypto";
import * as z from "zod";

import { orderSuggestionDraftSchema, type OrderSuggestionDraft } from "./schemas";

export const orderEvidenceReferenceSchema = z.object({
  format: z.literal("order-suggestion-evidence-v1"),
  suggestionId: z.string().regex(/^[a-f\d]{24}$/i),
  view: z.enum(["create", "approve"]),
  sha256: z.string().regex(/^[a-f\d]{64}$/),
}).strict();

// Lines, inputs and generation metadata are immutable. Approval only adds the
// decision and changes status, so both historical API responses are reconstructible.
export function orderEvidenceView(
  canonical: OrderSuggestionDraft,
  operation: "create" | "approve",
): OrderSuggestionDraft {
  if (operation === "approve" && (canonical.status !== "approved" || !canonical.decision)) {
    throw new Error("La preuve de validation est indisponible");
  }
  return orderSuggestionDraftSchema.parse(operation === "create"
    ? { ...canonical, status: "draft", decision: null }
    : canonical);
}

export function orderEvidenceReference(snapshot: OrderSuggestionDraft, view: "create" | "approve") {
  const validated = orderEvidenceView(snapshot, view);
  return orderEvidenceReferenceSchema.parse({
    format: "order-suggestion-evidence-v1",
    suggestionId: validated.id,
    view,
    // Parsing fixes the field order; the digest covers the complete response.
    sha256: createHash("sha256").update(JSON.stringify(validated)).digest("hex"),
  });
}

export function verifyOrderEvidence(canonical: OrderSuggestionDraft, reference: unknown) {
  const expected = orderEvidenceReferenceSchema.parse(reference);
  const response = orderEvidenceView(canonical, expected.view);
  const actual = orderEvidenceReference(response, expected.view);
  if (actual.suggestionId !== expected.suggestionId || actual.sha256 !== expected.sha256) {
    throw new Error("La preuve de proposition ne correspond pas à la commande enregistrée");
  }
  return response;
}
