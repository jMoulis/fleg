import { NextResponse } from "next/server";

import { organizationInvitationResponseSchema } from "@/domain/admin/schemas";
import { requireOrganizationAdminById } from "@/server/auth/organization-admin-context";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { createOrganizationInvitation } from "@/server/services/organization-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { organizationId } = await routeContext.params;
    const context = await requireOrganizationAdminById(
      organizationId,
      request.headers,
    );
    const result = await createOrganizationInvitation({
      context,
      rawInput: await request.json(),
      requestHeaders: request.headers,
      requestId,
    });
    return NextResponse.json(
      organizationInvitationResponseSchema.parse({ ...result, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/organizations/[organizationId]/invitations",
      method: "POST",
    });
  }
}
