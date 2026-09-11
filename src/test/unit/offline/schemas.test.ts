import { describe, expect, it } from "vitest";
import {
  offlineFreshness,
  preparedWorkspaceSchema,
  sameOfflineIdentity,
} from "@/domain/offline/schemas";
import { preparedFixture } from "@/test/fixtures/offline";

describe("prepared offline references", () => {
  it("requires complete, unique, versioned catalogues", () => {
    const fixture = preparedFixture();
    expect(preparedWorkspaceSchema.safeParse(fixture).success).toBe(true);
    expect(
      preparedWorkspaceSchema.safeParse({
        ...fixture,
        products: fixture.products.slice(0, 25),
      }).success,
    ).toBe(false);
    expect(
      preparedWorkspaceSchema.safeParse({
        ...fixture,
        products: fixture.products.map(() => fixture.products[0]),
      }).success,
    ).toBe(false);
    expect(
      preparedWorkspaceSchema.safeParse({ ...fixture, schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
  it("bounds the offline lease and rejects a backwards device clock", () => {
    const fixture = preparedFixture();
    expect(offlineFreshness(fixture, Date.parse(fixture.preparedAt) - 1)).toBe(
      "clock_error",
    );
    expect(offlineFreshness(fixture, Date.parse(fixture.preparedAt))).toBe(
      "ready",
    );
    expect(offlineFreshness(fixture, Date.parse(fixture.expiresAt))).toBe(
      "expired",
    );
    expect(offlineFreshness(fixture, Date.parse(fixture.purgeAt))).toBe(
      "purged",
    );
    expect(
      preparedWorkspaceSchema.safeParse({
        ...fixture,
        expiresAt: fixture.preparedAt,
      }).success,
    ).toBe(false);
  });
  it("keeps blank and explicit zero distinct", () => {
    const fixture = preparedFixture(1);
    fixture.products[0]!.countLine = {
      productId: fixture.products[0]!.id,
      familyCode: "3400",
      stockUnit: "kg",
      packSize: 18.5,
      reserveCaseCount: 0,
      shelfQuantity: null,
    };
    expect(
      preparedWorkspaceSchema.parse(fixture).products[0]?.countLine,
    ).toMatchObject({ reserveCaseCount: 0, shelfQuantity: null });
  });
  it("requires the same user, login session, company and store", () => {
    const identity = preparedFixture().identity;
    expect(sameOfflineIdentity(identity, { ...identity })).toBe(true);
    for (const key of [
      "userId",
      "sessionBinding",
      "organizationId",
      "storeId",
    ] as const) {
      expect(
        sameOfflineIdentity(identity, { ...identity, [key]: "different" }),
      ).toBe(false);
    }
  });
});
