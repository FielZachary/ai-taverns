import { cookies } from "next/headers";

export function getFastifyApiBaseUrl() {
  return (
    process.env.FASTIFY_API_INTERNAL_ORIGIN ??
    process.env.NEXT_PUBLIC_FASTIFY_API_ORIGIN ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
}

export function safeNextPath(value: string | null) {
  return value?.startsWith("/") ? value : "/play";
}

export async function getRequestCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

export function copySetCookieHeaders(source: Response, target: Response) {
  const headers = source.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : source.headers.get("set-cookie")
        ? [source.headers.get("set-cookie")!]
        : [];

  for (const setCookie of setCookieHeaders) {
    target.headers.append("set-cookie", setCookie);
  }
}

export async function proxyJsonToFastify(
  request: Request,
  path: string,
  init: RequestInit = {}
) {
  const cookieHeader = await getRequestCookieHeader();
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();
  const headers = new Headers(init.headers);

  headers.set("accept", "application/json");

  if (body) {
    headers.set(
      "content-type",
      request.headers.get("content-type") ?? "application/json"
    );
  }

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const upstream = await fetch(`${getFastifyApiBaseUrl()}${path}`, {
    ...init,
    method: init.method ?? request.method,
    headers,
    body,
    cache: "no-store"
  });
  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json"
    }
  });

  copySetCookieHeaders(upstream, response);

  return response;
}
