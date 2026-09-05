import { describe, expect, it } from "vitest";

import {
  operationalLogSchema,
  redactOperationalText,
} from "@/domain/operations/logging";

describe("operational logging", () => {
  it("redacts credentials and tokens before logs leave the application", () => {
    const input = [
      "mongodb+srv://admin:super-secret@cluster.example.net/app",
      "Authorization: Bearer top-secret-token",
      "OpenAI sk-proj_1234567890abcdef",
      '{"password":"hunter2","token":"opaque"}',
      "https://example.test/callback?token=secret-value&mode=read",
    ].join("\n");
    const result = redactOperationalText(input);

    expect(result).not.toContain("super-secret");
    expect(result).not.toContain("top-secret-token");
    expect(result).not.toContain("sk-proj_1234567890abcdef");
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("secret-value");
    expect(result).toContain("[REDACTED]");
  });

  it("validates the structured operational envelope", () => {
    expect(
      operationalLogSchema.parse({
        timestamp: "2026-09-05T10:00:00.000Z",
        severity: "error",
        event: "api.request.failed",
        message: "Une route applicative a échoué",
        requestId: "d82f9f52-8c76-43a8-9ad0-9e2840de66ac",
        route: "/api/stores/[storeId]/dashboard",
        method: "GET",
        statusCode: 503,
      }).event,
    ).toBe("api.request.failed");
  });
});
