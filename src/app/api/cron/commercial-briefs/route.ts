import { NextResponse } from "next/server";
import { z } from "zod";
import { matchesMaintenanceSecret } from "@/server/storage/maintenance-config";
import { runCommercialBriefBatch } from "@/server/services/commercial-brief-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const secret = z.string().min(32).max(256).parse(process.env.CRON_SECRET);
    if (!matchesMaintenanceSecret(request.headers.get("authorization"), secret))
      return NextResponse.json(
        { status: "unauthorized" },
        { status: 401, headers },
      );
    return NextResponse.json(
      { status: "ok", ...(await runCommercialBriefBatch()) },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
