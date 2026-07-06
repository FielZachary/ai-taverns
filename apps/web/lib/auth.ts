import {
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";

export type AuthUser = {
  id: string;
  email?: string;
};

export async function getOptionalUser(): Promise<AuthUser | null> {
  const cookieHeader = await getRequestCookieHeader();
  const response = await fetch(`${getFastifyApiBaseUrl()}/api/auth/me`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store"
  });

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
