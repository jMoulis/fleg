import * as z from "zod";

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.uuid(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
