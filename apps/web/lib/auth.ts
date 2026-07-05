import { query } from "@/lib/db";
import {
  getFastifyApiBaseUrl,
  getRequestCookieHeader
} from "@/lib/fastify-api";

export type AuthUser = {
  id: string;
  email?: string;
};

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

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

export async function requireUser() {
  const user = await getOptionalUser();

  if (!user) {
    throw new HttpError("Sign in to continue.", 401);
  }

  return user;
}

export async function assertCampaignAccess(campaignId: string, userId: string) {
  const result = await query<{ id: string }>(
    `
      select campaigns.id
      from campaigns
      where campaigns.id = $1
        and campaigns.status <> 'deleted'
        and (
          campaigns.owner_user_id = $2
          or exists (
            select 1
            from players
            where players.campaign_id = campaigns.id
              and players.user_id = $3
              and players.status = 'active'
          )
        )
      limit 1
    `,
    [campaignId, userId, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("You do not have access to that campaign.", 403);
  }
}

export async function assertCampaignAccessBySessionId(
  sessionId: string,
  userId: string
) {
  const result = await query<{ id: string }>(
    `
      select campaigns.id
      from campaigns
      where campaigns.hermes_session_id = $1
        and campaigns.status <> 'deleted'
        and (
          campaigns.owner_user_id = $2
          or exists (
            select 1
            from players
            where players.campaign_id = campaigns.id
              and players.user_id = $3
              and players.status = 'active'
          )
        )
      limit 1
    `,
    [sessionId, userId, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("You do not have access to that campaign.", 403);
  }
}

export async function assertCampaignOwner(campaignId: string, userId: string) {
  const result = await query<{ id: string }>(
    `
      select id
      from campaigns
      where id = $1
        and owner_user_id = $2
        and status <> 'deleted'
      limit 1
    `,
    [campaignId, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("Only the campaign owner can do that.", 403);
  }
}
