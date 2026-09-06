import "server-only";

import * as z from "zod";

import {
  organizationAdminWorkspaceSchema,
  organizationInvitationCreateInputSchema,
  organizationInvitationSchema,
  recipientInvitationSchema,
  type OrganizationAdminWorkspace,
  type OrganizationCreateInput,
  type StoreCreateInput,
  type StoreMembershipWriteInput,
  type StoreUpdateInput,
} from "@/domain/admin/schemas";
import {
  organizationRoleSchema,
  type OrganizationAdminContext,
} from "@/domain/admin/authorization";
import { getAuth } from "@/server/auth/auth";
import {
  listManagedOrganizations,
  requireOrganizationAdminById,
} from "@/server/auth/organization-admin-context";
import { requireSession } from "@/server/auth/session";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import {
  StoreAdminReferenceError,
  StoreAdminRepository,
} from "@/server/repositories/store-admin-repository";

const sourceOrganizationMemberSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  role: z.string().min(1),
  user: z.object({
    name: z.string().min(1),
    email: z.email(),
  }),
});

function primaryOrganizationRole(role: string) {
  const roles = role.split(",").map((value) => value.trim());
  return organizationRoleSchema.parse(
    roles.includes("owner")
      ? "owner"
      : roles.includes("admin")
        ? "admin"
        : "member",
  );
}

async function getRepository() {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  return new StoreAdminRepository(db, client);
}

export async function getOrganizationAdminWorkspace(input: {
  context: OrganizationAdminContext;
  requestHeaders: Headers;
}): Promise<OrganizationAdminWorkspace> {
  const [auth, repository] = await Promise.all([getAuth(), getRepository()]);
  const [fullOrganization, stores, memberships, invitations] =
    await Promise.all([
      auth.api.getFullOrganization({
        headers: input.requestHeaders,
        query: { organizationId: input.context.organizationId },
      }),
      repository.listStores(input.context.organizationId),
      repository.listMemberships(input.context.organizationId),
      auth.api.listInvitations({
        headers: input.requestHeaders,
        query: { organizationId: input.context.organizationId },
      }),
    ]);
  if (!fullOrganization) {
    throw new StoreAdminReferenceError(
      "Organisation introuvable ou accès refusé",
    );
  }

  const membershipsByUser = new Map<string, typeof memberships>();
  for (const membership of memberships) {
    const current = membershipsByUser.get(membership.userId) ?? [];
    current.push(membership);
    membershipsByUser.set(membership.userId, current);
  }

  return organizationAdminWorkspaceSchema.parse({
    organization: {
      id: fullOrganization.id,
      slug: fullOrganization.slug,
      name: fullOrganization.name,
    },
    stores,
    members: fullOrganization.members.map((rawMember) => {
      const member = sourceOrganizationMemberSchema.parse(rawMember);
      return {
        memberId: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        organizationRole: primaryOrganizationRole(member.role),
        storeAccesses: membershipsByUser.get(member.userId) ?? [],
      };
    }),
    invitations: invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) =>
        organizationInvitationSchema.parse({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
        }),
      ),
  });
}

export async function createStore(input: {
  context: OrganizationAdminContext;
  createInput: StoreCreateInput;
  requestId: string;
}) {
  if (input.createInput.organizationId !== input.context.organizationId) {
    throw new StoreAdminReferenceError(
      "Organisation introuvable ou accès refusé",
    );
  }
  return (await getRepository()).createStore({
    actorUserId: input.context.userId,
    createInput: input.createInput,
    requestId: input.requestId,
  });
}

export async function updateStore(input: {
  context: OrganizationAdminContext;
  storeId: string;
  updateInput: StoreUpdateInput;
  requestId: string;
}) {
  return (await getRepository()).updateStore({
    actorUserId: input.context.userId,
    organizationId: input.context.organizationId,
    storeId: input.storeId,
    updateInput: input.updateInput,
    requestId: input.requestId,
  });
}

