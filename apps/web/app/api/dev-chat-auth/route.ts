import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { developerChatCookie } from "@/lib/developer-chat-auth";

export async function POST(request: Request) {
  const configured = process.env.DEV_CHAT_PASSWORD;
  const value = String((await request.json().catch(() => ({})) as { password?: string }).password ?? "");
  if (!configured || value.length !== configured.length || !timingSafeEqual(Buffer.from(value), Buffer.from(configured))) return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  const cookie = developerChatCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
