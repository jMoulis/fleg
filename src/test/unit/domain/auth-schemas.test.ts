import { describe, expect, it } from "vitest";

import { signInInputSchema } from "@/domain/auth/schemas";

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
