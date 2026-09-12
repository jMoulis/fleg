import { createHash } from "node:crypto";
import * as z from "zod";
import {
  documentMaxSizeBytes,
  type PrivateBlobReference,
  type UploadIntentInput,
} from "@/domain/attachments/private-storage";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";

export const acceptanceStoreId = "store_5MOJSflf0L273Hz3";
export const acceptanceLimits = {
  paths: 3,
  uploadedBytes: 30 * 1024 * 1024,
  operations: 100,
} as const;
export const acceptanceContext: AuthorizedStoreContext = {
  organizationId: "tech04-synthetic-acceptance-only",
  storeId: "000000000000000000000004",
  userId: "local-acceptance-operator",
  role: "department_manager",
  permissions: ["stores.read", "attachments.write"],
};
const checkNames = [
  "empty_paths",
  "png_authorized",
  "mime_refused",
  "size_refused",
  "path_refused",
  "png_uploaded",
  "overwrite_refused",
  "png_private_read",
  "anonymous_refused",
  "get_with_put_signature_refused",
  "pdf_authorized",
  "pdf_uploaded",
  "pdf_private_read",
  "pdf_parsed_locally",
] as const;
const reportSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    storeId: z.literal(acceptanceStoreId),
    createdAt: z.iso.datetime(),
    status: z.enum(["prepared", "running", "passed", "failed"]),
    releaseReady: z.literal(false),
    operationsReserved: z
      .number()
      .int()
      .min(0)
      .max(acceptanceLimits.operations),
    uploadBytesReserved: z
      .number()
      .int()
      .min(0)
      .max(acceptanceLimits.uploadedBytes),
    checks: z
      .array(
        z
          .object({
            name: z.enum(checkNames),
            outcome: z.enum(["passed", "failed"]),
            httpStatus: z.number().int().min(100).max(599).optional(),
          })
          .strict(),
      )
      .max(checkNames.length),
    objects: z
      .array(
        z
          .object({
            pathname: z.string().max(300),
            sizeBytes: z.number().int().nonnegative().max(documentMaxSizeBytes),
            checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
            cleanup: z.enum(["untouched", "pending", "absence_observed"]),
            authorizationValidUntil: z.iso.datetime().optional(),
          })
          .strict(),
      )
      .length(acceptanceLimits.paths),
  })
  .strict();
export type AcceptanceReport = z.infer<typeof reportSchema>;
type CheckName = (typeof checkNames)[number];

export function acceptanceNamespace(runId: string) {
  return `local-acceptance-${z.uuid().parse(runId)}`;
}

