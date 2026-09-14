import { z } from "zod";
import { documentSourceIdSchema } from "./document-source";
import { checksumSchema } from "./private-storage";

// Versioned technical budgets, not business coefficients. See TECH-05 runbook.
export const documentProcessingPolicy = {
  version: "pdf-text-1",
  maxPages: 60,
  maxPageCharacters: 20_000,
  maxTotalCharacters: 120_000,
  maxJobsPerStore: 20,
  maxAttempts: 3,
  leaseMs: 120_000,
  retryMs: 60_000,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export const extractedPagesSchema = z
  .object({
    extractorVersion: z.literal("pdfium-2.1.13-text-1"),
    pages: z
      .array(
        z
          .object({
            page: z.number().int().min(1).max(60),
            text: z.string().max(documentProcessingPolicy.maxPageCharacters),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.pages.some((page, index) => page.page !== index + 1) ||
      value.pages.reduce((sum, page) => sum + page.text.length, 0) >
        documentProcessingPolicy.maxTotalCharacters
    )
      ctx.addIssue({
        code: "custom",
        message: "Extraction hors limites ou pages incohérentes",
      });
  });
export type ExtractedPages = z.infer<typeof extractedPagesSchema>;

export const processingStateSchema = z.enum([
  "queued",
  "running",
  "failed",
  "ready",
  "cancelled",
]);
export const processingErrorSchema = z.enum([
  "temporary",
  "invalid_pdf",
  "budget_exhausted",
  "source_unavailable",
]);
export const processingStatusSchema = z
  .object({
    sourceId: documentSourceIdSchema,
    checksumSha256: checksumSchema,
    policyVersion: z.literal(documentProcessingPolicy.version),
    state: processingStateSchema,
    attempts: z.number().int().min(0).max(documentProcessingPolicy.maxAttempts),
    checkpoint: z.enum(["queued", "validated", "extracted"]),
    error: processingErrorSchema.nullable(),
    expiresAt: z.iso.datetime(),
    nextAttemptAt: z.iso.datetime(),
    result: extractedPagesSchema.nullable(),
    reviewState: z.literal("unreviewed"),
    indexing: z.literal("not_requested"),
    providerSpendCents: z.literal(0),
  })
  .strict();
