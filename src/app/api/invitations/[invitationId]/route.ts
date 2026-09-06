import { NextResponse } from "next/server";

import { recipientInvitationResponseSchema } from "@/domain/admin/schemas";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { getOrganizationInvitationForRecipient } from "@/server/services/organization-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ invitationId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { invitationId } = await routeContext.params;
    const invitation = await getOrganizationInvitationForRecipient({
      invitationId,
      requestHeaders: request.headers,
    });
    return NextResponse.json(
      recipientInvitationResponseSchema.parse({ invitation, requestId }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/invitations/[invitationId]",
      method: "GET",
    });
  }
}
