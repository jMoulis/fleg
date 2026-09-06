import "server-only";

import { ObjectId } from "mongodb";
import * as z from "zod";

import {
  invitationRegistrationContextSchema,
  invitationRegistrationInputSchema,
} from "@/domain/admin/schemas";
import { createInvitedUserAccount } from "@/server/auth/auth";
import { getAppDb, getAuthDb } from "@/server/db/mongo-client";
import { reportServerError } from "@/server/observability/logger";

interface FlexibleIdDocument {
  _id: string | ObjectId;
  [key: string]: unknown;
}

const identifierSchema = z.preprocess((value) => {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toHexString" in value &&
    typeof value.toHexString === "function"
  ) {
    const hexadecimal = value.toHexString();
    return typeof hexadecimal === "string" ? hexadecimal : value;
  }
  return value;
}, z.string().min(1));

const invitationDocumentSchema = z.object({
  _id: identifierSchema,
  email: z.email(),
  organizationId: identifierSchema,
  status: z.literal("pending"),
  expiresAt: z.date(),
});

const organizationDocumentSchema = z.object({
  _id: identifierSchema,
  name: z.string().min(1),
});

export class InvitationRegistrationUnavailableError extends Error {
  constructor() {
    super("Invitation introuvable, expirée ou déjà utilisée");
    this.name = "InvitationRegistrationUnavailableError";
  }
}

export class InvitationRecipientExistsError extends Error {
  constructor() {
    super("Un compte existe déjà pour cette invitation. Connectez-vous pour continuer.");
    this.name = "InvitationRecipientExistsError";
  }
}

function idCandidates(id: string): Array<string | ObjectId> {
  return ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  const firstCharacter = localPart?.slice(0, 1) || "*";
  return `${firstCharacter}***@${domain}`;
}

async function getRegistrationTarget(invitationId: string) {
  const authDb = await getAuthDb();
  const invitation = invitationDocumentSchema.safeParse(
    await authDb.collection<FlexibleIdDocument>("invitation").findOne({
      _id: { $in: idCandidates(invitationId) },
      status: "pending",
    }),
  );
  if (
    !invitation.success ||
    invitation.data.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvitationRegistrationUnavailableError();
  }

  const organization = organizationDocumentSchema.safeParse(
    await authDb.collection<FlexibleIdDocument>("organization").findOne({
      _id: { $in: idCandidates(invitation.data.organizationId) },
    }),
  );
  if (!organization.success) {
    throw new InvitationRegistrationUnavailableError();
  }
  const normalizedEmail = invitation.data.email.toLocaleLowerCase("fr-FR");
  const existingUser = await authDb.collection("user").findOne(
    { email: normalizedEmail },
    { projection: { _id: 1 } },
  );

  return {
    invitation: invitation.data,
    organization: organization.data,
    normalizedEmail,
    recipientHasAccount: existingUser !== null,
  };
}

export async function getInvitationRegistrationContext(
  invitationId: string,
) {
  const target = await getRegistrationTarget(invitationId);
  return invitationRegistrationContextSchema.parse({
    invitationId: target.invitation._id,
    organizationName: target.organization.name,
    maskedEmail: maskEmail(target.normalizedEmail),
    expiresAt: target.invitation.expiresAt.toISOString(),
    recipientHasAccount: target.recipientHasAccount,
  });
}

export async function registerInvitedUser(input: {
  invitationId: string;
  rawInput: unknown;
  requestId: string;
}) {
  const registration = invitationRegistrationInputSchema.parse(input.rawInput);
  const target = await getRegistrationTarget(input.invitationId);
  if (target.recipientHasAccount) {
    throw new InvitationRecipientExistsError();
  }

  const attemptedAt = new Date();
  const auditLogs = (await getAppDb()).collection("auditLogs");
  const auditAttempt = await auditLogs.insertOne({
    organizationId: target.invitation.organizationId,
    storeId: null,
    actorId: "pending-invitation-recipient",
    action: "organization.invitation.user_registration_started",
    entityType: "organizationInvitation",
    entityId: target.invitation._id,
    before: { recipientHasAccount: false },
    after: { registrationStatus: "started" },
    requestId: input.requestId,
    timestamp: attemptedAt,
    createdAt: attemptedAt,
  });
  let created;
  try {
    created = await createInvitedUserAccount({
      name: registration.name,
      email: target.normalizedEmail,
      password: registration.password,
    });
  } catch (error) {
    try {
      await auditLogs.updateOne(
        { _id: auditAttempt.insertedId },
        {
          $set: {
            action: "organization.invitation.user_registration_failed",
            after: { registrationStatus: "failed" },
          },
        },
      );
    } catch (auditError) {
      reportServerError({
        event: "invitation.registration.audit_failed",
        message: "L’échec d’inscription invitée n’a pas pu compléter son audit",
        requestId: input.requestId,
        error: auditError,
      });
    }
    const userNowExists = await (await getAuthDb())
      .collection("user")
      .findOne({ email: target.normalizedEmail }, { projection: { _id: 1 } });
    if (userNowExists) throw new InvitationRecipientExistsError();
    throw error;
  }

  try {
    await auditLogs.updateOne(
      { _id: auditAttempt.insertedId },
      {
        $set: {
          actorId: created.user.id,
          action: "organization.invitation.user_registered",
          after: {
            recipientHasAccount: true,
            registrationStatus: "completed",
          },
        },
      },
    );
  } catch (error) {
    reportServerError({
      event: "invitation.registration.audit_failed",
      message: "L’inscription invitée n’a pas pu compléter son audit",
      requestId: input.requestId,
      error,
    });
  }

  const callbackPath = `/invitations/${encodeURIComponent(
    target.invitation._id,
  )}`;
  return {
    nextPath: `/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}&registered=1`,
  };
}
