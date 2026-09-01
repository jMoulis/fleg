import { NextResponse } from "next/server";

import {
  healthResponseSchema,
  type HealthResponse,
} from "@/domain/health/schemas";
import { pingMongo } from "@/server/db/mongo-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const requestId = crypto.randomUUID();

  try {
    await pingMongo();

    const response: HealthResponse = healthResponseSchema.parse({
      status: "ok",
      services: { database: "up" },
      requestId,
      checkedAt,
    });

    return NextResponse.json(response);
  } catch {
    const response: HealthResponse = healthResponseSchema.parse({
      status: "unhealthy",
      services: { database: "down" },
      requestId,
      checkedAt,
    });

    return NextResponse.json(response, { status: 503 });
  }
}
