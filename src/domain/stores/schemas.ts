import * as z from "zod";

export const storePermissionValues = [
  "stores.read",
  "stores.manage",
  "analytics.read",
  "analytics.compare_stores",
  "imports.create",
  "imports.commit",
  "targets.write",
  "layouts.write",
  "allocations.write",
  "markdown.write",
  "recommendations.approve",
  "tg.publish",
  "experiments.read",
  "experiments.write",
  "experiments.start",
  "experiments.conclude",
  "experiments.compare_stores",
  "settings.write",
  "ai.use",
] as const;

export const storePermissionSchema = z.enum(storePermissionValues);
export type StorePermission = z.infer<typeof storePermissionSchema>;

export const storeRoleSchema = z.enum([
  "organization_admin",
  "store_director",
  "department_manager",
  "employee",
  "viewer",
]);
export type StoreRole = z.infer<typeof storeRoleSchema>;

export const storeIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Identifiant magasin invalide");

export const storeSummarySchema = z.object({
  id: storeIdSchema,
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
});
export type StoreSummary = z.infer<typeof storeSummarySchema>;

export const authorizedStoreContextSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  storeId: storeIdSchema,
  role: storeRoleSchema,
  permissions: z.array(storePermissionSchema),
});
export type AuthorizedStoreContext = z.infer<
  typeof authorizedStoreContextSchema
>;

export const storesResponseSchema = z.object({
  stores: z.array(storeSummarySchema),
  requestId: z.uuid(),
});
