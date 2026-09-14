import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const args = [
  "--import",
  "tsx",
  "--conditions=react-server",
  resolve("src/scripts/plan-photo-migration.ts"),
];
const env = {
  ...process.env,
  PHOTO_MIGRATION_MONGODB_URI: "secret-never-log",
  BLOB_READ_WRITE_TOKEN: "secret-never-log",
};
const empty = {
  schemaVersion: 1,
  mode: "read-only-inventory",
  databases: { app: "test_app", auth: "test_auth" },
  scope: { organizationId: "org", storeId: "a".repeat(24) },
  capturedAt: "2026-09-13T12:00:00.000Z",
  after: null,
  nextCursor: null,
  exhausted: true,
  bytesRead: 0,
  entries: [],
};
describe("migration CLI stays read-only", () => {
  it("defaults to offline help even with poisoned credentials", () => {
    const result = execFileSync(process.execPath, args, {
      env,
      encoding: "utf8",
    });
    expect(JSON.parse(result)).toMatchObject({ mode: "help", readOnly: true });
    expect(result).not.toContain("secret-never-log");
  });
  it("rejects mutation flags and missing scope confirmations before env loading", () => {
    for (const input of [
      ["--execute"],
      ["--read", "--credentials-file", "/does-not-exist"],
      ["--credentials-file", "/does-not-exist"],
    ]) {
      const result = spawnSync(process.execPath, [...args, ...input], {
        env,
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("(arguments)");
      expect(result.stderr).not.toContain("secret-never-log");
    }
  });
  it("simulates a local snapshot, refuses unsafe input and never overwrites a report", () => {
    const dir = mkdtempSync(join(tmpdir(), "fleg-photo-plan-test-"));
    try {
      const input = join(dir, "input.json");
      const output = join(dir, "plan.json");
      writeFileSync(input, JSON.stringify(empty));
      execFileSync(
        process.execPath,
        [...args, "--snapshot", input, "--output", output],
        { env },
      );
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        mode: "dry-run",
        bytesFreed: 0,
      });
      expect(statSync(output).mode & 0o777).toBe(0o600);
      const saved = readFileSync(output);
      expect(
        spawnSync(
          process.execPath,
          [...args, "--snapshot", input, "--output", output],
          { env },
        ).status,
      ).toBe(1);
      expect(readFileSync(output).equals(saved)).toBe(true);
      const link = join(dir, "link.json");
      symlinkSync(input, link);
      expect(
        spawnSync(process.execPath, [...args, "--snapshot", link], { env })
          .status,
      ).toBe(1);
      writeFileSync(input, Buffer.alloc(1024 * 1024 + 1));
      expect(
        spawnSync(process.execPath, [...args, "--snapshot", input], { env })
          .status,
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
