import "server-only";

import {
  authorizeOrganizationAdmin,
  type OrganizationAdminContext,
} from "@/domain/admin/authorization";
import { getAuth } from "@/server/auth/auth";
import { requireSession } from "@/server/auth/session";

interface OrganizationIdentifier {
  id?: string;
  slug?: string;
}

async function requireOrganizationAdmin(
  identifier: OrganizationIdentifier,
  requestHeaders: Headers,
): Promise<OrganizationAdminContext> {
  const [session, auth] = await Promise.all([
    requireSession(requestHeaders),
    getAuth(),
  ]);
  const organizations = await auth.api.listOrganizations({
    headers: requestHeaders,
  });
  const organization = organizations.find(
    (candidate) =>
      (identifier.id !== undefined && candidate.id === identifier.id) ||
      (identifier.slug !== undefined && candidate.slug === identifier.slug),
  );
  const fullOrganization = organization
    ? await auth.api.getFullOrganization({
        headers: requestHeaders,
        query: { organizationId: organization.id },
      })
    : null;
  const membership = fullOrganization?.members.find(
    (member) => member.userId === session.user.id,
  );

  return authorizeOrganizationAdmin({
    userId: session.user.id,
    organization: organization
      ? {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
        }
      : null,
    membership: membership
      ? {
          userId: membership.userId,
          organizationId: membership.organizationId,
          role: membership.role,
        }
      : null,
  });
}

export function requireOrganizationAdminById(
  organizationId: string,
  requestHeaders: Headers,
): Promise<OrganizationAdminContext> {
  return requireOrganizationAdmin({ id: organizationId }, requestHeaders);
}

export function requireOrganizationAdminBySlug(
  organizationSlug: string,
  requestHeaders: Headers,
): Promise<OrganizationAdminContext> {
  return requireOrganizationAdmin({ slug: organizationSlug }, requestHeaders);
}

export async function listManagedOrganizations(requestHeaders: Headers) {
  const [session, auth] = await Promise.all([
    requireSession(requestHeaders),
    getAuth(),
  ]);
  const organizations = await auth.api.listOrganizations({
    headers: requestHeaders,
  });
  const contexts = await Promise.all(
    organizations.map(async (organization) => {
      const fullOrganization = await auth.api.getFullOrganization({
        headers: requestHeaders,
        query: { organizationId: organization.id },
      });
      const membership = fullOrganization?.members.find(
        (member) => member.userId === session.user.id,
      );

      try {
        return authorizeOrganizationAdmin({
          userId: session.user.id,
          organization: {
            id: organization.id,
            slug: organization.slug,
            name: organization.name,
          },
          membership: membership
            ? {
                userId: membership.userId,
                organizationId: membership.organizationId,
                role: membership.role,
              }
            : null,
        });
      } catch {
        return null;
      }
    }),
  );

  return contexts.filter(
    (context): context is OrganizationAdminContext => context !== null,
  );
}
