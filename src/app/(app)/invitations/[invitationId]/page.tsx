import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Leaf } from "lucide-react";

import { InvitationAcceptance } from "@/components/admin/invitation-acceptance";
import { InvitationRegistration } from "@/components/admin/invitation-registration";
import { getSession } from "@/server/auth/session";
import { getOrganizationInvitationForRecipient } from "@/server/services/organization-admin-service";
import { getInvitationRegistrationContext } from "@/server/services/invitation-registration-service";

export const metadata: Metadata = {
  title: "Invitation — F&L Cockpit",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const [{ invitationId }, requestHeaders] = await Promise.all([
    params,
    headers(),
  ]);
  const session = await getSession(requestHeaders);
  let invitation: Awaited<
    ReturnType<typeof getOrganizationInvitationForRecipient>
  > | null = null;
  let registration: Awaited<
    ReturnType<typeof getInvitationRegistrationContext>
  > | null = null;
  if (session) {
    try {
      invitation = await getOrganizationInvitationForRecipient({
        invitationId,
        requestHeaders,
      });
    } catch {
      notFound();
    }
  } else {
    try {
      registration = await getInvitationRegistrationContext(invitationId);
    } catch {
      notFound();
    }
  }
  const content = invitation ? (
    <InvitationAcceptance invitation={invitation} />
  ) : registration ? (
    <InvitationRegistration registration={registration} />
  ) : null;

  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-svh place-items-center bg-muted/35 px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          <span className="font-semibold">F&amp;L Cockpit</span>
        </div>
        {content}
      </div>
    </main>
  );
}
