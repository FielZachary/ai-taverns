import { NextResponse } from "next/server";
import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  getPublicAppOrigin,
  safeNextPath
} from "@/lib/fastify-api";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicAppOrigin = getPublicAppOrigin();
  const token = requestUrl.searchParams.get("token");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", publicAppOrigin)
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
      new URL("/login?error=invalid-link", publicAppOrigin)
    );
  }

  const response = NextResponse.redirect(new URL(next, publicAppOrigin));
  copySetCookieHeaders(upstream, response);

  return response;
}
