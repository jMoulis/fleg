import * as z from "zod";

export const healthStatusSchema = z.enum(["ok", "unhealthy"]);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  services: z.object({
    database: z.enum(["up", "down"]),
  }),
  requestId: z.uuid(),
  checkedAt: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
