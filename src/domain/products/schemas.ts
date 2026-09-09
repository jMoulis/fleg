import * as z from "zod";

import { periodKeySchema } from "@/domain/imports/schemas";

export const productOptionSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  label: z.string().min(1),
});
export type ProductOption = z.infer<typeof productOptionSchema>;

export const productOptionsResponseSchema = z.object({
  products: z.array(productOptionSchema),
  requestId: z.uuid(),
});

export const productMatrixQuerySchema = z.object({
  period: periodKeySchema.optional(),
  q: z.string().trim().max(120).default(""),
  abc: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["A", "B", "C"]).optional(),
  ),
  xyz: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["X", "Y", "Z", "unclassified"]).optional(),
  ),
  sort: z
    .enum(["revenue_desc", "margin_desc", "forecast_desc", "label_asc"])
    .default("revenue_desc"),
});
