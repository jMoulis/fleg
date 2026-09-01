import { describe, expect, it } from "vitest";

import {
  isExperimentDefinitionEditable,
  resolveExperimentStatus,
} from "@/domain/experiments/lifecycle";

describe("experiment lifecycle", () => {
  it("moves an experiment through planning and execution explicitly", () => {
    expect(resolveExperimentStatus({ currentStatus: "draft", action: "plan" })).toBe(
      "planned",
    );
    expect(
      resolveExperimentStatus({ currentStatus: "planned", action: "start" }),
    ).toBe("running");
    expect(
      resolveExperimentStatus({ currentStatus: "running", action: "finish" }),
    ).toBe("awaiting_data");
  });

  it("reserves analysis and conclusion transitions for their later services", () => {
    expect(
      resolveExperimentStatus({
        currentStatus: "awaiting_data",
        action: "mark_analyzed",
      }),
    ).toBe("analyzed");
    expect(
      resolveExperimentStatus({ currentStatus: "analyzed", action: "conclude" }),
    ).toBe("concluded");
    expect(
      resolveExperimentStatus({ currentStatus: "concluded", action: "archive" }),
    ).toBe("archived");
  });

  it("rejects shortcuts and freezes the definition once running", () => {
    expect(
      resolveExperimentStatus({ currentStatus: "draft", action: "start" }),
    ).toBeNull();
    expect(
      resolveExperimentStatus({ currentStatus: "running", action: "save" }),
    ).toBeNull();
    expect(isExperimentDefinitionEditable("planned")).toBe(true);
    expect(isExperimentDefinitionEditable("running")).toBe(false);
    expect(isExperimentDefinitionEditable("concluded")).toBe(false);
  });

  it("allows cancellation only before a terminal conclusion", () => {
    expect(
      resolveExperimentStatus({ currentStatus: "draft", action: "cancel" }),
    ).toBe("cancelled");
    expect(
      resolveExperimentStatus({ currentStatus: "running", action: "cancel" }),
    ).toBe("cancelled");
    expect(
      resolveExperimentStatus({ currentStatus: "concluded", action: "cancel" }),
    ).toBeNull();
  });
});
