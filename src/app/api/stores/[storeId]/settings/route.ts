import { NextResponse } from "next/server";

import {
  storeSettingsResponseSchema,
  storeSettingsUpdateInputSchema,
} from "@/domain/configuration/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { storeConfigurationErrorResponse } from "@/server/http/store-configuration-error-response";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";
import { updateStoreSettings } from "@/server/services/store-configuration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ storeId: string }>;
}

export async function GET(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["stores.read"],
      request.headers,
    );
    const settings = await new StoreConfigurationRepository(
      await getAppDb(),
    ).getSettings(context);
    return NextResponse.json(
      storeSettingsResponseSchema.parse({ settings, requestId }),
    );
  } catch (error) {
    return storeConfigurationErrorResponse({
      error,
      invalidCode: "INVALID_STORE_SETTINGS",
      invalidMessage: "Les réglages du magasin sont invalides",
      method: "GET",
      requestId,
      route: "/api/stores/[storeId]/settings",
    });
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["settings.write"],
      request.headers,
    );
    const updateInput = storeSettingsUpdateInputSchema.parse(
      await request.json(),
    );
    const settings = await updateStoreSettings({
      context,
      updateInput,
      requestId,
    });
    return NextResponse.json(
      storeSettingsResponseSchema.parse({ settings, requestId }),
    );
  } catch (error) {
    return storeConfigurationErrorResponse({
      error,
      invalidCode: "INVALID_STORE_SETTINGS",
      invalidMessage: "Les réglages du magasin sont invalides",
      method: "PATCH",
      requestId,
      route: "/api/stores/[storeId]/settings",
    });
  }
}
