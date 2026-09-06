import "server-only";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { getAppDb, getAuthDb, getMongoClient } from "@/server/db/mongo-client";
import {
  getAuthEnv,
  getInvitationEmailEnv,
} from "@/server/env";
import {
  invitationEmailIdempotencyKey,
  sendOrganizationInvitationEmail,
} from "@/server/email/invitation-email";
import { reportServerWarning } from "@/server/observability/logger";
import { InvitationDeliveryRepository } from "@/server/repositories/invitation-delivery-repository";

async function invitationEmailPlugin() {
  const environment = getInvitationEmailEnv();
  if (environment.INVITATION_EMAIL_PROVIDER !== "resend") {
    return organization();
  }

  return organization({
    async sendInvitationEmail(data) {
      const attemptedAt = new Date();
      const expiresAt = data.invitation.expiresAt.toISOString();
      const idempotencyKey = invitationEmailIdempotencyKey({
        invitationId: data.id,
        expiresAt,
      });
      const repository = new InvitationDeliveryRepository(await getAppDb());
      try {
        const delivery = await sendOrganizationInvitationEmail(
          {
            invitationId: data.id,
            recipientEmail: data.email,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            inviterEmail: data.inviter.user.email,
            role: data.role,
            expiresAt,
            acceptUrl: new URL(
              `/invitations/${encodeURIComponent(data.id)}`,
              getAuthEnv().BETTER_AUTH_URL,
            ).toString(),
          },
          { environment },
        );
        await repository.record({
          organizationId: data.organization.id,
          invitationId: data.id,
          provider: "resend",
          status: "sent",
          providerMessageId: delivery.providerMessageId,
          idempotencyKey,
          attemptedAt,
        });
      } catch (error) {
        try {
          await repository.record({
            organizationId: data.organization.id,
            invitationId: data.id,
            provider: "resend",
            status: "failed",
            idempotencyKey,
            attemptedAt,
          });
        } catch (recordError) {
          reportServerWarning({
            event: "invitation.email.delivery_record_failed",
            message: "Le résultat d’envoi de l’invitation n’a pas pu être enregistré",
            requestId: crypto.randomUUID(),
            error: recordError,
            context: { provider: "resend" },
          });
        }
        reportServerWarning({
          event: "invitation.email.delivery_failed",
          message: "Le fournisseur n’a pas envoyé l’invitation",
          requestId: crypto.randomUUID(),
          error,
          context: { provider: "resend" },
        });
      }
    },
  });
}

async function createAuth() {
  const [client, authDb, env, organizationPlugin] = await Promise.all([
    getMongoClient(),
    getAuthDb(),
    getAuthEnv(),
    invitationEmailPlugin(),
  ]);

  return betterAuth({
    appName: "F&L Cockpit",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(authDb, { client }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !env.AUTH_ALLOW_SIGN_UP,
    },
    advanced: {
      database: {
        joins: true,
      },
    },
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    plugins: [organizationPlugin, nextCookies()],
  });
}

async function createInvitationRegistrationAuth() {
  const [client, authDb, env] = await Promise.all([
    getMongoClient(),
    getAuthDb(),
    getAuthEnv(),
  ]);

  return betterAuth({
    appName: "F&L Cockpit",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(authDb, { client }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      autoSignIn: false,
    },
    advanced: {
      database: {
        joins: true,
      },
    },
  });
}

type Auth = Awaited<ReturnType<typeof createAuth>>;

let authPromise: Promise<Auth> | undefined;
let invitationRegistrationAuthPromise:
  | ReturnType<typeof createInvitationRegistrationAuth>
  | undefined;

export function getAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = createAuth();
  }

  return authPromise;
}

export async function createInvitedUserAccount(input: {
  name: string;
  email: string;
  password: string;
}) {
  if (!invitationRegistrationAuthPromise) {
    invitationRegistrationAuthPromise = createInvitationRegistrationAuth();
  }
  const registrationAuth = await invitationRegistrationAuthPromise;
  return registrationAuth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
    },
  });
}
