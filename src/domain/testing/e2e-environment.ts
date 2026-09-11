import * as z from "zod";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function requireLocalMongoUri(uri: string): string {
  // Restrict to one explicit loopback host. SRV, userinfo and replica host lists
  // are intentionally forbidden: acceptance tests must never reach Atlas.
  const parsed = new URL(uri);
  if (parsed.protocol !== "mongodb:" || !loopbackHosts.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error("Les E2E exigent une instance MongoDB locale jetable, jamais Atlas");
  }
  return uri;
}

export function requireE2eEnvironment(env: Record<string, string | undefined>) {
  const result = z.object({
    E2E_RUN_ID: z.string().regex(/^[a-f0-9]{12}$/),
    MONGODB_URI: z.string().min(1),
    MONGODB_APP_DB: z.string(),
    MONGODB_AUTH_DB: z.string(),
    PLAYWRIGHT_BASE_URL: z.url(),
  }).safeParse(env);
  if (!result.success) throw new Error("Exécutez npm run test:e2e : l’environnement isolé est obligatoire");
  const value = result.data;
  requireLocalMongoUri(value.MONGODB_URI);
  if (value.MONGODB_APP_DB !== `fleg_e2e_${value.E2E_RUN_ID}_app` || value.MONGODB_AUTH_DB !== `fleg_e2e_${value.E2E_RUN_ID}_auth`) {
    throw new Error("Bases E2E invalides : refus de toucher à une base partagée");
  }
  const url = new URL(value.PLAYWRIGHT_BASE_URL);
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname) || url.port !== "3100" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Le serveur E2E doit être local sur le port 3100");
  }
  return value;
}
