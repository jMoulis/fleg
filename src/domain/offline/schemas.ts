import { z } from "zod";

import {
  inventoryCountLineSchema,
  inventoryProductProfileSchema,
} from "@/domain/inventory/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

// This version contains read-only copies, never editable drafts or an outbox.
export const offlineIdentitySchema = z.object({
  userId: z.string().min(1),
  sessionBinding: z.string().regex(/^[a-f0-9]{64}$/),
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
});
export type OfflineIdentity = z.infer<typeof offlineIdentitySchema>;

export const preparedWorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: offlineIdentitySchema,
    storeName: z.string().min(1),
    businessDate: z.iso.date(),
    preparedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    purgeAt: z.iso.datetime(),
    dataRevision: z.number().int().nonnegative(),
    productCount: z.number().int().min(0).max(2_000),
    countReference: z
      .object({
        id: storeIdSchema,
        version: z.number().int().positive(),
        revision: z.number().int().nonnegative(),
        status: z.enum(["draft", "committed"]),
      })
      .nullable(),
    products: z
      .array(
        z.object({
          id: storeIdSchema,
          label: z.string().min(1),
          profile: inventoryProductProfileSchema
            .pick({
              familyCode: true,
              stockUnit: true,
              lastPackSize: true,
              revision: true,
            })
            .nullable(),
          countLine: inventoryCountLineSchema.nullable(),
          lastStock: z
            .object({
              quantity: z.number().finite(),
              unit: z.enum(["kg", "piece"]),
              observedAt: z.iso.datetime(),
            })
            .nullable(),
        }),
      )
      .max(2_000),
  })
  .superRefine((value, context) => {
    if (
      value.products.length !== value.productCount ||
      new Set(value.products.map(({ id }) => id)).size !== value.productCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Catalogue incomplet ou dupliqué",
      });
    }
    if (
      value.products.some(
        (product) =>
          product.countLine && product.countLine.productId !== product.id,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Référence de comptage invalide",
      });
    }
    if (
      Date.parse(value.preparedAt) >= Date.parse(value.expiresAt) ||
      Date.parse(value.expiresAt) > Date.parse(value.purgeAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Durée de conservation invalide",
      });
    }
  });
export type PreparedWorkspace = z.infer<typeof preparedWorkspaceSchema>;

export function sameOfflineIdentity(
  a: OfflineIdentity,
  b: OfflineIdentity,
): boolean {
  return (
    a.userId === b.userId &&
    a.sessionBinding === b.sessionBinding &&
    a.organizationId === b.organizationId &&
    a.storeId === b.storeId
  );
}

export function offlineFreshness(workspace: PreparedWorkspace, now: number) {
  if (now < Date.parse(workspace.preparedAt)) return "clock_error";
  if (now >= Date.parse(workspace.purgeAt)) return "purged";
  if (now >= Date.parse(workspace.expiresAt)) return "expired";
  return "ready";
}
