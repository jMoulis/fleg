import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  issueSignedToken: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));
import { issueSignedToken, get, del } from "@vercel/blob";
import {
  acceptanceFixtures,
  acceptanceLimits,
  acceptanceStoreId,
  cleanupAcceptance,
  parseAcceptanceReport,
  prepareAcceptance,
  runAcceptance,
  syntheticPdf,
  type AcceptancePort,
  type AcceptanceReport,
} from "@/scripts/storage-acceptance/probe";
import {
  acceptanceConfig,
  createAcceptancePort,
} from "@/scripts/storage-acceptance/provider";
import { validatePdf } from "@/server/storage/pdf-validator";

const runId = "986b43b3-9a6e-44d0-bada-d703755463df";
const secret = "never-print-provider-secrets";
const env = {
  BLOB_STORE_ID: acceptanceStoreId,
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_5MOJSflf0L273Hz3_testonly",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function harness() {
  const fixtures = acceptanceFixtures(runId);
  const data = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const snapshots: AcceptanceReport[] = [];
  const save = vi.fn(async (report: AcceptanceReport) => {
    snapshots.push(structuredClone(report));
  });
  const port: AcceptancePort = {
    absent: vi.fn(async (ref) => !data.has(ref.pathname)),
    authorize: vi.fn(
      async (ref) =>
        `https://vercel.com/api/blob/?pathname=${ref.pathname}&authorized=${ref.pathname}`,
    ),
    request: vi.fn(async (url, options) => {
      const parsed = new URL(url);
      const path = parsed.searchParams.get("pathname")!;
      if (options.method === "GET") return 403;
      if (path !== parsed.searchParams.get("authorized")) return 403;
      const fixture = fixtures.find(
        (fixture) => fixture.reference.pathname === path,
      )!;
      if (options.mimeType !== fixture.input.mimeType) return 415;
      if (options.bytes!.length > fixture.input.sizeBytes) return 413;
      if (data.has(path)) return 409;
      data.set(path, options.bytes!);
      return 200;
    }),
    read: vi.fn(async (ref) => data.get(ref.pathname) ?? null),
    remove: vi.fn(async (ref) => {
      removed.push(ref.pathname);
      data.delete(ref.pathname);
    }),
    validatePdf: vi.fn(async () => ({ pageCount: 1 })),
    anonymousUrl: (ref) => `https://private.example/${ref.pathname}`,
    changePath: (url, ref) => {
      const changed = new URL(url);
      changed.searchParams.set("pathname", ref.pathname);
      return changed.toString();
    },
  };
  return { fixtures, data, removed, snapshots, save, port };
}

