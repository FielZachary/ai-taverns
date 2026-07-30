import { NextResponse } from "next/server";
import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  getPublicAppOrigin,
  safeNextPath
} from "@/lib/fastify-api";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = safeNextPath(requestUrl.searchParams.get("nextPath"));
  const upstreamUrl = new URL(
    `${getFastifyApiBaseUrl()}/api/auth/google/start`
  );

  upstreamUrl.searchParams.set("nextPath", nextPath);

  const upstream = await fetch(upstreamUrl, {
    redirect: "manual",
    cache: "no-store"
  });
  const location = upstream.headers.get("location");

  if (!location || upstream.status < 300 || upstream.status >= 400) {
    return NextResponse.redirect(
      new URL("/login?error=google-auth", getPublicAppOrigin())
    );
  }

  const response = NextResponse.redirect(location);
  copySetCookieHeaders(upstream, response);

  return response;
}
