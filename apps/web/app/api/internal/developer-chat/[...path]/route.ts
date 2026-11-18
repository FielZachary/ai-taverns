import { getFastifyApiBaseUrl } from "@/lib/fastify-api";
import { isDeveloperChatAuthenticated } from "@/lib/developer-chat-auth";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!(await isDeveloperChatAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { path } = await context.params;
  const password = process.env.DEV_CHAT_PASSWORD;
  if (!password) return Response.json({ error: "Not configured" }, { status: 404 });
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/internal/developer-chat/${path.map(encodeURIComponent).join("/")}`, { method: request.method, headers: { "x-developer-chat-password": password, ...(request.method === "POST" ? { "content-type": "application/json" } : {}) }, body: request.method === "POST" ? await request.text() : undefined, cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
export const GET = proxy;
export const POST = proxy;
