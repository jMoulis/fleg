import { NextResponse } from "next/server";

import {
  storeAdminResponseSchema,
  storeUpdateInputSchema,
} from "@/domain/admin/schemas";
import { requireOrganizationAdminById } from "@/server/auth/organization-admin-context";
import { adminApiErrorResponse } from "@/server/http/admin-api-error";
import { StoreAdminReferenceError, StoreAdminRepository } from "@/server/repositories/store-admin-repository";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { updateStore } from "@/server/services/organization-admin-service";

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
    const { store } = await authorizeStoreAdministration(
      storeId,
      request.headers,
    );
    return NextResponse.json(
      storeAdminResponseSchema.parse({ store, requestId }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]",
      method: "GET",
    });
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const { context } = await authorizeStoreAdministration(
      storeId,
      request.headers,
    );
    const updateInput = storeUpdateInputSchema.parse(await request.json());
    const store = await updateStore({
      context,
      storeId,
      updateInput,
      requestId,
    });
    return NextResponse.json(
      storeAdminResponseSchema.parse({ store, requestId }),
    );
  } catch (error) {
    return adminApiErrorResponse({
      error,
      requestId,
      route: "/api/stores/[storeId]",
      method: "PATCH",
    });
  }
}
