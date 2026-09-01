import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "@/domain/health/schemas";

describe("healthResponseSchema", () => {
  it("accepts the public health-check envelope", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        services: { database: "up" },
        requestId: "d82f9f52-8c76-43a8-9ad0-9e2840de66ac",
        checkedAt: "2026-09-01T12:00:00.000Z",
      }),
    ).toBeDefined();
  });
});
