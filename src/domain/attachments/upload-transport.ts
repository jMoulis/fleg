import * as z from "zod";
import {
  privateBlobReferenceSchema,
  uploadIntentInputSchema,
} from "@/domain/attachments/private-storage";

// A fixed ceiling per intent: retries must never extend an already-issued grant.
export const uploadAuthorizationLifetimeMs = 10 * 60 * 1000;
export const uploadAuthorizationMaxIssuances = 6; // Initial attempt + five retries.
export const uploadCallbackMaxBodyBytes = 16 * 1024;
export const uploadCommandSchema = z.object({}).strict();
export const uploadCorrelationSchema = z
  .object({
    intentId: z.uuid(),
    attemptId: z.uuid(),
  })
  .strict();

// Server-internal contract. Neither this object nor signing material is a receipt.
export const uploadGrantSchema = uploadCorrelationSchema
  .extend({
    storage: privateBlobReferenceSchema,
    input: uploadIntentInputSchema,
    issuedAt: z.iso.datetime(),
    validUntil: z.iso.datetime(),
  })
  .strict();
export type UploadGrant = z.infer<typeof uploadGrantSchema>;

export const signedUploadSchema = z
  .object({
    method: z.literal("PUT"),
    url: z.url().max(12000),
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    validUntil: z.iso.datetime(),
  })
  .strict();

// Passthrough is deliberate: the SDK authenticates JSON.stringify(originalBody).
// Validate the shape but do not reorder/strip properties before verification.
export const providerCompletionSchema = z
  .object({
    type: z.literal("blob.upload-completed"),
    payload: z
      .object({
        blob: z
          .object({
            url: z.url().max(2048),
            downloadUrl: z.url().max(2048),
            pathname: z.string().min(1).max(512),
            contentType: z.string().min(1).max(100),
            contentDisposition: z.string().max(1024),
            etag: z.string().max(256),
          })
          .passthrough(),
        tokenPayload: z.string().min(1).max(512),
      })
      .passthrough(),
  })
  .passthrough();

export type ProviderCompletion = z.infer<typeof uploadCorrelationSchema> & {
  pathname: string;
  url: string;
  contentType: string;
};
