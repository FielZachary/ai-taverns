import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot
};

export default nextConfig;
