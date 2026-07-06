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
