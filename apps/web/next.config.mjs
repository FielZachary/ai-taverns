import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fastifyApiOrigin = (
  process.env.FASTIFY_API_INTERNAL_ORIGIN ??
  process.env.NEXT_PUBLIC_FASTIFY_API_ORIGIN ??
  "http://127.0.0.1:4000"
).replace(/\/$/, "");

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${fastifyApiOrigin}/api/:path*`
      },
      {
        source: "/health",
        destination: `${fastifyApiOrigin}/health`
      }
    ];
  }
};

export default nextConfig;
