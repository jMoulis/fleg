import { describe, expect, it } from "vitest";

import {
  defaultEditableStoreSettings,
  periodTargetUpsertInputSchema,
  storeSettingsUpdateInputSchema,
} from "@/domain/configuration/schemas";
import { configVersion } from "@/domain/configuration/versions";

describe("store configuration schemas", () => {
  it("accepts the documented editable defaults", () => {
    expect(
      storeSettingsUpdateInputSchema.parse({
        idempotencyKey: "82c3b328-a80e-4bbb-9d3e-93b89e25eea8",
        basedOnUpdatedAt: null,
        settings: defaultEditableStoreSettings,
      }).settings,
    ).toEqual(defaultEditableStoreSettings);
  });

  it("rejects incoherent ABC and seasonality bounds", () => {
    const result = storeSettingsUpdateInputSchema.safeParse({
      idempotencyKey: "82c3b328-a80e-4bbb-9d3e-93b89e25eea8",
      basedOnUpdatedAt: null,
      settings: {
        ...defaultEditableStoreSettings,
        analytics: {
          ...defaultEditableStoreSettings.analytics,
          abcAThreshold: 0.96,
          abcBThreshold: 0.95,
          retainedSeasonalityFloor: 2,
          retainedSeasonalityCeiling: 1,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path.join("."))).toEqual(
        expect.arrayContaining([
          "settings.analytics.abcBThreshold",
          "settings.analytics.retainedSeasonalityCeiling",
        ]),
      );
    }
  });

  it("keeps money in integer cents and periods monthly", () => {
    expect(
      periodTargetUpsertInputSchema.safeParse({
        idempotencyKey: "82c3b328-a80e-4bbb-9d3e-93b89e25eea8",
        basedOnUpdatedAt: null,
        periodKey: "2026-09",
        targetRevenueCents: 125_000,
      }).success,
    ).toBe(true);
    expect(
      periodTargetUpsertInputSchema.safeParse({
        idempotencyKey: "82c3b328-a80e-4bbb-9d3e-93b89e25eea8",
        basedOnUpdatedAt: null,
        periodKey: "septembre",
        targetRevenueCents: 1.5,
      }).success,
    ).toBe(false);
  });

  it("derives model versions from the configuration revision", () => {
    expect(configVersion("analytics-v1", 0)).toBe("analytics-v1");
    expect(configVersion("analytics-v1", 3)).toBe("analytics-v1-config-3");
  });
});
