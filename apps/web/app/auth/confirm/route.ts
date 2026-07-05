import { NextResponse } from "next/server";
import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  safeNextPath
} from "@/lib/fastify-api";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", requestUrl.origin)
    );
  }

  const upstream = await fetch(
    `${getFastifyApiBaseUrl()}/api/auth/passwordless/verify`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ token }),
      cache: "no-store"
    }
  );

  if (!upstream.ok) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", requestUrl.origin)
    );
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  copySetCookieHeaders(upstream, response);

  return response;
}
