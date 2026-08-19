import { getFastifyApiBaseUrl, getRequestCookieHeader } from "@/lib/fastify-api";

export async function GET() {
  const cookie = await getRequestCookieHeader();
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/account/usage`, { headers: cookie ? { cookie } : undefined, cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
