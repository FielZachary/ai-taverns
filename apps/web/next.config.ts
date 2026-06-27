import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercelBuild ? {} : { outputFileTracingRoot: repoRoot }),
  ...(isVercelBuild ? {} : { turbopack: { root: repoRoot } })
};

export default nextConfig;
