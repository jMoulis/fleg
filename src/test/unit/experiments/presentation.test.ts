import { describe, expect, it } from "vitest";

import {
  dateInputToEndIso,
  dateInputToStartIso,
  experimentDefinitionFromRecord,
  getExperimentListView,
  getExperimentProgress,
  isoToDateInput,
} from "@/domain/experiments/presentation";
import {
  experimentDefinitionSchema,
  experimentSchema,
} from "@/domain/experiments/schemas";

const experiment = experimentSchema.parse({
  id: "66d000000000000000000201",
  organizationId: "org-a",
  storeId: "66d000000000000000000001",
  departmentId: "66d000000000000000000010",
  title: "Banane vrac en TG1",
  hypothesis: "Le placement TG augmente le CA sans dégrader la marge.",
  type: "tg_placement",
  status: "running",
  ownerUserId: "manager-a",
  productIds: ["66d000000000000000000101"],
  family: null,
  treatmentPlan: {
    summary: "Placer la banane sur TG1.",
    fixtureId: "endcap-1",
    expectedChange: "Visibilité supérieure.",
    instructions: [],
  },
  treatmentActual: {
    summary: "Banane placée sur TG1.",
    fixtureId: "endcap-1",
    implementationNotes: null,
    deviations: [],
  },
  plannedStartAt: "2026-09-07T00:00:00.000Z",
  plannedEndAt: "2026-09-13T23:59:59.999Z",
  actualStartAt: "2026-09-07T08:00:00.000Z",
  actualEndAt: null,
  primaryMetric: "revenue",
  secondaryMetrics: ["gross_margin_cents"],
  guardrailMetrics: ["markdown_cents"],
  baselineConfig: {
    method: "prior_comparable_periods",
    comparablePeriods: 4,
    trendNormalization: true,
    controlStoreIds: [],
  },
  expectedRelativeEffect: 0.08,
  explicitCostsCents: 1_500,
  confounders: [],
  linkedCommercialEventId: null,
  linkedRecommendationId: null,
  linkedDecisionIds: [],
  definitionFrozenAt: "2026-09-07T08:00:00.000Z",
  definitionFrozenBy: "manager-a",
  completionNotes: null,
  createdBy: "manager-a",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-07T08:00:00.000Z",
  plannedAt: "2026-09-01T08:05:00.000Z",
  startedAt: "2026-09-07T08:00:00.000Z",
  awaitingDataAt: null,
  analyzedAt: null,
  concludedAt: null,
  archivedAt: null,
  cancelledAt: null,
});

describe("experiment presentation domain", () => {
  it("converts date inputs into explicit UTC experiment boundaries", () => {
    expect(dateInputToStartIso("2026-09-07")).toBe(
      "2026-09-07T00:00:00.000Z",
    );
    expect(dateInputToEndIso("2026-09-13")).toBe(
      "2026-09-13T23:59:59.999Z",
    );
    expect(isoToDateInput(experiment.plannedStartAt)).toBe("2026-09-07");
  });

  it("groups lifecycle states into the four user-facing views", () => {
    expect(getExperimentListView("draft")).toBe("prepare");
    expect(getExperimentListView("running")).toBe("running");
    expect(getExperimentListView("awaiting_data")).toBe("analyze");
    expect(getExperimentListView("cancelled")).toBe("finished");
  });

  it("derives a bounded running-day indicator", () => {
    expect(
      getExperimentProgress({
        actualStartAt: "2026-09-07T08:00:00.000Z",
        plannedEndAt: "2026-09-14T08:00:00.000Z",
        asOf: "2026-09-09T09:00:00.000Z",
      }),
    ).toEqual({ currentDay: 3, totalDays: 7, elapsedRatio: 3 / 7 });
  });

  it("extracts only the editable definition from a stored experiment", () => {
    const definition = experimentDefinitionFromRecord(experiment);

    expect(experimentDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(definition).not.toHaveProperty("status");
    expect(definition).not.toHaveProperty("treatmentActual");
  });
});
