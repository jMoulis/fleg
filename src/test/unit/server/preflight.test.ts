import { describe, expect, it } from "vitest";

import { evaluatePreproductionEnvironment } from "@/server/deployment/preflight";

const readyEnvironment = {
  MONGODB_URI:
    "mongodb+srv://application:password@cluster.production.mongodb.net/?retryWrites=true&w=majority",
  MONGODB_AUTH_DB: "cockpit_auth",
  MONGODB_APP_DB: "cockpit_app",
  BETTER_AUTH_SECRET: "5sPxUHd6k9vQ2mX8rL4cT7nB1wF3zJ0a",
  BETTER_AUTH_URL: "https://preproduction.cockpit.example",
  AUTH_ALLOW_SIGN_UP: "false",
  INVITATION_EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test",
  INVITATION_EMAIL_FROM: "F&L Cockpit <invitation@cockpit.example>",
};

describe("preproduction environment", () => {
  it("accepts a secret-safe Node 24 production configuration", () => {
    const result = evaluatePreproductionEnvironment(
      readyEnvironment,
      "24.20.0",
    );

    expect(result.status).toBe("ready");
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: "copilot", status: "warning" }),
    );
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("re_test");
  });

  it("blocks placeholders, public signup and manual invitations", () => {
    const result = evaluatePreproductionEnvironment(
      {
        ...readyEnvironment,
        MONGODB_URI:
          "mongodb+srv://username:password@cluster.example.mongodb.net/",
        BETTER_AUTH_SECRET: "replace-with-at-least-32-random-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
        AUTH_ALLOW_SIGN_UP: "true",
        INVITATION_EMAIL_PROVIDER: "manual",
      },
      "22.0.0",
    );

    expect(result.status).toBe("blocked");
    expect(
      result.checks.filter(({ status }) => status === "blocked").length,
    ).toBeGreaterThanOrEqual(5);
  });
});
