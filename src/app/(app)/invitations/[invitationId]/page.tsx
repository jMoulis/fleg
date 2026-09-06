import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Leaf } from "lucide-react";

import { InvitationAcceptance } from "@/components/admin/invitation-acceptance";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { getOrganizationInvitationForRecipient } from "@/server/services/organization-admin-service";

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
  let invitation;
  try {
    invitation = await getOrganizationInvitationForRecipient({
      invitationId,
      requestHeaders,
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invitations/${invitationId}`)}`);
    }
    notFound();
  }

  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-svh place-items-center bg-muted/35 px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          <span className="font-semibold">F&amp;L Cockpit</span>
        </div>
        <InvitationAcceptance invitation={invitation} />
      </div>
    </main>
  );
}
