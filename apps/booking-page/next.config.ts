import type { NextConfig } from "next";

// Photos are served by RatesSpot (…/media/<id>); allow its host for next/image.
const api = new URL(process.env.RATESSPOT_API_URL ?? "https://api.ratesspot.com");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The SDK ships as TypeScript source in this monorepo.
  transpilePackages: ["@ratesspot/sdk"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: api.protocol.replace(":", "") as "http" | "https", hostname: api.hostname, ...(api.port ? { port: api.port } : {}), pathname: "/media/**" }],
    // A RatesSpot photo never changes (a new photo gets a new id), so optimised copies can be kept long.
    minimumCacheTTL: 2_678_400,
    // Only for local testing against a RatesSpot on localhost. Never in production.
    dangerouslyAllowLocalIP: process.env.ALLOW_LOCAL_IMAGES === "1",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Businesses may embed their booking page in their own site.
          { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'" },
        ],
      },
      // Manage links carry a private token: never framed, never cached, no referrer.
      {
        source: "/:slug/manage/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
