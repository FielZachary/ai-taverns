import {
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";

const jsonHeaders = {
  "content-type": "application/json"
};

function portraitPreviewApiUrl() {
  return `${getFastifyApiBaseUrl()}/api/campaigns/portrait/preview`;
}

function proxyJsonResponse(upstream: Response) {
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json"
    }
  });
}

export async function POST(request: Request) {
  const cookieHeader = await getRequestCookieHeader();
  const upstream = await fetch(portraitPreviewApiUrl(), {
    method: "POST",
    headers: {
      ...jsonHeaders,
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    },
    body: await request.text(),
    cache: "no-store"
  });

  return proxyJsonResponse(upstream);
}
