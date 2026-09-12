import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import { requireE2eEnvironment, requireLocalMongoUri } from "../domain/testing/e2e-environment";

async function run() {
  const runId = randomBytes(6).toString("hex");
  const container = `fleg-e2e-${runId}`;
  let ownsContainer = false;
  let client: MongoClient | undefined;
  try {
    let uri = process.env.E2E_MONGODB_URI;
    if (!uri) {
      execFileSync("docker", ["run", "--detach", "--rm", "--name", container,
        "--publish", "127.0.0.1::27017", "mongo:8.0", "--replSet", "rs0", "--bind_ip_all"], { stdio: "pipe" });
      ownsContainer = true;
      const port = execFileSync("docker", ["inspect", "--format", '{{(index (index .NetworkSettings.Ports "27017/tcp") 0).HostPort}}', container], { encoding: "utf8" }).trim();
      uri = `mongodb://127.0.0.1:${port}/?directConnection=true&replicaSet=rs0`;
      let started = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          execFileSync("docker", ["exec", container, "mongosh", "--quiet", "--eval",
            'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'], { stdio: "pipe" });
          started = true;
          break;
        } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
      }
      if (!started) throw new Error("MongoDB E2E ne démarre pas");
    }
    requireLocalMongoUri(uri);
    const baseURL = "http://localhost:3100";
    const env = {
      ...process.env,
      E2E_RUN_ID: runId,
      MONGODB_URI: uri,
      MONGODB_APP_DB: `fleg_e2e_${runId}_app`,
      MONGODB_AUTH_DB: `fleg_e2e_${runId}_auth`,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      PLAYWRIGHT_BASE_URL: baseURL,
      NEXT_DIST_DIR: ".next-e2e",
      AUTH_ALLOW_SIGN_UP: "false",
      INVITATION_EMAIL_PROVIDER: "manual",
      OPENAI_API_KEY: process.env.RUN_LIVE_AI_E2E === "true" ? (process.env.OPENAI_API_KEY ?? "") : "",
      // Next loads .env.local even for the E2E production build. Explicit empty
      // credentials take priority: tests must never contact a real Blob store.
      BLOB_INTENTS_ENABLED: "false",
      BLOB_DEV_UPLOADS_ENABLED: "false",
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_STORE_ID: "",
      BLOB_NAMESPACE: "",
      BLOB_ENV_QUOTA_BYTES: "",
      BLOB_STORE_QUOTA_BYTES: "",
      BLOB_STORE_QUOTA_OBJECTS: "",
      BLOB_ENV_QUOTA_OBJECTS: "",
      VERCEL_OIDC_TOKEN: "",
      BLOB_WEBHOOK_PUBLIC_KEY: "",
      SEED_ENV_FILE: "/dev/null",
      SEED_DEMO_EMAIL: "admin@fleg.local",
      SEED_DEMO_PASSWORD: "FlegDemo!2026",
      SEED_DEMO_MANAGER_EMAIL: "manager@fleg.local",
      SEED_DEMO_MANAGER_PASSWORD: "FlegManager!2026",
      SEED_DEMO_ORGANIZATION_SLUG: "reseau-fl-demo",
      SEED_DEMO_STORE_CODE: "DEMO-01",
      SEED_DEMO_CONTROL_STORE_CODE: "DEMO-02",
      E2E_EMAIL: "admin@fleg.local",
      E2E_PASSWORD: "FlegDemo!2026",
    };
    requireE2eEnvironment(env);
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 30_000 });
    await client.connect();
    const runChild = (args: string[], command = process.execPath) => new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: "inherit", env });
      const stop = () => child.kill("SIGTERM");
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      child.once("error", reject);
      child.once("exit", code => {
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        if (code === 0) resolve(); else reject(new Error(`Étape E2E échouée (${code})`));
      });
    });
    await runChild(["--import", "tsx", "src/scripts/seed-demo.ts"]);
    // Preserve the project’s bundler/build contract (including TECH-01’s SW).
    await runChild(["run", "build:e2e"], "npm");
    await runChild(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]);
  } finally {
    try {
      if (client) {
        // Only the two generated database names from this invocation can be dropped.
        await Promise.all([
          client.db(`fleg_e2e_${runId}_app`).dropDatabase(),
          client.db(`fleg_e2e_${runId}_auth`).dropDatabase(),
        ]);
      }
    } finally {
      try { await client?.close(); }
      finally { if (ownsContainer) execFileSync("docker", ["stop", container], { stdio: "pipe" }); }
    }
  }
}

run().catch(() => {
  console.error("E2E interrompus. Démarrez Docker ou fournissez E2E_MONGODB_URI vers un replica set local jetable. Aucun accès Atlas n’est autorisé.");
  process.exitCode = 1;
});
