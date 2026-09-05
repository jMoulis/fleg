import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "@/domain/health/schemas";

describe("healthResponseSchema", () => {
  it("accepts the public health-check envelope", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        services: { database: "up", indexes: "ready" },
        metrics: { databaseLatencyMs: 4, readinessLatencyMs: 18 },
        requestId: "d82f9f52-8c76-43a8-9ad0-9e2840de66ac",
        checkedAt: "2026-09-01T12:00:00.000Z",
      }),
    ).toBeDefined();
  });

  it("accepts a degraded response without a database latency", () => {
    expect(
      healthResponseSchema.parse({
        status: "unhealthy",
        services: { database: "down", indexes: "unavailable" },
        metrics: { databaseLatencyMs: null, readinessLatencyMs: 8_000 },
        requestId: "d82f9f52-8c76-43a8-9ad0-9e2840de66ac",
        checkedAt: "2026-09-01T12:00:00.000Z",
      }).status,
    ).toBe("unhealthy");
  });
});
