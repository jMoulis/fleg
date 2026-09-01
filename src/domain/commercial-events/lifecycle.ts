import type {
  CommercialEventStatus,
} from "@/domain/commercial-events/schemas";

export type CommercialEventAction =
  | "save"
  | "publish"
  | "complete"
  | "cancel";

export function dateRangesOverlap(
  first: { startsOn: string; endsOn: string },
  second: { startsOn: string; endsOn: string },
): boolean {
  return first.startsOn <= second.endsOn && second.startsOn <= first.endsOn;
}

export function resolveCommercialEventStatus(input: {
  currentStatus: CommercialEventStatus | null;
  action: CommercialEventAction;
}): CommercialEventStatus | null {
  const { currentStatus, action } = input;

  if (currentStatus === null) {
    if (action === "save") return "draft";
    if (action === "publish") return "published";
    return null;
  }

  if (currentStatus === "draft") {
    if (action === "save") return "draft";
    if (action === "publish") return "published";
    if (action === "cancel") return "cancelled";
  }

  if (currentStatus === "published") {
    if (action === "complete") return "completed";
    if (action === "cancel") return "cancelled";
  }

  return null;
}
