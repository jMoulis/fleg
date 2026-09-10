import "server-only";

import {
  deliverOrganizationInvitationEmail,
  invitationEmailIdempotencyKey,
  type EmailFetcher,
  type InvitationEmailDeliveryResult,
  type InvitationEmailInput,
} from "@/domain/admin/invitation-email";
import {
  getInvitationEmailEnv,
  type InvitationEmailEnv,
} from "@/server/env";

export { invitationEmailIdempotencyKey };
export type { InvitationEmailDeliveryResult };

export function sendOrganizationInvitationEmail(
  input: InvitationEmailInput,
  options: {
    environment?: InvitationEmailEnv;
    fetcher?: EmailFetcher;
  } = {},
): Promise<InvitationEmailDeliveryResult> {
  return deliverOrganizationInvitationEmail(input, {
    environment: options.environment ?? getInvitationEmailEnv(),
    fetcher: options.fetcher,
  });
}
