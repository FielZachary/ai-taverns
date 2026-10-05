import {
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";

export async function POST(request: Request) {
  const cookie = await getRequestCookieHeader();
  const upstream = await fetch(
    `${getFastifyApiBaseUrl()}/api/internal/dm-lab/compare`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {})
      },
      body: await request.text(),
      cache: "no-store"
    }
  );

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json"
    }
  });
}
