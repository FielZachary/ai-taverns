import { proxyJsonToFastify } from "@/lib/fastify-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyJsonToFastify(request, "/api/auth/claim-guest-state");
}
