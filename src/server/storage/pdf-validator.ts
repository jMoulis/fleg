import "server-only";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import * as z from "zod";
import {
  extractedPagesSchema,
  type ExtractedPages,
} from "@/domain/attachments/document-processing";
import {
  documentMaxSizeBytes,
  PrivateStorageError,
} from "@/domain/attachments/private-storage";

export const pdfValidationSchema = z
  .object({
    pageCount: z.number().int().min(1).max(60),
    // Existing persisted verification records remain valid after upgrades.
    parserVersion: z.enum(["pdfium-2.1.13-fleg-1", "pdfium-2.1.13-fleg-2"]),
  })
  .strict();
export type PdfValidation = z.infer<typeof pdfValidationSchema>;
const parseTimeoutMs = 10000;
let parsing = false;

export class PdfValidatorUnavailableError extends PrivateStorageError {
  constructor() {
    super("STORAGE_UNAVAILABLE", "Validation PDF temporairement indisponible");
  }
}

export async function validatePdf(bytes: Uint8Array): Promise<PdfValidation> {
  return pdfValidationSchema.parse(await parsePdf(bytes, false));
}

export async function extractPdfText(
  bytes: Uint8Array,
): Promise<ExtractedPages> {
  return extractedPagesSchema.parse(await parsePdf(bytes, true));
}

async function parsePdf(
  bytes: Uint8Array,
  extractText: boolean,
): Promise<unknown> {
  if (
    bytes.length < 8 ||
    bytes.length > documentMaxSizeBytes ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw new PrivateStorageError("STORAGE_INTEGRITY", "PDF non reconnu");
  // Bound simultaneous parsers per function process; other work is retryable.
  if (parsing)
    throw new PrivateStorageError(
      "STORAGE_UNAVAILABLE",
      "Validation occupée, réessayez",
    );
  parsing = true;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const fail = () =>
        reject(
          new PrivateStorageError(
            "STORAGE_INTEGRITY",
            "PDF non analysable dans les limites autorisées",
          ),
        );
      const unavailable = () => reject(new PdfValidatorUnavailableError());
      worker = new Worker(
        join(process.cwd(), "src/server/storage/pdf-validator.worker.mjs"),
        {
          workerData: {
            bytes,
            maxPages: 60,
            wasmMemoryPages: 4096,
            extractText,
          },
          // JS heap and WASM linear memory have separate ceilings: 96 and 256 MiB.
          resourceLimits: {
            maxOldGenerationSizeMb: 96,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
          },
          env: {},
          stdout: true,
          stderr: true,
        },
      );
      worker.stdout?.resume();
      worker.stderr?.resume();
      timer = setTimeout(fail, parseTimeoutMs);
      worker.once("message", (message: unknown) => {
        const result = (
          extractText ? extractedPagesSchema : pdfValidationSchema
        ).safeParse(message);
        if (result.success) resolve(result.data);
        else if (
          z
            .object({ error: z.literal("PDF_UNREADABLE") })
            .strict()
            .safeParse(message).success
        )
          fail();
        else unavailable();
      });
      worker.once("error", unavailable);
      worker.once("exit", unavailable);
    });
  } finally {
    clearTimeout(timer);
    await worker?.terminate();
    parsing = false;
  }
}