describe("TECH-04 operator acceptance, hermetic by default", () => {
  it("dry-run never loads credentials or creates a manifest, even with unsafe env", () => {
    const directory = `.local-backups/blob-acceptance/${runId}`;
    const existed = existsSync(directory);
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=react-server",
        "src/scripts/verify-storage.ts",
        `--run-id=${runId}`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          VERCEL_ENV: "production",
          BLOB_READ_WRITE_TOKEN: secret,
        },
      },
    );
    const result = JSON.parse(output);
    expect(result.mode).toBe("dry-run");
    expect(result.report.operationsReserved).toBe(0);
    expect(result.report.releaseReady).toBe(false);
    expect(output).not.toContain(secret);
    expect(existsSync(directory)).toBe(existed);
    expect(issueSignedToken).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before loading env or invoking the provider", () => {
    try {
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--conditions=react-server",
          "src/scripts/verify-storage.ts",
          "--execute",
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, BLOB_READ_WRITE_TOKEN: secret },
        },
      );
      throw new Error("Expected refusal");
    } catch (error) {
      expect(error).toMatchObject({ status: 1 });
      expect(String(error)).not.toContain(secret);
    }
  });

  it("pins only the approved dev credential and rejects deployment/SDK/debug overrides", () => {
    expect(acceptanceConfig(env, runId).storeId).toBe(acceptanceStoreId);
    for (const override of [
      { BLOB_STORE_ID: "store_k3DcIwSL9uBZuhhH" },
      { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_k3DcIwSL9uBZuhhH_secret" },
      { BLOB_READ_WRITE_TOKEN: undefined, VERCEL_OIDC_TOKEN: secret },
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "preview" },
      { NODE_ENV: "production" },
      { CI: "true" },
      { VERCEL: "1" },
      { VERCEL_BLOB_RETRIES: "10" },
      { VERCEL_BLOB_API_URL: "https://foreign.example" },
      { NEXT_PUBLIC_VERCEL_BLOB_API_URL: "https://foreign.example" },
      { DEBUG: "blob" },
      { HTTPS_PROXY: "https://foreign.example" },
    ])
      expect(() => acceptanceConfig({ ...env, ...override }, runId)).toThrow();
  });

  it("computes stable owned paths/hashes and parses the actual 25 MiB fixture locally", async () => {
    const report = prepareAcceptance(runId);
    expect(parseAcceptanceReport(report, runId)).toEqual(report);
    expect(report.objects).toHaveLength(3);
    const bytes = syntheticPdf();
    expect(bytes.length).toBe(25 * 1024 * 1024);
    expect((await validatePdf(bytes)).pageCount).toBe(1);
    expect(() => syntheticPdf(1)).toThrow();
  });

  it("refuses tampered reports, paths, hashes, namespaces and exhausted counters", () => {
    const report = prepareAcceptance(runId);
    for (const mutation of [
      { ...report, storeId: "store_k3DcIwSL9uBZuhhH" },
      { ...report, operationsReserved: 101 },
      { ...report, uploadBytesReserved: acceptanceLimits.uploadedBytes + 1 },
      {
        ...report,
        objects: report.objects.map((object) => ({
          ...object,
          pathname: "real-user-photo.png",
        })),
      },
      {
        ...report,
        objects: report.objects.map((object) => ({
          ...object,
          checksumSha256: "f".repeat(64),
        })),
      },
      { ...report, token: secret },
    ])
      expect(() => parseAcceptanceReport(mutation, runId)).toThrow();
  });

  it("checks restrictions, then positive controls, keeping a durable bounded cleanup record", async () => {
    const h = harness();
    const report = prepareAcceptance(runId);
    await runAcceptance(report, h.port, h.save);
    expect(report.status).toBe("passed");
    expect(report.releaseReady).toBe(false);
    expect(report.checks).toHaveLength(14);
    expect(report.checks.every((check) => check.outcome === "passed")).toBe(
      true,
    );
    expect(report.uploadBytesReserved).toBeLessThan(
      acceptanceLimits.uploadedBytes,
    );
    expect(report.operationsReserved).toBe(21);
    expect(
      report.objects.every((object) => object.cleanup === "absence_observed"),
    ).toBe(true);
    expect(h.data.size).toBe(0);
    expect(h.removed).toEqual(
      h.fixtures.map((fixture) => fixture.reference.pathname),
    );
    const beforeAuthorization = h.snapshots.find(
      (snapshot) => snapshot.objects[0]?.authorizationValidUntil,
    );
    expect(beforeAuthorization?.operationsReserved).toBe(4);
    expect(beforeAuthorization?.objects[0]?.cleanup).toBe("pending");
    expect(JSON.stringify(h.snapshots)).not.toContain("https://");
    await expect(runAcceptance(report, h.port, h.save)).rejects.toThrow(
      "cannot be replayed",
    );
  });

  it("never deletes on an existing-path collision or an uncertain preflight", async () => {
    for (const absent of [
      async () => false,
      async () => {
        throw new Error(secret);
      },
    ]) {
      const h = harness();
      h.port.absent = vi.fn(absent);
      const report = prepareAcceptance(runId);
      await runAcceptance(report, h.port, h.save);
      expect(report.status).toBe("failed");
      expect(h.port.authorize).not.toHaveBeenCalled();
      expect(h.removed).toEqual([]);
      expect(JSON.stringify(report)).not.toContain(secret);
    }
  });

  it("cleans an uncertain successful upload and retains failed deletion for explicit recovery", async () => {
    const h = harness();
    const request = h.port.request;
    h.port.request = async (url, options) => {
      const status = await request(url, options);
      if (status === 200) throw new Error(secret); // server stored it, response lost
      return status;
    };
    const remove = h.port.remove;
    h.port.remove = vi.fn(async () => {
      throw new Error(secret);
    });
    const report = prepareAcceptance(runId);
    await runAcceptance(report, h.port, h.save);
    expect(report.status).toBe("failed");
    expect(h.data.size).toBe(1);
    expect(report.objects.every((object) => object.cleanup === "pending")).toBe(
      true,
    );
    expect(JSON.stringify(h.snapshots)).not.toContain(secret);
    h.port.remove = remove;
    const recovered = parseAcceptanceReport(report, runId);
    await cleanupAcceptance(recovered, h.port, h.save);
    expect(h.data.size).toBe(0);
    expect(
      recovered.objects.every(
        (object) => object.cleanup === "absence_observed",
      ),
    ).toBe(true);
    expect(recovered.releaseReady).toBe(false);
  });

  it("does not issue capabilities when the durable journal fails", async () => {
    const h = harness();
    await expect(
      runAcceptance(prepareAcceptance(runId), h.port, async () => {
        throw new Error("disk full");
      }),
    ).rejects.toThrow();
    expect(h.port.authorize).not.toHaveBeenCalled();
    expect(h.port.request).not.toHaveBeenCalled();
  });

  it("does not exceed the total operation budget on repeated cleanup", async () => {
    const h = harness();
    const report = prepareAcceptance(runId);
    report.operationsReserved = 99;
    report.objects.forEach((object) => {
      object.cleanup = "pending";
    });
    await cleanupAcceptance(report, h.port, h.save);
    expect(h.removed).toEqual([]);
    expect(report.operationsReserved).toBe(99);
    expect(report.objects.every((object) => object.cleanup === "pending")).toBe(
      true,
    );
  });

  it("uses the real SDK signature format, no callback/retries, and exact owned destinations", async () => {
    vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
    const config = acceptanceConfig(env, runId);
    const port = createAcceptancePort(config);
    const [png, , forged] = acceptanceFixtures(runId);
    vi.mocked(issueSignedToken).mockImplementation(async (options) => ({
      clientSigningToken: "hermetic-key",
      validUntil: options!.validUntil!,
      delegationToken: `${Buffer.from(
        JSON.stringify({
          storeId: config.storeId,
          pathname: options!.pathname,
          operations: ["put"],
          validUntil: options!.validUntil,
          allowedContentTypes: ["image/png"],
          maximumSizeInBytes: png!.input.sizeBytes,
        }),
      ).toString("base64url")}.hermetic-signature`,
    }));
    const url = await port.authorize(
      png!.reference,
      png!.input,
      Date.now() + 600000,
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://vercel.com/api/blob/",
    );
    expect(parsed.searchParams.get("pathname")).toBe(png!.reference.pathname);
    expect(
      new URL(port.changePath(url, forged!.reference)).searchParams.get(
        "pathname",
      ),
    ).toBe(forged!.reference.pathname);
    expect(issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: env.BLOB_READ_WRITE_TOKEN,
        operations: ["put"],
      }),
    );
    const fetch = vi.fn(async () => new Response("discard", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    expect(await port.request(url, { method: "GET" })).toBe(403);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "error", credentials: "omit" }),
    );
    await expect(
      port.request("https://foreign.example/", { method: "GET" }),
    ).rejects.toThrow();
    await expect(
      port.absent({ ...png!.reference, pathname: "foreign.png" }),
    ).rejects.toThrow();
    expect(() =>
      port.remove({ ...png!.reference, storeId: "store_other" }),
    ).toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
