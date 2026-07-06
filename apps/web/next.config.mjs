import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const isVercelBuild = process.env.VERCEL === "1";

/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(isVercelBuild ? {} : { outputFileTracingRoot: repoRoot }),
  ...(isVercelBuild ? {} : { turbopack: { root: repoRoot } })
};

export default nextConfig;