// A blank PDF with real xref offsets. Padding is one comment before objects,
// not trailing bytes after EOF. No customer document, image or business data.
export function syntheticPdf(size = documentMaxSizeBytes): Uint8Array {
  function build(padding: number) {
    let text = `%PDF-1.7\n%${" ".repeat(padding)}\n`;
    const offsets: number[] = [];
    for (const object of [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ]) {
      offsets.push(text.length);
      text += `${offsets.length} 0 obj\n${object}\nendobj\n`;
    }
    const start = text.length;
    text += "xref\n0 4\n0000000000 65535 f \n";
    text += offsets
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("");
    return `${text}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  }
  if (!Number.isInteger(size) || size < 512 || size > documentMaxSizeBytes)
    throw new Error("Invalid synthetic fixture size");
  let padding = size - build(0).length;
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = build(padding);
    if (text.length === size) return new TextEncoder().encode(text);
    padding += size - text.length;
  }
  throw new Error("Invalid synthetic fixture");
}

export function acceptanceFixtures(runId: string) {
  const namespace = acceptanceNamespace(runId);
  const organizationHash = createHash("sha256")
    .update(acceptanceContext.organizationId)
    .digest("hex");
  const prefix = `fleg/${namespace}/${organizationHash}/${acceptanceContext.storeId}/${runId}`;
  const png = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEioAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  return [
    { extension: "png", bytes: png, mimeType: "image/png" as const },
    {
      extension: "pdf",
      bytes: syntheticPdf(),
      mimeType: "application/pdf" as const,
    },
    // The deliberately forged destination is also owned by this run. Never
    // probe an existing/foreign tenant's object, even for a negative test.
    { extension: "webp", bytes: png, mimeType: "image/png" as const },
  ].map(({ extension, bytes, mimeType }) => ({
    bytes,
    reference: {
      backend: "vercel_blob" as const,
      storeId: acceptanceStoreId,
      namespace,
      pathname: `${prefix}.${extension}`,
    },
    input: {
      idempotencyKey: runId,
      originalFileName: `synthetic.${extension}`,
      caption: null,
      target: { type: "store" as const },
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      ...(mimeType === "application/pdf"
        ? { kind: "document" as const, mimeType }
        : { kind: "photo" as const, mimeType }),
    } satisfies UploadIntentInput,
  }));
}

export function prepareAcceptance(runId: string): AcceptanceReport {
  return {
    version: 1,
    runId,
    storeId: acceptanceStoreId,
    createdAt: new Date().toISOString(),
    status: "prepared",
    releaseReady: false,
    operationsReserved: 0,
    uploadBytesReserved: 0,
    checks: [],
    objects: acceptanceFixtures(runId).map(({ reference, input }) => ({
      pathname: reference.pathname,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      cleanup: "untouched",
    })),
  };
}

export function parseAcceptanceReport(raw: unknown, runId: string) {
  const report = reportSchema.parse(raw);
  const expected = prepareAcceptance(runId);
  if (
    report.runId !== runId ||
    report.objects.some(
      (object, index) =>
        object.pathname !== expected.objects[index]!.pathname ||
        object.sizeBytes !== expected.objects[index]!.sizeBytes ||
        object.checksumSha256 !== expected.objects[index]!.checksumSha256,
    )
  )
    throw new Error("Acceptance manifest does not match this run");
  return report;
}

// CLI-only dependency seam. Nothing in app routes imports this harness.
// One operation = one HTTP attempt; the CLI forces the pinned SDK's retries
// to zero. remove() reserves two attempts: DELETE then an origin-fresh GET.
export interface AcceptancePort {
  absent(reference: PrivateBlobReference): Promise<boolean>;
  authorize(
    reference: PrivateBlobReference,
    input: UploadIntentInput,
    validUntil: number,
  ): Promise<string>;
  request(
    url: string,
    options: { method: "GET" | "PUT"; bytes?: Uint8Array; mimeType?: string },
  ): Promise<number>;
  read(
    reference: PrivateBlobReference,
    input: UploadIntentInput,
  ): Promise<Uint8Array | null>;
  remove(reference: PrivateBlobReference): Promise<void>;
  validatePdf(bytes: Uint8Array): Promise<{ pageCount: number }>;
  anonymousUrl(reference: PrivateBlobReference): string;
  changePath(url: string, reference: PrivateBlobReference): string;
}
type SaveReport = (report: AcceptanceReport) => Promise<void>;

async function reserve(
  report: AcceptanceReport,
  save: SaveReport,
  operations: number,
  bytes = 0,
  cleanup = false,
) {
  // Keep six attempts available for finally/cleanup even when a check fails.
  const ceiling =
    acceptanceLimits.operations - (cleanup ? 0 : acceptanceLimits.paths * 2);
  if (
    report.operationsReserved + operations > ceiling ||
    report.uploadBytesReserved + bytes > acceptanceLimits.uploadedBytes
  )
    throw new Error("Acceptance budget exhausted");
  report.operationsReserved += operations;
  report.uploadBytesReserved += bytes;
  await save(report); // durable BEFORE remote side effects/capabilities
}

export async function cleanupAcceptance(
  report: AcceptanceReport,
  port: AcceptancePort,
  save: SaveReport,
) {
  const fixtures = acceptanceFixtures(report.runId);
  for (const [index, object] of report.objects.entries()) {
    // Recheck previously observed absence on an explicit recovery run. The
    // report is retained; absence is NOT a provider in-flight lifetime proof.
    if (object.cleanup === "untouched") continue;
    object.cleanup = "pending";
    try {
      await reserve(report, save, 2, 0, true);
      await port.remove(fixtures[index]!.reference);
      object.cleanup = "absence_observed";
    } catch {
      object.cleanup = "pending";
    }
    await save(report);
  }
}

export async function runAcceptance(
  report: AcceptanceReport,
  port: AcceptancePort,
  save: SaveReport,
) {
  if (report.status !== "prepared" || report.operationsReserved !== 0)
    throw new Error("An acceptance run cannot be replayed; cleanup only");
  const [png, pdf, forged] = acceptanceFixtures(report.runId);
  if (!png || !pdf || !forged) throw new Error("Missing fixtures");
  report.status = "running";
  let current: CheckName = "empty_paths";
  async function check(
    name: CheckName,
    action: () => Promise<boolean | number>,
    accepted?: readonly number[],
  ) {
    current = name;
    const result = await action();
    const passed =
      typeof result === "boolean"
        ? result
        : accepted?.includes(result) === true;
    report.checks.push({
      name,
      outcome: passed ? "passed" : "failed",
      ...(typeof result === "number" ? { httpStatus: result } : {}),
    });
    await save(report);
    if (!passed) throw new Error("Provider check failed");
  }
  async function request(
    url: string,
    method: "GET" | "PUT",
    bytes?: Uint8Array,
    mimeType?: string,
  ) {
    await reserve(report, save, 1, bytes?.byteLength ?? 0);
    return port.request(url, { method, bytes, mimeType });
  }
  async function authorize(index: number) {
    const fixture = index === 0 ? png! : pdf!;
    const validUntil = Date.now() + 10 * 60 * 1000;
    report.objects[index]!.authorizationValidUntil = new Date(
      validUntil,
    ).toISOString();
    await reserve(report, save, 1);
    return port.authorize(fixture.reference, fixture.input, validUntil);
  }
  try {
    await check("empty_paths", async () => {
      for (const fixture of [png, pdf, forged]) {
        await reserve(report, save, 1);
        if (!(await port.absent(fixture.reference))) return false;
      }
      return true;
    });
    // All exact paths must be confirmed absent before acquiring ownership for
    // cleanup. A collision/uncertain preflight never deletes an existing file.
    report.objects.forEach((object) => {
      object.cleanup = "pending";
    });
    await save(report);
    let url = "";
    await check("png_authorized", async () => {
      url = await authorize(0);
      return true;
    });
    await check(
      "mime_refused",
      () => request(url, "PUT", png.bytes, "text/plain"),
      [400, 403, 415],
    );
    await check(
      "size_refused",
      () =>
        request(url, "PUT", new Uint8Array(png.bytes.length + 1), "image/png"),
      [400, 403, 413],
    );
    await check(
      "path_refused",
      () =>
        request(
          port.changePath(url, forged.reference),
          "PUT",
          png.bytes,
          "image/png",
        ),
      [400, 403],
    );
    await check(
      "png_uploaded",
      () => request(url, "PUT", png.bytes, "image/png"),
      [200, 201],
    );
    await check(
      "overwrite_refused",
      () => request(url, "PUT", png.bytes, "image/png"),
      [400, 403, 409, 412],
    );
    await check("png_private_read", async () => {
      await reserve(report, save, 1);
      return (await port.read(png.reference, png.input)) !== null;
    });
    await check(
      "anonymous_refused",
      () => request(port.anonymousUrl(png.reference), "GET"),
      [401, 403, 404],
    );
    // Probe the actual private read endpoint, not a malformed GET to the
    // upload API (which could fail only because its query format is wrong).
    const signedRead = new URL(port.anonymousUrl(png.reference));
    for (const [key, value] of new URL(url).searchParams) {
      if (key !== "pathname") signedRead.searchParams.set(key, value);
    }
    await check(
      "get_with_put_signature_refused",
      () => request(signedRead.toString(), "GET"),
      [400, 401, 403, 405],
    );
    let pdfUrl = "";
    await check("pdf_authorized", async () => {
      pdfUrl = await authorize(1);
      return true;
    });
    await check(
      "pdf_uploaded",
      () => request(pdfUrl, "PUT", pdf.bytes, "application/pdf"),
      [200, 201],
    );
    let downloaded: Uint8Array | null = null;
    await check("pdf_private_read", async () => {
      await reserve(report, save, 1);
      downloaded = await port.read(pdf.reference, pdf.input);
      return downloaded !== null;
    });
    await check(
      "pdf_parsed_locally",
      async () =>
        downloaded !== null &&
        (await port.validatePdf(downloaded)).pageCount === 1,
    );
    report.status = "passed";
  } catch {
    report.status = "failed";
    if (
      !report.checks.some(
        (check) => check.name === current && check.outcome === "failed",
      )
    )
      report.checks.push({ name: current, outcome: "failed" });
  } finally {
    await save(report);
    await cleanupAcceptance(report, port, save);
  }
  return report;
}
