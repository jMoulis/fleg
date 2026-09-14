import { NextResponse } from "next/server";
import { z } from "zod";
import {
  documentProcessingConfig,
  runDocumentProcessingBatch,
} from "@/server/services/document-processing-service";
import { matchesMaintenanceSecret } from "@/server/storage/maintenance-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const config = documentProcessingConfig();
    if (!config) return NextResponse.json({ status: "disabled" }, { headers });
    const secret = z.string().min(32).max(256).parse(process.env.CRON_SECRET);
    if (!matchesMaintenanceSecret(request.headers.get("authorization"), secret))
      return NextResponse.json(
        { status: "unauthorized" },
        { status: 401, headers },
      );
    const counts = await runDocumentProcessingBatch(config.storeIds);
    return NextResponse.json({ status: "ok", ...counts }, { headers });
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
