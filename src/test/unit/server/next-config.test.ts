import { describe, expect, it } from "vitest";

import nextConfig from "../../../../next.config";

describe("Next.js hardening", () => {
  it("removes framework disclosure and sends browser security headers", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.compress).toBe(true);
    expect(nextConfig.outputFileTracingIncludes).toEqual({
      "/\\[organizationSlug\\]/stores/\\[storeId\\]/help": [
        "./docs/user/*.md",
      ],
      "/\\[organizationSlug\\]/stores/\\[storeId\\]/help/\\[section\\]": [
        "./docs/user/*.md",
      ],
    });

    const entries = await nextConfig.headers?.();
    const globalHeaders = entries?.find(
      (entry) => entry.source === "/:path*",
    )?.headers;
    const apiHeaders = entries?.find(
      (entry) => entry.source === "/api/:path*",
    )?.headers;

    expect(globalHeaders).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Permissions-Policy",
          value: "camera=(), geolocation=(), microphone=()",
        },
      ]),
    );
    expect(apiHeaders).toContainEqual({
      key: "Cache-Control",
      value: "no-store",
    });
  });
});
