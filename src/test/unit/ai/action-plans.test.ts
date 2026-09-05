import { describe, expect, it } from "vitest";

import {
  aiActionPlanDecisionInputSchema,
  buildAiActionPlanGrounding,
  createDraftActionPlanInputSchema,
} from "@/domain/ai/action-plans";
import { getStoreKpisResultSchema } from "@/domain/ai/tools";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const context: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["ai.use", "analytics.read", "recommendations.approve"],
};

const groundedResult = getStoreKpisResultSchema.parse({
  tool: "getStoreKpis",
  readOnly: true,
  storeIds: [context.storeId],
  evidence: [
    {
      source: "salesFacts",
      storeId: context.storeId,
      periodKeys: ["2026-08"],
      recordCount: 8,
      dataRevision: 4,
      calculationVersion: "analytics-v1",
    },
  ],
  semantics: {
    observed: ["data.revenueCents"],
    calculated: ["data.marginRatio"],
    inferred: [],
  },
  limitations: [
    {
      code: "MONTHLY_GRANULARITY",
      message: "La source disponible est mensuelle.",
    },
  ],
  data: null,
});

describe("AI action plan contract", () => {
  it("accepts bounded draft content and rejects tenant-controlled fields", () => {
    const valid = {
      title: "Priorités septembre",
      objective: "Transformer les constats disponibles en contrôles terrain.",
      periodKey: "2026-08",
      confidence: "medium",
      actions: [
        {
          kind: "product_priority",
          title: "Contrôler les priorités produit",
          rationale: "Les métriques justifient une validation terrain ciblée.",
          expectedEffect: "Fiabiliser la sélection avant toute mise en œuvre.",
          confidence: "medium",
        },
      ],
    };

    expect(createDraftActionPlanInputSchema.parse(valid)).toMatchObject(valid);
    expect(
      createDraftActionPlanInputSchema.safeParse({
        ...valid,
        storeId: context.storeId,
      }).success,
    ).toBe(false);
  });

  it("deduplicates only authorized deterministic evidence and limitations", () => {
    const grounding = buildAiActionPlanGrounding({
      context,
      results: [groundedResult, groundedResult],
    });

    expect(grounding.evidence).toHaveLength(1);
    expect(grounding.limitations).toHaveLength(1);
    expect(grounding.semantics.observed).toEqual(["data.revenueCents"]);
  });

  it("requires a reason for the separate manager decision", () => {
    expect(
      aiActionPlanDecisionInputSchema.safeParse({
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        decision: "approved",
        rationale: "Court",
      }).success,
    ).toBe(false);
    expect(
      aiActionPlanDecisionInputSchema.safeParse({
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        decision: "approved",
        rationale: "Validé après contrôle terrain par le manager.",
      }).success,
    ).toBe(true);
  });
});
