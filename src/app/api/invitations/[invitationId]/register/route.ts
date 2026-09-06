import { NextResponse } from "next/server";

import { invitationRegistrationResponseSchema } from "@/domain/admin/schemas";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { registerInvitedUser } from "@/server/services/invitation-registration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ invitationId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { invitationId } = await routeContext.params;
    const result = await registerInvitedUser({
      invitationId,
      rawInput: await request.json(),
      requestId,
    });
    return NextResponse.json(
      invitationRegistrationResponseSchema.parse({ ...result, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/invitations/[invitationId]/register",
      method: "POST",
    });
  }
}
