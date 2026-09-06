import { NextResponse } from "next/server";

import {
  organizationAdminWorkspaceResponseSchema,
  storeMembershipAdminResponseSchema,
  storeMembershipWriteInputSchema,
} from "@/domain/admin/schemas";
import { requireOrganizationAdminById } from "@/server/auth/organization-admin-context";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { StoreAdminReferenceError, StoreAdminRepository } from "@/server/repositories/store-admin-repository";
import {
  getOrganizationAdminWorkspace,
  writeStoreMembership,
} from "@/server/services/organization-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

async function authorizeStoreAdministration(storeId: string, headers: Headers) {
  const [db, client] = await Promise.all([getAppDb(), getMongoClient()]);
  const store = await new StoreAdminRepository(db, client).findStore(storeId);
  if (!store) {
    throw new StoreAdminReferenceError("Magasin introuvable ou accès refusé");
  }
  const context = await requireOrganizationAdminById(
    store.organizationId,
    headers,
  );
  return { context, store };
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const { context } = await authorizeStoreAdministration(
      storeId,
      request.headers,
    );
    const workspace = await getOrganizationAdminWorkspace({
      context,
      requestHeaders: request.headers,
    });
    return NextResponse.json(
      organizationAdminWorkspaceResponseSchema.parse({
        ...workspace,
        requestId,
      }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/members",
      method: "GET",
    });
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const { context } = await authorizeStoreAdministration(
      storeId,
      request.headers,
    );
    const writeInput = storeMembershipWriteInputSchema.parse(
      await request.json(),
    );
    const membership = await writeStoreMembership({
      context,
      storeId,
      writeInput,
      requestHeaders: request.headers,
      requestId,
    });
    return NextResponse.json(
      storeMembershipAdminResponseSchema.parse({ membership, requestId }),
      { status: 201 },
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]/members",
      method: "POST",
    });
  }
}
