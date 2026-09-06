import { describe, expect, it } from "vitest";

import {
  defaultStorePermissionsByRole,
  organizationCreateInputSchema,
  storeMembershipWriteInputSchema,
} from "@/domain/admin/schemas";

describe("admin schemas", () => {
  it("accepts a bounded organization and first-store command", () => {
    expect(
      organizationCreateInputSchema.parse({
        name: "Réseau Nord",
        slug: "reseau-nord",
        firstStore: { code: "NORD-01", name: "Lille Centre" },
        idempotencyKey: crypto.randomUUID(),
      }).firstStore.code,
    ).toBe("NORD-01");
  });

  it("rejects duplicate permissions", () => {
    expect(
      storeMembershipWriteInputSchema.safeParse({
        userId: "user-a",
        role: "viewer",
        permissions: ["stores.read", "stores.read"],
        active: true,
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it("keeps every active role able to read its store", () => {
    for (const permissions of Object.values(defaultStorePermissionsByRole)) {
      expect(permissions).toContain("stores.read");
    }
  });
});
