import type { NextConfig } from "next";

/**
 * Next.js configuration.
 * Setting `outputFileTracingRoot` to an absolute path resolves the warning and
 * ensures the build can locate generated type files.
 */
const nextConfig: NextConfig = {
  // Absolute workspace root for file tracing
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
};

export default nextConfig;
