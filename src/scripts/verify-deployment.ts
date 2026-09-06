import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { healthResponseSchema } from "@/domain/health/schemas";
import { evaluatePreproductionEnvironment } from "@/server/deployment/preflight";
import { getAuthEnv, getServerEnv } from "@/server/env";

const environmentFile = process.env.DEPLOYMENT_ENV_FILE ?? ".env.local";
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const preflight = evaluatePreproductionEnvironment(process.env);
if (preflight.status === "blocked") {
  console.error(JSON.stringify(preflight, null, 2));
  process.exitCode = 1;
} else {
  const publicUrl = new URL(getAuthEnv().BETTER_AUTH_URL);
  const healthUrl = new URL("/api/health", publicUrl);
  const response = await fetch(healthUrl, {
    headers: { "User-Agent": "fleg-deployment-verifier/0.1.0" },
    signal: AbortSignal.timeout(getServerEnv().HEALTH_CHECK_TIMEOUT_MS + 2_000),
  });
  const payload: unknown = await response.json();
  const health = healthResponseSchema.parse(payload);
  const ready = response.ok && health.status === "ok";
  console.log(
    JSON.stringify(
      {
        status: ready ? "ready" : "blocked",
        endpoint: healthUrl.origin,
        health,
      },
      null,
      2,
    ),
  );
  if (!ready) process.exitCode = 1;
}
