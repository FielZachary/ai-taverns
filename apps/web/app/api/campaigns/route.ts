import { proxyJsonToFastify } from "@/lib/fastify-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyJsonToFastify(request, "/api/campaigns");
}

export async function POST(request: Request) {
  return proxyJsonToFastify(request, "/api/campaigns");
}
