import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": [".env*"],
  },
  turbopack: {},
  webpack(config) {
    // Opt in only for storage-constrained verification; hosted builds retain their cache.
    if (process.env.BUILD_DISABLE_CACHE === "true") config.cache = false;
    return config;
  },
  allowedDevOrigins: ["127.0.0.1"],
  // This shared workstation has little free disk space. Keep dev compilation
  // in memory instead of growing the regenerable Turbopack SST cache.
  experimental: { turbopackFileSystemCacheForDev: false },
  serverExternalPackages: [
    "@raydium-io/raydium-sdk-v2",
    "@pump-fun/pump-sdk",
    "@solana/web3.js",
    "@solana/spl-token",
    "litesvm",
  ],
};
export default config;
