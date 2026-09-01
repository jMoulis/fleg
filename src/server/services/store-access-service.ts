import "server-only";

import { storeSummarySchema, type StoreSummary } from "@/domain/stores/schemas";
import { getAuth } from "@/server/auth/auth";
import { requireSession } from "@/server/auth/session";
import { getAppDb } from "@/server/db/mongo-client";
import {
  StoreRepository,
  type StoreListItem,
} from "@/server/repositories/store-repository";

interface OrganizationAccess {
  id: string;
  slug: string;
  role: "owner" | "admin" | "member";
}

function withOrganizationSlug(
  store: StoreListItem,
  organizations: Map<string, OrganizationAccess>,
): StoreSummary | null {
  const organization = organizations.get(store.organizationId);

  if (!organization) {
    return null;
  }

  return storeSummarySchema.parse({
    ...store,
    organizationSlug: organization.slug,
  });
}

export async function listAuthorizedStores(
  requestHeaders: Headers,
): Promise<StoreSummary[]> {
  const session = await requireSession(requestHeaders);
  const auth = await getAuth();
  const organizationSummaries = await auth.api.listOrganizations({
    headers: requestHeaders,
  });

  const accesses = await Promise.all(
    organizationSummaries.map(async (organization) => {
      const fullOrganization = await auth.api.getFullOrganization({
        headers: requestHeaders,
        query: { organizationId: organization.id },
      });
      const role = fullOrganization?.members.find(
        (member) => member.userId === session.user.id,
      )?.role;

      return role
        ? { id: organization.id, slug: organization.slug, role }
        : null;
    }),
  );

  const organizations = new Map(
    accesses
      .filter((access): access is OrganizationAccess => access !== null)
      .map((access) => [access.id, access]),
  );
  const repository = new StoreRepository(await getAppDb());
  const memberStores = await repository.listForUser(session.user.id);
  const adminOrganizationIds = [...organizations.values()]
    .filter(({ role }) => role === "owner" || role === "admin")
    .map(({ id }) => id);
  const adminStores = (
    await Promise.all(
      adminOrganizationIds.map((organizationId) =>
        repository.listForOrganization(organizationId),
      ),
    )
  ).flat();

  const uniqueStores = new Map(
    [...memberStores, ...adminStores].map((store) => [store.id, store]),
  );

  return [...uniqueStores.values()]
    .map((store) => withOrganizationSlug(store, organizations))
    .filter((store): store is StoreSummary => store !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
