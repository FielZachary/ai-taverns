import { NextResponse } from "next/server";
import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  getPublicAppOrigin,
  getRequestCookieHeader
} from "@/lib/fastify-api";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${getFastifyApiBaseUrl()}/api/auth/google/callback`
  );

  upstreamUrl.search = requestUrl.search;

  const cookieHeader = await getRequestCookieHeader();
  const upstream = await fetch(upstreamUrl, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    redirect: "manual",
    cache: "no-store"
  });
  const location =
    upstream.headers.get("location") ??
    new URL("/login?error=google-auth", getPublicAppOrigin()).toString();
  const response = NextResponse.redirect(location);

  copySetCookieHeaders(upstream, response);

  return response;
}
