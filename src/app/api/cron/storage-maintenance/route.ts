import { NextResponse } from "next/server";
import { getAppDb } from "@/server/db/mongo-client";
import { getUploadLifecycle } from "@/server/services/upload-lifecycle-service";
import { runUploadMaintenanceBatch } from "@/server/services/upload-maintenance-service";
import { parsePrivateStorageConfig } from "@/server/storage/config";
import {
  matchesMaintenanceSecret,
  storageMaintenanceConfig,
} from "@/server/storage/maintenance-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.BLOB_MAINTENANCE_ENABLED !== "true")
    return NextResponse.json({ status: "disabled" }, { headers });
  try {
    const config = storageMaintenanceConfig();
    if (
      !matchesMaintenanceSecret(
        request.headers.get("authorization"),
        config.secret,
      )
    )
      return NextResponse.json(
        { status: "unauthorized" },
        { status: 401, headers },
      );
    const storage = parsePrivateStorageConfig(process.env);
    const [db, lifecycle] = await Promise.all([
      getAppDb(),
      getUploadLifecycle(),
    ]);
    const result = await runUploadMaintenanceBatch({
      db,
      lifecycle,
      storage,
      authorizedStoreIds: config.storeIds,
      requestId: crypto.randomUUID(),
    });
    // Counts only: no pathname, credential, filename or document content.
    return NextResponse.json(
      { status: result.retries ? "retry_pending" : "ok", ...result },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
