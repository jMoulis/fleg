import { describe, expect, it } from "vitest";

import {
  assertAiActionPlanApprovalAccess,
  assertAiActionPlanScope,
  buildAiActionPlanGrounding,
  type AiActionPlan,
} from "@/domain/ai/action-plans";
import { getStoreKpisResultSchema } from "@/domain/ai/tools";
import { StoreAccessDeniedError } from "@/domain/stores/authorization";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

const context: AuthorizedStoreContext = {
  userId: "manager-a",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  role: "department_manager",
  permissions: ["ai.use", "analytics.read", "recommendations.approve"],
};

describe("AI action plan store isolation", () => {
  it("rejects evidence from another store before draft persistence", () => {
    const foreignResult = getStoreKpisResultSchema.parse({
      tool: "getStoreKpis",
      readOnly: true,
      storeIds: ["66d000000000000000000002"],
      evidence: [
        {
          source: "salesFacts",
          storeId: "66d000000000000000000002",
          periodKeys: ["2026-08"],
          recordCount: 4,
          dataRevision: 1,
          calculationVersion: "analytics-v1",
        },
      ],
      semantics: { observed: [], calculated: [], inferred: [] },
      limitations: [],
      data: null,
    });

    expect(() =>
      buildAiActionPlanGrounding({ context, results: [foreignResult] }),
    ).toThrow(StoreAccessDeniedError);
  });

  it("rejects a plan from another organization or store", () => {
    expect(() =>
      assertAiActionPlanScope(context, {
        organizationId: "org-b",
        storeId: context.storeId,
      } satisfies Pick<AiActionPlan, "organizationId" | "storeId">),
    ).toThrow(StoreAccessDeniedError);
    expect(() =>
      assertAiActionPlanScope(context, {
        organizationId: context.organizationId,
        storeId: "66d000000000000000000002",
      } satisfies Pick<AiActionPlan, "organizationId" | "storeId">),
    ).toThrow(StoreAccessDeniedError);
  });

  it("requires the manager approval permission for a decision", () => {
    expect(() => assertAiActionPlanApprovalAccess(context)).not.toThrow();
    expect(() =>
      assertAiActionPlanApprovalAccess({
        ...context,
        permissions: ["ai.use", "analytics.read"],
      }),
    ).toThrow(StoreAccessDeniedError);
  });
});
