import { NextResponse } from "next/server";

import {
  periodTargetResponseSchema,
  periodTargetsResponseSchema,
  periodTargetUpsertInputSchema,
} from "@/domain/configuration/schemas";
import { requireStoreContext } from "@/server/auth/store-context";
import { getAppDb } from "@/server/db/mongo-client";
import { storeConfigurationErrorResponse } from "@/server/http/store-configuration-error-response";
import { StoreConfigurationRepository } from "@/server/repositories/store-configuration-repository";
import { upsertStorePeriodTarget } from "@/server/services/store-configuration-service";

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
      ["analytics.read"],
      request.headers,
    );
    const targets = await new StoreConfigurationRepository(
      await getAppDb(),
    ).listTargets(context);
    return NextResponse.json(
      periodTargetsResponseSchema.parse({ targets, requestId }),
    );
  } catch (error) {
    return storeConfigurationErrorResponse({
      error,
      invalidCode: "INVALID_PERIOD_TARGET",
      invalidMessage: "L’objectif demandé est invalide",
      method: "GET",
      requestId,
      route: "/api/stores/[storeId]/targets",
    });
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const { storeId } = await routeContext.params;
    const context = await requireStoreContext(
      storeId,
      ["targets.write"],
      request.headers,
    );
    const targetInput = periodTargetUpsertInputSchema.parse(
      await request.json(),
    );
    const target = await upsertStorePeriodTarget({
      context,
      targetInput,
      requestId,
    });
    return NextResponse.json(
      periodTargetResponseSchema.parse({ target, requestId }),
    );
  } catch (error) {
    return storeConfigurationErrorResponse({
      error,
      invalidCode: "INVALID_PERIOD_TARGET",
      invalidMessage: "L’objectif demandé est invalide",
      method: "PUT",
      requestId,
      route: "/api/stores/[storeId]/targets",
    });
  }
}
