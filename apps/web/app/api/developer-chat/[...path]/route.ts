import { getFastifyApiBaseUrl, getRequestCookieHeader } from "@/lib/fastify-api";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const cookies = await getRequestCookieHeader();
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/developer-chat/${path.map(encodeURIComponent).join("/")}`, { method: request.method, headers: { ...(cookies ? { cookie: cookies } : {}), ...(request.method === "POST" ? { "content-type": "application/json" } : {}) }, body: request.method === "POST" ? await request.text() : undefined, cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
export const GET = proxy;
export const POST = proxy;