export async function writeStoreMembership(input: {
  context: OrganizationAdminContext;
  storeId: string;
  writeInput: StoreMembershipWriteInput;
  requestHeaders: Headers;
  requestId: string;
}) {
  const auth = await getAuth();
  const fullOrganization = await auth.api.getFullOrganization({
    headers: input.requestHeaders,
    query: { organizationId: input.context.organizationId },
  });
  const targetMember = fullOrganization?.members.find(
    (member) => member.userId === input.writeInput.userId,
  );
  if (!targetMember) {
    throw new StoreAdminReferenceError(
      "Le membre n’appartient pas à cette organisation",
    );
  }
  const organizationRole = primaryOrganizationRole(targetMember.role);
  if (organizationRole !== "member") {
    throw new StoreAdminReferenceError(
      "Les administrateurs d’organisation disposent déjà de tous les magasins",
    );
  }

  return (await getRepository()).writeMembership({
    actorUserId: input.context.userId,
    organizationId: input.context.organizationId,
    storeId: input.storeId,
    writeInput: input.writeInput,
    requestId: input.requestId,
  });
}

export async function createOrganizationWithFirstStore(input: {
  createInput: OrganizationCreateInput;
  requestHeaders: Headers;
  requestId: string;
}) {
  const [session, auth] = await Promise.all([
    requireSession(input.requestHeaders),
    getAuth(),
  ]);
  const organizations = await auth.api.listOrganizations({
    headers: input.requestHeaders,
  });
  const existing = organizations.find(
    (organization) => organization.slug === input.createInput.slug,
  );
  const organization =
    existing ??
    (await auth.api.createOrganization({
      headers: input.requestHeaders,
      body: {
        name: input.createInput.name,
        slug: input.createInput.slug,
        keepCurrentActiveOrganization: true,
      },
    }));
  const context = await requireOrganizationAdminById(
    organization.id,
    input.requestHeaders,
  );
  const store = await createStore({
    context,
    createInput: {
      organizationId: organization.id,
      code: input.createInput.firstStore.code,
      name: input.createInput.firstStore.name,
      idempotencyKey: input.createInput.idempotencyKey,
    },
    requestId: input.requestId,
  });

  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    },
    store,
    actorUserId: session.user.id,
  };
}

export async function createOrganizationInvitation(input: {
  context: OrganizationAdminContext;
  rawInput: unknown;
  requestHeaders: Headers;
  requestId: string;
}) {
  const createInput = organizationInvitationCreateInputSchema.parse(
    input.rawInput,
  );
  const auth = await getAuth();
  const created = await auth.api.createInvitation({
    headers: input.requestHeaders,
    body: {
      email: createInput.email,
      role: createInput.role,
      organizationId: input.context.organizationId,
      resend: createInput.resend,
    },
  });
  const invitation = organizationInvitationSchema.parse({
    ...created,
    expiresAt: created.expiresAt.toISOString(),
  });
  const now = new Date();
  await (await getAppDb()).collection("auditLogs").insertOne({
    organizationId: input.context.organizationId,
    storeId: null,
    actorId: input.context.userId,
    action: "organization.invitation.created",
    entityType: "organizationInvitation",
    entityId: invitation.id,
    before: null,
    after: invitation,
    requestId: input.requestId,
    timestamp: now,
    createdAt: now,
  });

  return {
    invitation,
    acceptPath: `/invitations/${invitation.id}`,
  };
}

export async function getOrganizationInvitationForRecipient(input: {
  invitationId: string;
  requestHeaders: Headers;
}) {
  const [, auth] = await Promise.all([
    requireSession(input.requestHeaders),
    getAuth(),
  ]);
  const invitation = await auth.api.getInvitation({
    headers: input.requestHeaders,
    query: { id: input.invitationId },
  });

  return recipientInvitationSchema.parse({
    ...invitation,
    expiresAt: invitation.expiresAt.toISOString(),
  });
}

export async function acceptOrganizationInvitation(input: {
  invitationId: string;
  requestHeaders: Headers;
  requestId: string;
}) {
  const [session, invitation, auth] = await Promise.all([
    requireSession(input.requestHeaders),
    getOrganizationInvitationForRecipient(input),
    getAuth(),
  ]);
  await auth.api.acceptInvitation({
    headers: input.requestHeaders,
    body: { invitationId: input.invitationId },
  });
  const now = new Date();
  await (await getAppDb()).collection("auditLogs").insertOne({
    organizationId: invitation.organizationId,
    storeId: null,
    actorId: session.user.id,
    action: "organization.invitation.accepted",
    entityType: "organizationInvitation",
    entityId: invitation.id,
    before: { status: "pending" },
    after: { status: "accepted", email: invitation.email },
    requestId: input.requestId,
    timestamp: now,
    createdAt: now,
  });

  return { organizationSlug: invitation.organizationSlug };
}

export { listManagedOrganizations };
