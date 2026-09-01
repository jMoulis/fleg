import type { ExperimentStatus } from "@/domain/experiments/schemas";

export type ExperimentAction =
  | "save"
  | "plan"
  | "start"
  | "finish"
  | "mark_analyzed"
  | "conclude"
  | "archive"
  | "cancel";

export function resolveExperimentStatus(input: {
  currentStatus: ExperimentStatus;
  action: ExperimentAction;
}): ExperimentStatus | null {
  const { currentStatus, action } = input;

  if (currentStatus === "draft") {
    if (action === "save") return "draft";
    if (action === "plan") return "planned";
    if (action === "cancel") return "cancelled";
  }

  if (currentStatus === "planned") {
    if (action === "save" || action === "plan") return "planned";
    if (action === "start") return "running";
    if (action === "cancel") return "cancelled";
  }

  if (currentStatus === "running") {
    if (action === "finish") return "awaiting_data";
    if (action === "cancel") return "cancelled";
  }

  if (currentStatus === "awaiting_data") {
    if (action === "mark_analyzed") return "analyzed";
    if (action === "cancel") return "cancelled";
  }

  if (currentStatus === "analyzed" && action === "conclude") {
    return "concluded";
  }

  if (currentStatus === "concluded" && action === "archive") {
    return "archived";
  }

  return null;
}

export function isExperimentDefinitionEditable(
  status: ExperimentStatus,
): boolean {
  return status === "draft" || status === "planned";
}
