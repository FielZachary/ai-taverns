import {
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";
import { cookies } from "next/headers";

export type AuthUser = {
  id: string;
  email?: string;
};

const playwrightAuthCookieName = "ai_taverns_playwright_user";

async function getPlaywrightUser(): Promise<AuthUser | null> {
  if (
    process.env.PLAYWRIGHT_AUTH_BYPASS !== "true" ||
    process.env.NODE_ENV === "production"
  ) {
    return null;
  }

  const cookieStore = await cookies();
  const email = cookieStore
    .getAll()
    .find((cookie) => cookie.name === playwrightAuthCookieName)
    ?.value.trim();

  if (!email) {
    return null;
  }

  return {
    id: "playwright-user",
    email
  };
}

export async function getOptionalUser(): Promise<AuthUser | null> {
  const playwrightUser = await getPlaywrightUser();

  if (playwrightUser) {
    return playwrightUser;
  }

  const cookieHeader = await getRequestCookieHeader();
  let response: Response;

  try {
    response = await fetch(`${getFastifyApiBaseUrl()}/api/auth/me`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: "no-store"
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const auth = (await response.json()) as
    | {
        authenticated: false;
        user: null;
      }
    | {
        authenticated: true;
        user: {
          id: string;
          email: string;
        };
      };

  if (!auth.authenticated) {
    return null;
  }

  return {
    id: auth.user.id,
    email: auth.user.email
  };
}
