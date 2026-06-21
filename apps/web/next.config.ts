import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@ai-dnd/shared"]
};

export default nextConfig;
