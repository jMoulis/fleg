import { describe, expect, it } from "vitest";

import { calculateBusinessContextView } from "@/domain/context-observations/calculations";
import type {
  PromotionObservation,
  WeatherObservation,
} from "@/domain/context-observations/schemas";

const organizationId = "organization-a";
const storeId = "66a000000000000000000001";
const departmentId = "66b000000000000000000001";
const productA = "66d000000000000000000001";
const productB = "66d000000000000000000002";

function promotion(
  input: Partial<PromotionObservation> &
    Pick<PromotionObservation, "id" | "businessDate" | "recordedAt">,
): PromotionObservation {
  return {
    id: input.id,
    organizationId,
    storeId,
    departmentId,
    businessDate: input.businessDate,
    state: input.state ?? "active",
    productIds: input.productIds ?? [productA],
    mechanic: input.mechanic === undefined ? "display" : input.mechanic,
    label: input.label === undefined ? "TG agrumes" : input.label,
    discountRate: input.discountRate ?? null,
    provenance: input.provenance ?? { kind: "manual" },
    notes: input.notes ?? null,
    recordedBy: input.recordedBy ?? "user-a",
    recordedAt: input.recordedAt,
  };
}

function weather(
  input: Partial<WeatherObservation> &
    Pick<WeatherObservation, "id" | "businessDate" | "recordedAt">,
): WeatherObservation {
  return {
    id: input.id,
    organizationId,
    storeId,
    departmentId,
    businessDate: input.businessDate,
    condition: input.condition ?? "clear",
    minimumTemperatureC: input.minimumTemperatureC ?? null,
    maximumTemperatureC: input.maximumTemperatureC ?? null,
    precipitationMm: input.precipitationMm ?? null,
    provenance: input.provenance ?? { kind: "manual" },
    notes: input.notes ?? null,
    recordedBy: input.recordedBy ?? "user-a",
    recordedAt: input.recordedAt,
  };
}

describe("business context feature join", () => {
  it("keeps absent promotion and weather context unknown", () => {
    const view = calculateBusinessContextView({
      from: "2026-09-08",
      to: "2026-09-09",
      productId: null,
      promotionObservations: [],
      weatherObservations: [],
      dataRevision: 4,
    });

    expect(view.coverage.status).toBe("unknown");
    expect(view.coverage.missingPromotionDates).toEqual([
      "2026-09-08",
      "2026-09-09",
    ]);
    expect(view.days.every(({ promotion: feature }) =>
      feature.active === null,
    )).toBe(true);
  });

  it("joins promotions by product and selects the latest weather evidence", () => {
    const view = calculateBusinessContextView({
      from: "2026-09-09",
      to: "2026-09-09",
      productId: productA,
      promotionObservations: [
        promotion({
          id: "66e000000000000000000001",
          businessDate: "2026-09-09",
          recordedAt: "2026-09-09T07:00:00.000Z",
          discountRate: 0.1,
        }),
        promotion({
          id: "66e000000000000000000002",
          businessDate: "2026-09-09",
          recordedAt: "2026-09-09T08:00:00.000Z",
          productIds: [productB],
          discountRate: 0.5,
        }),
      ],
      weatherObservations: [
        weather({
          id: "66f000000000000000000001",
          businessDate: "2026-09-09",
          recordedAt: "2026-09-09T06:00:00.000Z",
          condition: "rain",
        }),
        weather({
          id: "66f000000000000000000002",
          businessDate: "2026-09-09",
          recordedAt: "2026-09-09T09:00:00.000Z",
          condition: "clear",
          maximumTemperatureC: 24,
        }),
      ],
      dataRevision: 5,
    });

    expect(view.coverage.status).toBe("complete");
    expect(view.days[0]).toMatchObject({
      promotion: {
        status: "observed",
        active: true,
        observationIds: ["66e000000000000000000001"],
        maximumDiscountRate: 0.1,
      },
      weather: {
        status: "observed",
        selectedObservationId: "66f000000000000000000002",
        observationCount: 2,
        condition: "clear",
        maximumTemperatureC: 24,
      },
    });
  });

  it("uses an explicit no-promotion observation as a reset", () => {
    const active = promotion({
      id: "66e000000000000000000001",
      businessDate: "2026-09-09",
      recordedAt: "2026-09-09T07:00:00.000Z",
    });
    const none = promotion({
      id: "66e000000000000000000002",
      businessDate: "2026-09-09",
      recordedAt: "2026-09-09T08:00:00.000Z",
      state: "none",
      productIds: [],
      mechanic: null,
      label: null,
    });
    const view = calculateBusinessContextView({
      from: "2026-09-09",
      to: "2026-09-09",
      productId: productA,
      promotionObservations: [active, none],
      weatherObservations: [],
      dataRevision: 6,
    });

    expect(view.coverage.status).toBe("partial");
    expect(view.days[0]?.promotion).toEqual({
      status: "observed",
      active: false,
      observationIds: [none.id],
      mechanics: [],
      maximumDiscountRate: null,
    });
  });
});
