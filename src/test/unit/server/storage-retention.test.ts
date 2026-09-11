import { describe, expect, it } from "vitest";
import { requireE2eEnvironment, requireLocalMongoUri } from "@/domain/testing/e2e-environment";
import { recommendationExpiry } from "@/server/db/recommendation-retention";

describe("storage safety boundaries", () => {
  it("rejects Atlas and remote MongoDB even if test database names are used", () => {
    for (const uri of ["mongodb+srv://cluster.example/", "mongodb://remote.example:27017", "mongodb://user:pass@127.0.0.1", "mongodb://127.0.0.1,remote.example"]) {
      expect(() => requireLocalMongoUri(uri)).toThrow();
    }
    expect(requireLocalMongoUri("mongodb://127.0.0.1:27028/?replicaSet=test")).toContain("27028");
  });
  it("requires per-run databases and a local server, including for direct Playwright calls", () => {
    expect(() => requireE2eEnvironment({})).toThrow();
    const env = { E2E_RUN_ID: "abcdef123456", MONGODB_URI: "mongodb://127.0.0.1:27028", MONGODB_APP_DB: "fleg_e2e_abcdef123456_app", MONGODB_AUTH_DB: "fleg_e2e_abcdef123456_auth", PLAYWRIGHT_BASE_URL: "http://localhost:3100" };
    expect(requireE2eEnvironment(env)).toEqual(env);
    expect(() => requireE2eEnvironment({ ...env, MONGODB_APP_DB: "fl_cockpit_app" })).toThrow();
    expect(() => requireE2eEnvironment({ ...env, PLAYWRIGHT_BASE_URL: "https://fleg-two.vercel.app" })).toThrow();
  });
  it("uses explicit bounded retention and rejects invalid configuration", () => {
    const expiry = recommendationExpiry(new Date("2026-09-11T12:00:00Z"), {});
    expect(expiry.current.toISOString()).toBe("2026-09-18T12:00:00.000Z");
    expect(expiry.superseded.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(() => recommendationExpiry(new Date(), { RECOMMENDATION_CACHE_DAYS: "0" })).toThrow();
  });
});
