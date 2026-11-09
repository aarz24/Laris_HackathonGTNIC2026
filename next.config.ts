import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // QRIS actions load Sharp; keep its native addon and libvips in the root function.
  outputFileTracingIncludes: {
    "/": ["./node_modules/@img/sharp-*/**/*"],
  },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
};

export default nextConfig;
