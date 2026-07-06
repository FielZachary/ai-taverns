import { proxyJsonToFastify } from "@/lib/fastify-api";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  return proxyJsonToFastify(request, "/api/hermes/prep");
}
