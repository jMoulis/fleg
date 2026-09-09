import * as z from "zod";

import {
  storeIdSchema,
  storePermissionSchema,
  type StorePermission,
} from "@/domain/stores/schemas";
import { organizationRoleSchema } from "@/domain/admin/authorization";

export const organizationSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Utilisez des minuscules, chiffres et tirets",
  );

export const storeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "Code magasin invalide");

export const storeNameSchema = z.string().trim().min(2).max(160);

export const storeAdminSummarySchema = z.object({
  id: storeIdSchema,
  organizationId: z.string().min(1),
  code: storeCodeSchema,
  name: storeNameSchema,
  active: z.boolean(),
  dataRevision: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StoreAdminSummary = z.infer<typeof storeAdminSummarySchema>;

export const storeCreateInputSchema = z.object({
  organizationId: z.string().min(1),
  code: storeCodeSchema,
  name: storeNameSchema,
  idempotencyKey: z.uuid(),
});
export type StoreCreateInput = z.infer<typeof storeCreateInputSchema>;

export const storeUpdateInputSchema = z.object({
  code: storeCodeSchema,
  name: storeNameSchema,
  active: z.boolean(),
  basedOnUpdatedAt: z.iso.datetime(),
  idempotencyKey: z.uuid(),
});
export type StoreUpdateInput = z.infer<typeof storeUpdateInputSchema>;

export const editableStoreRoleSchema = z.enum([
  "store_director",
  "department_manager",
  "employee",
  "viewer",
]);
export type EditableStoreRole = z.infer<typeof editableStoreRoleSchema>;

export const defaultStorePermissionsByRole = {
  store_director: storePermissionSchema.options,
  department_manager: [
    "stores.read",
    "analytics.read",
    "analytics.compare_stores",
    "imports.create",
    "imports.commit",
    "targets.write",
    "layouts.write",
    "allocations.write",
    "attachments.write",
    "markdown.write",
    "inventory.read",
    "inventory.write",
    "context.write",
    "recommendations.approve",
    "tg.publish",
    "experiments.read",
    "experiments.write",
    "experiments.start",
    "experiments.conclude",
    "experiments.compare_stores",
    "ai.use",
  ],
  employee: [
    "stores.read",
    "analytics.read",
    "imports.create",
    "markdown.write",
    "inventory.read",
    "inventory.write",
    "experiments.read",
  ],
  viewer: [
    "stores.read",
    "analytics.read",
    "inventory.read",
    "experiments.read",
  ],
} satisfies Record<EditableStoreRole, readonly StorePermission[]>;

export const storeMembershipWriteInputSchema = z
  .object({
    userId: z.string().min(1),
    role: editableStoreRoleSchema,
    permissions: z.array(storePermissionSchema).max(storePermissionSchema.options.length),
    active: z.boolean(),
    idempotencyKey: z.uuid(),
  })
  .superRefine((input, context) => {
    if (new Set(input.permissions).size !== input.permissions.length) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Une permission ne peut être attribuée qu'une fois",
      });
    }
    if (input.active && !input.permissions.includes("stores.read")) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Un accès actif doit permettre la lecture du magasin",
      });
    }
  });
export type StoreMembershipWriteInput = z.infer<
  typeof storeMembershipWriteInputSchema
>;

export const storeMembershipAdminSchema = z.object({
  storeId: storeIdSchema,
  userId: z.string().min(1),
  role: editableStoreRoleSchema,
  permissions: z.array(storePermissionSchema),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StoreMembershipAdmin = z.infer<
  typeof storeMembershipAdminSchema
>;

export const organizationMemberAdminSchema = z.object({
  memberId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  organizationRole: organizationRoleSchema,
  storeAccesses: z.array(storeMembershipAdminSchema),
});
export type OrganizationMemberAdmin = z.infer<
  typeof organizationMemberAdminSchema
>;

export const organizationInvitationSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "member"]),
  status: z.enum(["pending", "accepted", "rejected", "canceled"]),
  expiresAt: z.iso.datetime(),
});
export type OrganizationInvitation = z.infer<
  typeof organizationInvitationSchema
>;

export const organizationInvitationCreateInputSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member"]),
  resend: z.boolean().default(false),
});

export const organizationAdminWorkspaceSchema = z.object({
  organization: z.object({
    id: z.string().min(1),
    slug: organizationSlugSchema,
    name: z.string().min(1),
  }),
  stores: z.array(storeAdminSummarySchema),
  members: z.array(organizationMemberAdminSchema),
  invitations: z.array(organizationInvitationSchema),
});
export type OrganizationAdminWorkspace = z.infer<
  typeof organizationAdminWorkspaceSchema
>;

export const organizationCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: organizationSlugSchema,
  firstStore: z.object({
    code: storeCodeSchema,
    name: storeNameSchema,
  }),
  idempotencyKey: z.uuid(),
});
export type OrganizationCreateInput = z.infer<
  typeof organizationCreateInputSchema
>;

export const storeAdminResponseSchema = z.object({
  store: storeAdminSummarySchema,
  requestId: z.uuid(),
});

export const storeMembershipAdminResponseSchema = z.object({
  membership: storeMembershipAdminSchema,
  requestId: z.uuid(),
});

export const organizationAdminWorkspaceResponseSchema =
  organizationAdminWorkspaceSchema.extend({ requestId: z.uuid() });

export const organizationCreateResponseSchema = z.object({
  organization: organizationAdminWorkspaceSchema.shape.organization,
  store: storeAdminSummarySchema,
  requestId: z.uuid(),
});

export const managedOrganizationsResponseSchema = z.object({
  organizations: z.array(
    z.object({
      userId: z.string().min(1),
      organizationId: z.string().min(1),
      organizationSlug: organizationSlugSchema,
      organizationName: z.string().min(1),
      role: z.enum(["owner", "admin"]),
    }),
  ),
  requestId: z.uuid(),
});

export const organizationInvitationResponseSchema = z.object({
  invitation: organizationInvitationSchema,
  acceptPath: z.string().startsWith("/invitations/"),
  delivery: z.object({
    mode: z.enum(["manual", "email"]),
    status: z.enum(["manual", "sent", "failed"]),
  }),
  requestId: z.uuid(),
});

export const recipientInvitationSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "member"]),
  status: z.literal("pending"),
  expiresAt: z.iso.datetime(),
  organizationId: z.string().min(1),
  organizationName: z.string().min(1),
  organizationSlug: organizationSlugSchema,
  inviterEmail: z.email(),
});
export type RecipientInvitation = z.infer<typeof recipientInvitationSchema>;

export const recipientInvitationResponseSchema = z.object({
  invitation: recipientInvitationSchema,
  requestId: z.uuid(),
});

export const invitationAcceptResponseSchema = z.object({
  organizationSlug: organizationSlugSchema,
  requestId: z.uuid(),
});

export const invitationRegistrationContextSchema = z.object({
  invitationId: z.string().min(1),
  organizationName: z.string().min(1),
  maskedEmail: z.string().min(3),
  expiresAt: z.iso.datetime(),
  recipientHasAccount: z.boolean(),
});
export type InvitationRegistrationContext = z.infer<
  typeof invitationRegistrationContextSchema
>;

export const invitationRegistrationInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(128),
});

export const invitationRegistrationResponseSchema = z.object({
  nextPath: z.string().startsWith("/sign-in?"),
  requestId: z.uuid(),
});
