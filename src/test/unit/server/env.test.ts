import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  parseAuthEnv,
  parseCopilotEnv,
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
      MONGODB_MAX_POOL_SIZE: 20,
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: 5_000,
      MONGODB_CONNECT_TIMEOUT_MS: 10_000,
      HEALTH_CHECK_TIMEOUT_MS: 8_000,
    });
  });

  it("coerces bounded connection and readiness settings", () => {
    expect(
      parseServerEnv({
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        MONGODB_MAX_POOL_SIZE: "35",
        MONGODB_SERVER_SELECTION_TIMEOUT_MS: "2500",
        MONGODB_CONNECT_TIMEOUT_MS: "4000",
        HEALTH_CHECK_TIMEOUT_MS: "3000",
      }),
    ).toMatchObject({
      MONGODB_MAX_POOL_SIZE: 35,
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: 2_500,
      MONGODB_CONNECT_TIMEOUT_MS: 4_000,
      HEALTH_CHECK_TIMEOUT_MS: 3_000,
    });

    expect(() =>
      parseServerEnv({
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        MONGODB_MAX_POOL_SIZE: "0",
      }),
    ).toThrow(EnvironmentValidationError);
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

describe("parseCopilotEnv", () => {
  it("keeps the API key optional and applies bounded defaults", () => {
    expect(parseCopilotEnv({})).toEqual({
      OPENAI_MODEL: "gpt-5-mini",
      OPENAI_MAX_OUTPUT_TOKENS: 1_200,
      OPENAI_MAX_TOOL_ROUNDS: 4,
      OPENAI_TIMEOUT_MS: 30_000,
    });
    expect(parseCopilotEnv({ OPENAI_API_KEY: "  " }).OPENAI_API_KEY).toBe(
      undefined,
    );
  });

  it("accepts explicit provider settings and rejects unsafe bounds", () => {
    expect(
      parseCopilotEnv({
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "model-test",
        OPENAI_MAX_OUTPUT_TOKENS: "600",
        OPENAI_MAX_TOOL_ROUNDS: "2",
        OPENAI_TIMEOUT_MS: "10000",
      }),
    ).toMatchObject({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "model-test",
      OPENAI_MAX_TOOL_ROUNDS: 2,
    });
    expect(() =>
      parseCopilotEnv({ OPENAI_MAX_TOOL_ROUNDS: "100" }),
    ).toThrow(EnvironmentValidationError);
  });
});
