import * as z from "zod";

export const invitationEmailInputSchema = z.object({
  invitationId: z.string().min(1),
  recipientEmail: z.email(),
  organizationName: z.string().trim().min(1).max(160),
  inviterName: z.string().trim().min(1).max(160),
  inviterEmail: z.email(),
  role: z.string().trim().min(1).max(80),
  expiresAt: z.iso.datetime(),
  acceptUrl: z.url(),
});
export type InvitationEmailInput = z.infer<typeof invitationEmailInputSchema>;

export const renderedInvitationEmailSchema = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),
  html: z.string().min(1),
});
export type RenderedInvitationEmail = z.infer<
  typeof renderedInvitationEmailSchema
>;

const resendSuccessSchema = z.object({ id: z.string().min(1) });

export interface InvitationEmailProviderConfig {
  INVITATION_EMAIL_PROVIDER: "manual" | "resend";
  RESEND_API_KEY?: string;
  INVITATION_EMAIL_FROM?: string;
  INVITATION_EMAIL_REPLY_TO?: string;
  INVITATION_EMAIL_TIMEOUT_MS: number;
}

export type EmailFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class InvitationEmailDeliveryError extends Error {
  readonly providerStatus: number | null;

  constructor(providerStatus: number | null) {
    super("Le fournisseur d’e-mail n’a pas accepté l’invitation");
    this.name = "InvitationEmailDeliveryError";
    this.providerStatus = providerStatus;
  }
}

export interface InvitationEmailDeliveryResult {
  provider: "resend";
  providerMessageId: string;
  idempotencyKey: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function roleLabel(role: string): string {
  return role === "admin" ? "administrateur" : "membre";
}

export function renderOrganizationInvitationEmail(
  rawInput: InvitationEmailInput,
): RenderedInvitationEmail {
  const input = invitationEmailInputSchema.parse(rawInput);
  const label = roleLabel(input.role);
  const expiration = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(input.expiresAt));
  const subject = `Invitation à rejoindre ${input.organizationName}`;
  const text = [
    `${input.inviterName} (${input.inviterEmail}) vous invite à rejoindre ${input.organizationName} comme ${label}.`,
    "",
    `Accepter l’invitation : ${input.acceptUrl}`,
    `Ce lien expire le ${expiration}.`,
    "",
    "Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message.",
  ].join("\n");
  const safeOrganizationName = escapeHtml(input.organizationName);
  const safeInviterName = escapeHtml(input.inviterName);
  const safeInviterEmail = escapeHtml(input.inviterEmail);
  const safeAcceptUrl = escapeHtml(input.acceptUrl);

  return renderedInvitationEmailSchema.parse({
    to: input.recipientEmail,
    subject,
    text,
    html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#17211b;line-height:1.6"><main style="max-width:560px;margin:0 auto;padding:32px"><p style="font-size:14px;color:#587063">F&amp;L Cockpit</p><h1 style="font-size:24px">Rejoindre ${safeOrganizationName}</h1><p>${safeInviterName} (${safeInviterEmail}) vous invite comme ${label}.</p><p style="margin:28px 0"><a href="${safeAcceptUrl}" style="background:#166534;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block">Accepter l’invitation</a></p><p style="font-size:13px;color:#587063">Ce lien expire le ${escapeHtml(expiration)}. Si vous n’attendiez pas cette invitation, ignorez ce message.</p></main></body></html>`,
  });
}

export function invitationEmailIdempotencyKey(input: {
  invitationId: string;
  expiresAt: string;
}): string {
  return `organization-invitation/${input.invitationId}/${new Date(
    input.expiresAt,
  ).getTime()}`;
}

export async function deliverOrganizationInvitationEmail(
  rawInput: InvitationEmailInput,
  options: {
    environment: InvitationEmailProviderConfig;
    fetcher?: EmailFetcher;
  },
): Promise<InvitationEmailDeliveryResult> {
  const input = invitationEmailInputSchema.parse(rawInput);
  const environment = options.environment;
  if (
    environment.INVITATION_EMAIL_PROVIDER !== "resend" ||
    !environment.RESEND_API_KEY ||
    !environment.INVITATION_EMAIL_FROM
  ) {
    throw new InvitationEmailDeliveryError(null);
  }

  const email = renderOrganizationInvitationEmail(input);
  const idempotencyKey = invitationEmailIdempotencyKey(input);
  const response = await (options.fetcher ?? fetch)(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "fleg-cockpit/0.1.0",
      },
      body: JSON.stringify({
        from: environment.INVITATION_EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(environment.INVITATION_EMAIL_REPLY_TO
          ? { reply_to: environment.INVITATION_EMAIL_REPLY_TO }
          : {}),
      }),
      signal: AbortSignal.timeout(environment.INVITATION_EMAIL_TIMEOUT_MS),
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new InvitationEmailDeliveryError(response.status);
  }
  if (!response.ok) {
    throw new InvitationEmailDeliveryError(response.status);
  }
  const parsed = resendSuccessSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvitationEmailDeliveryError(response.status);
  }

  return {
    provider: "resend",
    providerMessageId: parsed.data.id,
    idempotencyKey,
  };
}
