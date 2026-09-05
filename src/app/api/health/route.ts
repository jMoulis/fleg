import { NextResponse } from "next/server";

import {
  healthResponseSchema,
} from "@/domain/health/schemas";
import { checkApplicationReadiness } from "@/server/services/health-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const readiness = healthResponseSchema.parse(
    await checkApplicationReadiness(requestId),
  );

  return NextResponse.json(readiness, {
    status: readiness.status === "ok" ? 200 : 503,
  });
}
