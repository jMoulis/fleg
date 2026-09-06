import { NextResponse } from "next/server";

import {
  organizationCreateInputSchema,
  organizationCreateResponseSchema,
  managedOrganizationsResponseSchema,
} from "@/domain/admin/schemas";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import {
  createOrganizationWithFirstStore,
  listManagedOrganizations,
} from "@/server/services/organization-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const organizations = await listManagedOrganizations(request.headers);
    return NextResponse.json(
      managedOrganizationsResponseSchema.parse({ organizations, requestId }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/organizations",
      method: "GET",
    });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const createInput = organizationCreateInputSchema.parse(
      await request.json(),
    );
    const created = await createOrganizationWithFirstStore({
      createInput,
      requestHeaders: request.headers,
      requestId,
    });
    return NextResponse.json(
      organizationCreateResponseSchema.parse({ ...created, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/organizations",
      method: "POST",
    });
  }
}
