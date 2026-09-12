import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const securityHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const nextConfig: NextConfig = {
  turbopack: {},
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  compress: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/\\[organizationSlug\\]/stores/\\[storeId\\]/help": ["./docs/user/*.md"],
    "/\\[organizationSlug\\]/stores/\\[storeId\\]/help/\\[section\\]": [
      "./docs/user/*.md",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/api/stores/:storeId/attachments/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/storage/blob/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  register: false,
  reloadOnOnline: false,
  cacheOnNavigation: false,
  additionalPrecacheEntries: [
    {
      url: "/offline",
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(),
    },
    { url: "/pwa-192.png", revision: "1" },
    { url: "/pwa-512.png", revision: "1" },
  ],
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.filter(
        ({ url }) =>
          (url.startsWith("/_next/static/") && !url.endsWith(".map")) ||
          ["/offline", "/pwa-192.png", "/pwa-512.png"].includes(url),
      ),
      warnings: [],
    }),
  ],
})(nextConfig);
