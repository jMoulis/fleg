import * as z from "zod";
import { documentMaxSizeBytes } from "@/domain/attachments/private-storage";

export const mimeHeaderSchema = z.enum(["content-type", "x-content-type"]);
export type MimeHeader = z.infer<typeof mimeHeaderSchema>;

const knownMimeTypes = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/octet-stream",
  "application/json",
  "text/plain",
  "text/html",
]);
const mimeClassSchema = z.enum([...knownMimeTypes.options, "other", "missing"]);

// Never retain arbitrary headers: they can contain URLs, tokens or user data.
// Parameters (e.g. charset) are deliberately excluded from this diagnostic.
export function classifyMimeType(
  value: unknown,
): z.infer<typeof mimeClassSchema> {
  if (value === null || value === undefined || value === "") return "missing";
  if (typeof value !== "string" || value.length > 256) return "other";
  const parsed = knownMimeTypes.safeParse(
    value.split(";", 1)[0]!.trim().toLowerCase(),
  );
  return parsed.success ? parsed.data : "other";
}

export const httpEvidenceSchema = z
  .object({
    httpStatus: z.number().int().min(100).max(599),
    responseContentType: mimeClassSchema,
  })
  .strict();
export type HttpEvidence = z.infer<typeof httpEvidenceSchema>;

export const objectObservationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("absent") }).strict(),
  z
    .object({
      state: z.literal("present"),
      storedContentType: mimeClassSchema,
      // Provider-declared metadata, NOT a checksum or a validated body length.
      declaredSizeBytes: z.number().int().min(0).max(documentMaxSizeBytes),
    })
    .strict(),
  z
    .object({
      state: z.enum(["unavailable", "invalid_metadata", "size_exceeds_limit"]),
    })
    .strict(),
]);

export const uploadEvidenceSchema = z
  .object({
    sentHeaders: z
      .object({
        contentType: knownMimeTypes.nullable(),
        blobContentType: knownMimeTypes.nullable(),
      })
      .strict(),
    observation: objectObservationSchema.optional(),
    observedAt: z.iso.datetime().optional(),
  })
  .strict();

export type UploadHeaders = z.infer<typeof uploadEvidenceSchema>["sentHeaders"];

// One variant per run. All PUTs use the selected header, including controls;
// there is no fallback that could silently turn the historical failure green.
export function uploadHeaders(
  header: MimeHeader,
  mimeType: "image/png" | "application/pdf" | "text/plain",
): UploadHeaders {
  return {
    contentType: header === "content-type" ? mimeType : null,
    blobContentType: header === "x-content-type" ? mimeType : null,
  };
}
