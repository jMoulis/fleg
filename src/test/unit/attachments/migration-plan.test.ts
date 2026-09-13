import { describe, expect, it } from "vitest";
import {
  migrationSnapshotSchema,
  planPhotoMigration,
  type MigrationSnapshot,
} from "@/domain/attachments/migration-plan";

function snapshot(): MigrationSnapshot {
  const scope = { organizationId: "org", storeId: "a".repeat(24) };
  return {
    schemaVersion: 1,
    mode: "read-only-inventory",
    databases: { app: "test_app", auth: "test_auth" },
    scope,
    capturedAt: "2026-09-13T12:00:00.000Z",
    after: null,
    nextCursor: null,
    exhausted: true,
    bytesRead: 8,
    entries: [
      {
        ...scope,
        attachmentId: "b".repeat(24),
        status: "eligible_for_copy",
        bsonBytes: 8,
        checksumSha256: "c".repeat(64),
        metadataFingerprint: "d".repeat(64),
      },
    ],
  };
}
describe("read-only photo migration plan", () => {
  it("reports only verified eligible bytes, zero savings and conditional rollback", () => {
    const value = snapshot();
    value.entries.push({
      ...value.entries[0]!,
      attachmentId: "c".repeat(24),
      status: "orphan_bson",
      bsonBytes: 99,
    });
    const plan = planPhotoMigration(value);
    expect(plan.eligibleLogicalBytes).toBe(8);
    expect(plan.bytesFreed).toBe(0);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.needsReview).toHaveLength(1);
    expect(plan.rollback.concurrentDeletion).toContain("Ne jamais recréer");
    expect(plan.rollback.afterBsonPurge).toContain(
      "Pas de restauration BSON automatique",
    );
    expect(plan.warning).toContain("Simulation sans copie");
  });
  it("keeps empty and resumed pages distinct from a complete empty inventory", () => {
    const value = snapshot();
    value.entries = [];
    value.bytesRead = 0;
    expect(planPhotoMigration(value)).toMatchObject({
      coverage: "complete_at_read_time",
      inspected: 0,
      eligibleLogicalBytes: 0,
    });
    value.after = "a".repeat(24);
    expect(planPhotoMigration(value).coverage).toBe("partial_page");
  });
  it("rejects mixed scopes, duplicate/out-of-order IDs, malformed cursors and forged eligibility", () => {
    const original = snapshot();
    for (const mutate of [
      (v: MigrationSnapshot) => {
        v.entries[0]!.storeId = "f".repeat(24);
      },
      (v: MigrationSnapshot) => {
        v.entries[0]!.organizationId = "other";
      },
      (v: MigrationSnapshot) => {
        v.entries.push(v.entries[0]!);
      },
      (v: MigrationSnapshot) => {
        v.exhausted = false;
      },
      (v: MigrationSnapshot) => {
        v.entries[0]!.checksumSha256 = null;
      },
      (v: MigrationSnapshot) => {
        v.entries[0]!.bsonBytes = 5000000;
      },
    ]) {
      const value = structuredClone(original);
      mutate(value);
      expect(migrationSnapshotSchema.safeParse(value).success).toBe(false);
    }
    expect(
      migrationSnapshotSchema.safeParse({ ...original, token: "not-allowed" })
        .success,
    ).toBe(false);
  });
});
