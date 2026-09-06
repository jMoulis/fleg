import { NextResponse } from "next/server";

import { invitationAcceptResponseSchema } from "@/domain/admin/schemas";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { acceptOrganizationInvitation } from "@/server/services/organization-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ invitationId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { invitationId } = await routeContext.params;
    const result = await acceptOrganizationInvitation({
      invitationId,
      requestHeaders: request.headers,
      requestId,
    });
    return NextResponse.json(
      invitationAcceptResponseSchema.parse({ ...result, requestId }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/invitations/[invitationId]/accept",
      method: "POST",
    });
  }
}
