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
import {
  classifyMimeType,
  uploadHeaders,
} from "@/scripts/storage-acceptance/evidence";

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
      const respond = (httpStatus: number) => ({
        httpStatus,
        responseContentType: "application/json" as const,
      });
      const parsed = new URL(url);
      const path = parsed.searchParams.get("pathname")!;
      if (options.method === "GET") return respond(403);
      if (path !== parsed.searchParams.get("authorized")) return respond(403);
      const fixture = fixtures.find(
        (fixture) => fixture.reference.pathname === path,
      )!;
      const declaredMime =
        options.headers?.contentType ?? options.headers?.blobContentType;
      if (declaredMime !== fixture.input.mimeType) return respond(415);
      if (options.bytes!.length > fixture.input.sizeBytes) return respond(413);
      if (data.has(path)) return respond(409);
      data.set(path, options.bytes!);
      return respond(200);
    }),
    observe: vi.fn(async (ref) => {
      const bytes = data.get(ref.pathname);
      if (!bytes) return { state: "absent" as const };
      return {
        state: "present" as const,
        storedContentType: fixtures.find(
          (fixture) => fixture.reference.pathname === ref.pathname,
        )!.input.mimeType,
        declaredSizeBytes: bytes.byteLength,
      };
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
    expect(result.report.version).toBe(2);
    expect(result.report.mimeHeader).toBe("content-type");
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
    expect(report.operationsReserved).toBe(27);
    expect(h.port.observe).toHaveBeenCalledTimes(6);
    expect(report.checks.filter((check) => check.uploadEvidence)).toHaveLength(
      6,
    );
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
      if (status.httpStatus === 200) throw new Error(secret); // server stored it, response lost
      return status;
    };
    const remove = h.port.remove;
    h.port.remove = vi.fn(async () => {
      throw new Error(secret);
    });
    const report = prepareAcceptance(runId);
    await runAcceptance(report, h.port, h.save);
    expect(report.status).toBe("failed");
    expect(
      report.checks.find((check) => check.name === "png_uploaded"),
    ).toMatchObject({
      outcome: "failed",
      uploadEvidence: {
        observation: { state: "present", storedContentType: "image/png" },
      },
    });
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
    expect(await port.request(url, { method: "GET" })).toEqual({
      httpStatus: 403,
      responseContentType: "text/plain",
    });
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
    await expect(
      port.observe({ ...png!.reference, pathname: "foreign.png" }),
    ).rejects.toThrow();
    expect(() =>
      port.remove({ ...png!.reference, storeId: "store_other" }),
    ).toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("selects exactly one MIME header per run, including controls; no fallback", async () => {
    const h = harness();
    const report = prepareAcceptance(runId, "x-content-type");
    await runAcceptance(report, h.port, h.save);
    expect(report.status).toBe("passed");
    const uploads = vi
      .mocked(h.port.request)
      .mock.calls.filter(([, options]) => options.method === "PUT");
    expect(uploads).toHaveLength(6);
    expect(uploads.map(([, options]) => options.headers)).toEqual([
      uploadHeaders("x-content-type", "text/plain"),
      ...Array.from({ length: 4 }, () =>
        uploadHeaders("x-content-type", "image/png"),
      ),
      uploadHeaders("x-content-type", "application/pdf"),
    ]);
    expect(parseAcceptanceReport(report, runId)).toEqual(report);
  });

  it.each(["image/png", "text/plain"] as const)(
    "retains unexpected HTTP 200 and stored %s before cleanup, never passes it",
    async (storedContentType) => {
      const h = harness();
      h.port.request = vi.fn<AcceptancePort["request"]>(
        async (_url, options) => {
          h.data.set(h.fixtures[0]!.reference.pathname, options.bytes!);
          return { httpStatus: 200, responseContentType: "application/json" };
        },
      );
      h.port.observe = vi.fn<AcceptancePort["observe"]>(async () => ({
        state: "present",
        storedContentType,
        declaredSizeBytes: 68,
      }));
      const report = prepareAcceptance(runId);
      await runAcceptance(report, h.port, h.save);
      expect(report.status).toBe("failed");
      expect(report.checks.at(-1)).toMatchObject({
        name: "mime_refused",
        outcome: "failed",
        httpStatus: 200,
        responseContentType: "application/json",
        uploadEvidence: {
          sentHeaders: { contentType: "text/plain", blobContentType: null },
          observation: {
            state: "present",
            storedContentType,
            declaredSizeBytes: 68,
          },
          observedAt: expect.any(String),
        },
      });
      expect(h.port.request).toHaveBeenCalledTimes(1);
      expect(h.port.observe).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(h.port.observe).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(h.port.remove).mock.invocationCallOrder[0]!);
      expect(
        h.snapshots.some(
          (snapshot) =>
            snapshot.version === 2 &&
            snapshot.checks.at(-1)?.httpStatus === 200 &&
            !snapshot.checks.at(-1)?.uploadEvidence?.observation,
        ),
      ).toBe(true);
      expect(
        h.snapshots.some(
          (snapshot) =>
            snapshot.operationsReserved === 6 &&
            snapshot.uploadBytesReserved === 68 &&
            snapshot.checks.at(-1)?.httpStatus === undefined,
        ),
      ).toBe(true);
      expect(report.operationsReserved).toBe(12);
      expect(h.data.size).toBe(0);
      expect(parseAcceptanceReport(report, runId)).toEqual(report);
    },
  );

  it("does not confuse HTTP 200 HTML without an object with a successful upload", async () => {
    const h = harness();
    h.port.request = vi.fn<AcceptancePort["request"]>(async () => ({
      httpStatus: 200,
      responseContentType: "text/html",
    }));
    const report = prepareAcceptance(runId);
    await runAcceptance(report, h.port, h.save);
    expect(report.checks.at(-1)).toMatchObject({
      outcome: "failed",
      httpStatus: 200,
      responseContentType: "text/html",
      uploadEvidence: { observation: { state: "absent" } },
    });
    expect(report.status).toBe("failed");
  });

  it("fails even with an expected refusal if the object exists or observation is unavailable", async () => {
    for (const observe of [
      async () => ({
        state: "present" as const,
        storedContentType: "image/png" as const,
        declaredSizeBytes: 68,
      }),
      async () => {
        throw new Error(secret);
      },
    ]) {
      const h = harness();
      h.port.observe = observe;
      const report = prepareAcceptance(runId);
      await runAcceptance(report, h.port, h.save);
      expect(report.status).toBe("failed");
      expect(report.checks.at(-1)).toMatchObject({
        name: "mime_refused",
        httpStatus: 415,
        outcome: "failed",
      });
      expect(h.removed).toHaveLength(3);
      expect(JSON.stringify(report)).not.toContain(secret);
    }
  });

  it("reads legacy v1 reports for cleanup without upgrading, resetting counters or replaying", async () => {
    const { mimeHeader, ...base } = prepareAcceptance(runId);
    expect(mimeHeader).toBe("content-type");
    const legacy = {
      ...base,
      version: 1,
      status: "failed",
      operationsReserved: 11,
      uploadBytesReserved: 68,
      checks: [{ name: "mime_refused", httpStatus: 200, outcome: "failed" }],
      objects: base.objects.map((object) => ({
        ...object,
        cleanup: "absence_observed",
      })),
    };
    const report = parseAcceptanceReport(legacy, runId);
    expect(report).toEqual(legacy);
    const h = harness();
    await expect(runAcceptance(report, h.port, h.save)).rejects.toThrow(
      "cannot be replayed",
    );
    await expect(
      runAcceptance(
        parseAcceptanceReport(
          { ...legacy, status: "prepared", operationsReserved: 0 },
          runId,
        ),
        h.port,
        h.save,
      ),
    ).rejects.toThrow("cannot be replayed");
    await cleanupAcceptance(report, h.port, h.save);
    expect(report).toEqual({ ...legacy, operationsReserved: 17 });
    expect(h.port.request).not.toHaveBeenCalled();
    expect(h.port.observe).not.toHaveBeenCalled();
    expect(h.port.authorize).not.toHaveBeenCalled();
  });

  it("rejects MIME variant changes during cleanup and invalid variants before env loading", () => {
    for (const args of [
      ["--mime-header=unknown"],
      [
        "--execute",
        "--cleanup",
        `--run-id=${runId}`,
        "--mime-header=x-content-type",
      ],
    ]) {
      expect(() =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "--conditions=react-server",
            "src/scripts/verify-storage.ts",
            ...args,
          ],
          {
            stdio: "pipe",
            env: { ...process.env, BLOB_READ_WRITE_TOKEN: secret },
          },
        ),
      ).toThrow("Storage acceptance stopped (arguments)");
    }
  });

  it("sends the exact selected wire header, records classified response MIME and cancels bodies", async () => {
    vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
    const port = createAcceptancePort(acceptanceConfig(env, runId));
    const png = acceptanceFixtures(runId)[0]!;
    const cancel = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          status: 200,
          headers: { "Content-Type": `text/html; secret=${secret}` },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    for (const variant of ["content-type", "x-content-type"] as const) {
      const result = await port.request(
        `https://vercel.com/api/blob/?pathname=${png.reference.pathname}`,
        {
          method: "PUT",
          bytes: png.bytes,
          headers: uploadHeaders(variant, "text/plain"),
        },
      );
      expect(result).toEqual({
        httpStatus: 200,
        responseContentType: "text/html",
      });
      expect(fetch.mock.lastCall?.[1]).toMatchObject({
        headers:
          variant === "content-type"
            ? { "Content-Type": "text/plain" }
            : { "x-content-type": "text/plain" },
        redirect: "error",
        credentials: "omit",
      });
    }
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(classifyMimeType(`https://example.test/?token=${secret}`)).toBe(
      "other",
    );
    expect(classifyMimeType(null)).toBe("missing");
    expect(classifyMimeType("x".repeat(257))).toBe("other");
  });

  it("observes private metadata without reading a body or masking missing/invalid/provider errors", async () => {
    vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
    const port = createAcceptancePort(acceptanceConfig(env, runId));
    const png = acceptanceFixtures(runId)[0]!;
    const cancel = vi.fn();
    for (const [size, pathname, contentType, expected] of [
      [
        68,
        png.reference.pathname,
        "image/png",
        {
          state: "present",
          storedContentType: "image/png",
          declaredSizeBytes: 68,
        },
      ],
      [
        68,
        png.reference.pathname,
        secret,
        { state: "present", storedContentType: "other", declaredSizeBytes: 68 },
      ],
      [-1, png.reference.pathname, "image/png", { state: "invalid_metadata" }],
      [NaN, png.reference.pathname, "image/png", { state: "invalid_metadata" }],
      [68, "foreign.png", "image/png", { state: "invalid_metadata" }],
      [
        25 * 1024 * 1024 + 1,
        png.reference.pathname,
        "application/pdf",
        { state: "size_exceeds_limit" },
      ],
    ] as const) {
      vi.mocked(get).mockResolvedValueOnce({
        statusCode: 200,
        stream: new ReadableStream({ cancel }),
        headers: new Headers({
          "content-length": String(size),
          "content-type": contentType,
        }),
        blob: {
          size,
          pathname,
          contentType,
          url: "https://private.example/secret",
          downloadUrl: "https://private.example/secret",
          uploadedAt: new Date(),
          contentDisposition: "",
          cacheControl: "",
          etag: secret,
        },
      });
      expect(await port.observe(png.reference)).toEqual(expected);
    }
    expect(cancel).toHaveBeenCalledTimes(6);
    expect(get).toHaveBeenLastCalledWith(
      png.reference.pathname,
      expect.objectContaining({
        access: "private",
        token: env.BLOB_READ_WRITE_TOKEN,
        useCache: false,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    vi.mocked(get).mockResolvedValueOnce(null);
    expect(await port.observe(png.reference)).toEqual({ state: "absent" });
    vi.mocked(get).mockRejectedValueOnce(new Error(secret));
    await expect(port.observe(png.reference)).rejects.toThrow(); // caller records unavailable, never absence
  });
});
