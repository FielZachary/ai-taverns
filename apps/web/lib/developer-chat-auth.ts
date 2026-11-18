import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "ai_taverns_developer_chat";

function signature() {
  const password = process.env.DEV_CHAT_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("developer-chat-v1").digest("base64url");
}

export async function isDeveloperChatAuthenticated() {
  const expected = signature();
  const actual = (await cookies()).get(cookieName)?.value;
  if (!expected || !actual || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function developerChatCookie() {
  const value = signature();
  if (!value) throw new Error("Developer chat is not configured.");
  return { name: cookieName, value, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/dev/chat", maxAge: 60 * 60 * 12 } };
}
