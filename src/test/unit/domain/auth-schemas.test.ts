import { describe, expect, it } from "vitest";

import {
  authenticationCallbackPathSchema,
  signInInputSchema,
} from "@/domain/auth/schemas";

describe("signInInputSchema", () => {
  it("normalizes a valid sign-in boundary", () => {
    expect(
      signInInputSchema.parse({
        email: "manager@example.com",
        password: "secure-password",
      }),
    ).toEqual({
      email: "manager@example.com",
      password: "secure-password",
    });
  });

  it("rejects malformed credentials before calling Better Auth", () => {
    expect(
      signInInputSchema.safeParse({ email: "not-an-email", password: "short" })
        .success,
    ).toBe(false);
  });
});

describe("authenticationCallbackPathSchema", () => {
  it("accepts an internal invitation path", () => {
    expect(
      authenticationCallbackPathSchema.parse("/invitations/invite-1"),
    ).toBe("/invitations/invite-1");
  });

  it("rejects protocol-relative redirects", () => {
    expect(authenticationCallbackPathSchema.safeParse("//evil.test").success).toBe(
      false,
    );
  });
});
