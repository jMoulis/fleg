import * as z from "zod";

export const organizationRoleSchema = z.enum(["owner", "admin", "member"]);

export const organizationAdminContextSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  organizationName: z.string().min(1),
  role: z.enum(["owner", "admin"]),
});
export type OrganizationAdminContext = z.infer<
  typeof organizationAdminContextSchema
>;

export class OrganizationAdminAccessDeniedError extends Error {
  readonly code = "ORGANIZATION_NOT_FOUND_OR_FORBIDDEN";

  constructor() {
    super("Organisation introuvable ou accès refusé");
    this.name = "OrganizationAdminAccessDeniedError";
  }
}

export function authorizeOrganizationAdmin(input: {
  userId: string;
  organization: {
    id: string;
    slug: string;
    name: string;
  } | null;
  membership: {
    userId: string;
    organizationId: string;
    role: string;
  } | null;
}): OrganizationAdminContext {
  const roles = input.membership?.role
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const role = roles?.includes("owner")
    ? "owner"
    : roles?.includes("admin")
      ? "admin"
      : null;
  const authorized =
    input.organization !== null &&
    input.membership?.userId === input.userId &&
    input.membership.organizationId === input.organization.id &&
    role !== null;

  if (!authorized || !input.organization || !role) {
    throw new OrganizationAdminAccessDeniedError();
  }

  return organizationAdminContextSchema.parse({
    userId: input.userId,
    organizationId: input.organization.id,
    organizationSlug: input.organization.slug,
    organizationName: input.organization.name,
    role,
  });
}
