import { preparedWorkspaceSchema } from "@/domain/offline/schemas";

export function preparedFixture(productCount = 52) {
  return preparedWorkspaceSchema.parse({
    schemaVersion: 1,
    identity: {
      userId: "user-a",
      sessionBinding: "a".repeat(64),
      organizationId: "org-a",
      storeId: "66d000000000000000000001",
    },
    storeName: "Magasin A",
    businessDate: "2026-09-11",
    preparedAt: "2026-09-11T06:00:00.000Z",
    expiresAt: "2026-09-11T18:00:00.000Z",
    purgeAt: "2026-09-12T06:00:00.000Z",
    dataRevision: 4,
    productCount,
    countReference: null,
    products: Array.from({ length: productCount }, (_, index) => ({
      id: (index + 1).toString(16).padStart(24, "0"),
      label: `Article ${String(index + 1).padStart(3, "0")}`,
      profile: null,
      countLine: null,
      lastStock: null,
    })),
  });
}
