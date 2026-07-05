import { proxyJsonToFastify } from "@/lib/fastify-api";

export async function POST(request: Request) {
  return proxyJsonToFastify(request, "/api/auth/passwordless/start");
}
