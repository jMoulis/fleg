import * as z from "zod";
import { checksumSchema, documentMaxSizeBytes } from "./private-storage";
export const documentSourceIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const documentSourceSchema = z.object({
  id: documentSourceIdSchema,
  originalFileName: z.string().min(1).max(180),
  caption: z.string().max(300).nullable(),
  sizeBytes: z.number().int().positive().max(documentMaxSizeBytes),
  checksumSha256: checksumSchema,
  pageCount: z.number().int().min(1).max(60),
  createdAt: z.iso.datetime(),
  contentUrl: z.string().startsWith("/api/stores/"),
});
export const documentSourceListSchema = z.object({
  sources: z.array(documentSourceSchema).max(20),
  nextCursor: documentSourceIdSchema.nullable(),
});
export const maintenanceResultSchema = z.discriminatedUnion("processed", [
  z.object({ processed: z.literal(false) }).strict(),
  z
    .object({
      processed: z.literal(true),
      id: z.uuid(),
      outcome: z.enum([
        "waiting",
        "cleanup_pending",
        "deleted",
        "linked",
        "superseded",
        "rejected",
        "retry",
      ]),
    })
    .strict(),
]);
