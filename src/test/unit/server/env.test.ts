import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  parseAuthEnv,
  parseServerEnv,
  getImportEnv,
} from "@/server/env";

describe("parseServerEnv", () => {
  it("applies the logical database defaults", () => {
    expect(
      parseServerEnv({ MONGODB_URI: "mongodb://127.0.0.1:27017" }),
    ).toEqual({
      MONGODB_URI: "mongodb://127.0.0.1:27017",
      MONGODB_AUTH_DB: "fl_cockpit_auth",
      MONGODB_APP_DB: "fl_cockpit_app",
    });
  });

  it("rejects a missing connection string", () => {
    expect(() => parseServerEnv({})).toThrow(EnvironmentValidationError);
  });

  it("rejects unsupported connection protocols", () => {
    expect(() =>
      parseServerEnv({ MONGODB_URI: "https://database.example.com" }),
    ).toThrow(EnvironmentValidationError);
  });
});

describe("import environment", () => {
  it("exposes a configurable positive upload boundary", () => {
    const previous = process.env.IMPORT_MAX_BYTES;
    process.env.IMPORT_MAX_BYTES = "2500000";

    try {
      expect(getImportEnv().IMPORT_MAX_BYTES).toBe(2_500_000);
    } finally {
      if (previous === undefined) {
        delete process.env.IMPORT_MAX_BYTES;
      } else {
        process.env.IMPORT_MAX_BYTES = previous;
      }
    }
  });
});

describe("parseAuthEnv", () => {
  const validSecret = "a-secure-development-secret-with-32-characters";

  it("disables public sign-up by default", () => {
    expect(
      parseAuthEnv({
        BETTER_AUTH_SECRET: validSecret,
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toEqual({
      BETTER_AUTH_SECRET: validSecret,
      BETTER_AUTH_URL: "http://localhost:3000",
      AUTH_ALLOW_SIGN_UP: false,
    });
  });

  it("rejects a short authentication secret", () => {
    expect(() =>
      parseAuthEnv({
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).toThrow(EnvironmentValidationError);
  });
});
