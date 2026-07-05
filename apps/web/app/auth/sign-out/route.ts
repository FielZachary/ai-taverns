import { NextResponse } from "next/server";
import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";

export async function POST(request: Request) {
  const cookieHeader = await getRequestCookieHeader();
  const upstream = await fetch(`${getFastifyApiBaseUrl()}/api/auth/sign-out`, {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store"
  });

  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303
  });

  copySetCookieHeaders(upstream, response);

  return response;
}
