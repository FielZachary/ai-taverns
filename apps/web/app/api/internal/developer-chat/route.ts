import { getFastifyApiBaseUrl } from "@/lib/fastify-api";
import { isDeveloperChatAuthenticated } from "@/lib/developer-chat-auth";

async function developerHeaders() {
  if (!(await isDeveloperChatAuthenticated()) || !process.env.DEV_CHAT_PASSWORD) return null;
  return { "x-developer-chat-password": process.env.DEV_CHAT_PASSWORD };
}

export async function GET(request: Request) {
  const headers = await developerHeaders();
  if (!headers) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const threadId = new URL(request.url).searchParams.get("threadId");
  const suffix = threadId ? `/${encodeURIComponent(threadId)}` : "";
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/internal/developer-chat${suffix}`, { headers, cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}

export async function POST(request: Request) {
  const headers = await developerHeaders();
  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!headers || !threadId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/internal/developer-chat/${encodeURIComponent(threadId)}/messages`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: await request.text(), cache: "no-store" });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
}
