import "server-only";

import type { HealthResponse } from "@/domain/health/schemas";
import { getAppDb, getMongoClient } from "@/server/db/mongo-client";
import { getServerEnv } from "@/server/env";
import { reportServerError } from "@/server/observability/logger";

class HealthCheckTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Le contrôle de disponibilité a dépassé ${timeoutMs} ms`);
    this.name = "HealthCheckTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new HealthCheckTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkApplicationReadiness(
  requestId: string,
): Promise<HealthResponse> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  const { HEALTH_CHECK_TIMEOUT_MS } = getServerEnv();
  let database: HealthResponse["services"]["database"] = "down";
  let indexes: HealthResponse["services"]["indexes"] = "unavailable";
  let databaseLatencyMs: number | null = null;

  try {
    await withTimeout(
      (async () => {
        const client = await getMongoClient();
        const databaseStartedAt = performance.now();
        await client.db("admin").command({ ping: 1 });
        databaseLatencyMs = Math.round(performance.now() - databaseStartedAt);
        database = "up";
        await getAppDb();
        indexes = "ready";
      })(),
      HEALTH_CHECK_TIMEOUT_MS,
    );

    return {
      status: "ok",
      services: { database, indexes },
      metrics: {
        databaseLatencyMs,
        readinessLatencyMs: Math.round(performance.now() - startedAt),
      },
      requestId,
      checkedAt,
    };
  } catch (error) {
    reportServerError({
      event: "application.readiness.failed",
      requestId,
      message: "Le contrôle de disponibilité de l’application a échoué",
      error,
      route: "/api/health",
      method: "GET",
      statusCode: 503,
      context: { database, indexes },
    });

    return {
      status: "unhealthy",
      services: { database, indexes },
      metrics: {
        databaseLatencyMs,
        readinessLatencyMs: Math.round(performance.now() - startedAt),
      },
      requestId,
      checkedAt,
    };
  }
}
