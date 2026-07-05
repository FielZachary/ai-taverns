import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import {
  ApiErrorResponseSchema,
  AuthMeResponseSchema,
  AuthPasswordlessStartResponseSchema,
  AuthProtectedResponseSchema,
  CampaignCreateResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadResponseSchema
} from "@ai-dnd/contracts";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance;
let database: FakeDatabase;

type QueryResult<T> = {
  rows: T[];
};

type QueryFn = <T = unknown>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

type ConnectFn = () => Promise<{
  query: QueryFn;
  release: () => void;
}>;

type LoginTokenRecord = {
  id: string;
  email: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
};

type UserRecord = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
};

type SessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
};

type CampaignRecord = {
  id: string;
  hermes_session_id: string;
  mode: "single_player" | "multiplayer";
  title: string;
  status: "active" | "archived" | "deleted";
  has_begun: boolean;
  owner_user_id: string | null;
  owner_client_id: string | null;
  metadata: unknown;
  updated_at: Date;
  created_at: Date;
  display_character_name?: string | null;
  display_username?: string | null;
  join_code?: string | null;
};

type PlayerRecord = {
  id: string;
  campaign_id: string;
  client_id: string;
  user_id: string | null;
  username: string;
  character_name: string;
  character_sheet: string;
  slot: number | null;
  status: "active" | "left" | "kicked";
  last_seen_at: Date;
  kicked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type JoinCodeRecord = {
  id: string;
  campaign_id: string;
  code: string;
  enabled: boolean;
  created_by_user_id: string | null;
  created_at: Date;
  disabled_at: Date | null;
};

class FakeDatabase {
  loginTokens: LoginTokenRecord[] = [];
  users: UserRecord[] = [];
  sessions: SessionRecord[] = [];
  campaigns: CampaignRecord[] = [];
  players: PlayerRecord[] = [];
  joinCodes: JoinCodeRecord[] = [];
  campaignEvents: unknown[] = [];
  turns: unknown[] = [];
  nextId = 1;

  query: QueryFn = async <T>(sql: string, values: unknown[] = []) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql === "begin" || normalizedSql === "commit") {
      return { rows: [] as T[] };
    }

    if (normalizedSql === "rollback") {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into login_tokens")) {
      const record: LoginTokenRecord = {
        id: `login-token-${this.nextId++}`,
        email: values[0] as string,
        token_hash: values[1] as string,
        created_at: new Date(),
        expires_at: values[2] as Date,
        consumed_at: null
      };
      this.loginTokens.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("update login_tokens")) {
      const tokenHash = values[0] as string;
      const consumedAt = values[1] as Date;
      const record = this.loginTokens.find(
        (token) =>
          token.token_hash === tokenHash &&
          token.consumed_at === null &&
          token.expires_at > consumedAt
      );

      if (!record) {
        return { rows: [] as T[] };
      }

      record.consumed_at = consumedAt;
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("insert into users")) {
      const email = values[0] as string;
      const displayName = values[1] as string | null;
      let user = this.users.find((candidate) => candidate.email === email);

      if (!user) {
        user = {
          id: `user-${this.nextId++}`,
          email,
          display_name: displayName,
          created_at: new Date(),
          updated_at: new Date()
        };
        this.users.push(user);
      } else if (displayName) {
        user.display_name = displayName;
        user.updated_at = new Date();
      }

      return { rows: [user as T] };
    }

    if (normalizedSql.startsWith("insert into auth_identities")) {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into sessions")) {
      const record: SessionRecord = {
        id: `session-${this.nextId++}`,
        user_id: values[0] as string,
        token_hash: values[1] as string,
        created_at: new Date(),
        expires_at: values[2] as Date,
        revoked_at: null,
        last_seen_at: new Date()
      };
      this.sessions.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("update sessions set last_seen_at")) {
      const tokenHash = values[0] as string;
      const now = values[1] as Date;
      const session = this.sessions.find(
        (candidate) =>
          candidate.token_hash === tokenHash &&
          candidate.revoked_at === null &&
          candidate.expires_at > now
      );

      if (!session) {
        return { rows: [] as T[] };
      }

      const user = this.users.find(
        (candidate) => candidate.id === session.user_id
      );

      if (!user) {
        return { rows: [] as T[] };
      }

      session.last_seen_at = now;

      return {
        rows: [
          {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            created_at: user.created_at,
            updated_at: user.updated_at,
            session_id: session.id,
            user_id: session.user_id,
            token_hash: session.token_hash,
            session_created_at: session.created_at,
            expires_at: session.expires_at,
            revoked_at: session.revoked_at,
            last_seen_at: session.last_seen_at
          } as T
        ]
      };
    }

    if (normalizedSql.startsWith("update sessions set revoked_at")) {
      const tokenHash = values[0] as string;
      const revokedAt = values[1] as Date;
      for (const session of this.sessions) {
        if (session.token_hash === tokenHash && session.revoked_at === null) {
          session.revoked_at = revokedAt;
        }
      }
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("select campaigns.*, display_player.character_name")) {
      if (normalizedSql.includes("where campaigns.id = $1")) {
        const campaignId = values[0] as string;
        const userId = values[1] as string;
        const campaign = this.campaigns.find(
          (candidate) =>
            candidate.id === campaignId && candidate.status !== "deleted"
        );

        if (!campaign) {
          return { rows: [] as T[] };
        }

        const player = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaign.id &&
            candidate.status === "active"
        );
        const joinCode = this.joinCodes.find(
          (candidate) =>
            candidate.campaign_id === campaign.id &&
            candidate.enabled &&
            campaign.owner_user_id === values[2]
        );

        return {
          rows: [
            {
              ...campaign,
              display_character_name:
                player?.user_id === userId ? player.character_name : null,
              display_username: player?.user_id === userId ? player.username : null,
              join_code: joinCode?.code ?? null
            } as T
          ]
        };
      }

      const userId = values[0] as string;
      const ownerUserId = values[1] as string;
      const accessible = this.campaigns
        .filter(
          (campaign) =>
            campaign.status === "active" &&
            (campaign.owner_user_id === ownerUserId ||
              this.players.some(
                (player) =>
                  player.campaign_id === campaign.id &&
                  player.user_id === userId &&
                  player.status === "active"
              ))
        )
        .map((campaign) => {
          const player = this.players.find(
            (candidate) =>
              candidate.campaign_id === campaign.id &&
              candidate.status === "active"
          );
          const joinCode = this.joinCodes.find(
            (candidate) =>
              candidate.campaign_id === campaign.id &&
              candidate.enabled &&
              campaign.owner_user_id === values[3]
          );

          return {
            ...campaign,
            display_character_name: player?.character_name ?? null,
            display_username: player?.username ?? null,
            join_code: joinCode?.code ?? null
          };
        });

      return { rows: accessible as T[] };
    }

    if (normalizedSql.startsWith("insert into campaigns")) {
      const now = new Date();
      const record: CampaignRecord = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        hermes_session_id: values[0] as string,
        title: values[1] as string,
        mode: values[2] as "single_player" | "multiplayer",
        status: "active",
        has_begun: false,
        owner_client_id: values[3] as string | null,
        owner_user_id: values[4] as string | null,
        metadata: JSON.parse(values[5] as string) as unknown,
        created_at: now,
        updated_at: now
      };
      this.campaigns.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("insert into players")) {
      const now = new Date();
      const existing = this.players.find(
        (player) =>
          player.campaign_id === values[0] && player.client_id === values[1]
      );

      if (existing) {
        existing.user_id = values[2] as string;
        existing.username = values[3] as string;
        existing.character_name = values[4] as string;
        existing.character_sheet = values[5] as string;
        existing.slot = values[6] as number;
        existing.status = "active";
        existing.kicked_at = null;
        existing.last_seen_at = now;
        return { rows: [existing as T] };
      }

      const record: PlayerRecord = {
        id: `player-${this.nextId++}`,
        campaign_id: values[0] as string,
        client_id: values[1] as string,
        user_id: values[2] as string | null,
        username: values[3] as string,
        character_name: values[4] as string,
        character_sheet: values[5] as string,
        slot: values[6] as number,
        status: "active",
        last_seen_at: now,
        kicked_at: null,
        created_at: now,
        updated_at: now
      };
      this.players.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("select * from turns")) {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into turns")) {
      const record = {
        id: `turn-${this.nextId++}`,
        campaign_id: values[0],
        status: "collecting",
        updated_at: new Date()
      };
      this.turns.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("insert into campaign_events")) {
      this.campaignEvents.push({
        id: `event-${this.nextId++}`,
        campaign_id: values[0],
        type: values[1],
        payload: values[2]
      });
      return { rows: [{ id: `event-${this.nextId++}` } as T] };
    }

    if (normalizedSql.startsWith("select code from campaign_join_codes")) {
      const campaignId = values[0] as string;
      const existing = this.joinCodes.find(
        (code) => code.campaign_id === campaignId && code.enabled
      );

      return {
        rows: existing ? ([{ code: existing.code }] as T[]) : ([] as T[])
      };
    }

    if (normalizedSql.startsWith("insert into campaign_join_codes")) {
      const record: JoinCodeRecord = {
        id: `join-code-${this.nextId++}`,
        campaign_id: values[0] as string,
        code: values[1] as string,
        created_by_user_id: values[2] as string,
        enabled: true,
        created_at: new Date(),
        disabled_at: null
      };
      this.joinCodes.push(record);
      return { rows: [{ code: record.code } as T] };
    }

    if (normalizedSql.startsWith("select campaigns.id as campaign_id")) {
      const code = values[0] as string;
      const joinCode = this.joinCodes.find(
        (candidate) => candidate.code === code && candidate.enabled
      );
      const campaign = joinCode
        ? this.campaigns.find(
            (candidate) => candidate.id === joinCode.campaign_id
          )
        : undefined;

      if (!joinCode || !campaign) {
        return { rows: [] as T[] };
      }

      const activePlayers = this.players.filter(
        (player) =>
          player.campaign_id === campaign.id && player.status === "active"
      ).length;

      return {
        rows: [
          {
            campaign_id: campaign.id,
            code: joinCode.code,
            title: campaign.title,
            status: campaign.status,
            mode: campaign.mode,
            has_begun: campaign.has_begun,
            active_players: activePlayers
          } as T
        ]
      };
    }

    if (normalizedSql.startsWith("select campaigns.*, campaign_join_codes.code")) {
      const code = values[0] as string;
      const joinCode = this.joinCodes.find(
        (candidate) => candidate.code === code && candidate.enabled
      );
      const campaign = joinCode
        ? this.campaigns.find(
            (candidate) =>
              candidate.id === joinCode.campaign_id &&
              candidate.status === "active" &&
              candidate.mode === "multiplayer"
          )
        : undefined;

      return {
        rows:
          joinCode && campaign
            ? ([{ ...campaign, join_code: joinCode.code }] as T[])
            : ([] as T[])
      };
    }

    if (normalizedSql.startsWith("select * from players where campaign_id")) {
      const campaignId = values[0] as string;

      if (normalizedSql.includes("and user_id = $2")) {
        const userId = values[1] as string;
        const player = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaignId && candidate.user_id === userId
        );
        return { rows: player ? ([player] as T[]) : ([] as T[]) };
      }

      const clientId = values[1] as string;
      const player = this.players.find(
        (candidate) =>
          candidate.campaign_id === campaignId && candidate.client_id === clientId
      );
      return { rows: player ? ([player] as T[]) : ([] as T[]) };
    }

    if (normalizedSql.startsWith("select slot from players")) {
      const campaignId = values[0] as string;
      return {
        rows: this.players
          .filter(
            (player) =>
              player.campaign_id === campaignId &&
              player.status !== "kicked" &&
              player.slot !== null
          )
          .map((player) => ({ slot: player.slot }) as T)
      };
    }

    if (normalizedSql.startsWith("update players set client_id")) {
      const playerId = values[0] as string;
      const player = this.players.find((candidate) => candidate.id === playerId);

      if (player) {
        player.client_id = values[1] as string;
        player.username = values[2] as string;
        player.character_name = values[3] as string;
        player.character_sheet = values[4] as string;
        player.slot = values[5] as number;
        player.last_seen_at = new Date();
      }

      return { rows: [] as T[] };
    }

    throw new Error(`Unhandled fake query: ${normalizedSql}`);
  };

  connect: ConnectFn = async () => ({
    query: this.query,
    release: () => undefined
  });
}

function installFakeDatabase(instance: FastifyInstance): FakeDatabase {
  const database = new FakeDatabase();
  const pg = instance.pg as unknown as {
    query: QueryFn;
    connect: ConnectFn;
  };

  pg.query = database.query;
  pg.connect = database.connect;

  return database;
}

function readCookie(setCookieHeader: string | string[] | undefined): string {
  assert.ok(setCookieHeader);
  const firstHeader = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  assert.ok(firstHeader);

  const cookie = firstHeader.split(";")[0];
  assert.ok(cookie);

  return cookie;
}

async function signIn(email: string): Promise<string> {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(verifyResponse.statusCode, 200);
  return readCookie(verifyResponse.headers["set-cookie"]);
}

before(async () => {
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ai_taverns",
      AUTH_COOKIE_NAME: "test_session"
    }),
    connectToDatabase: false
  });

  database = installFakeDatabase(app);
});

after(async () => {
  await app.close();
});

test("GET /health returns the API health contract", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "api",
    timestamp: response.json().timestamp
  });
});

test("GET /api/auth/me returns unauthenticated without a session cookie", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(AuthMeResponseSchema.parse(response.json()), {
    authenticated: false,
    user: null,
    session: null
  });
});

test("passwordless login creates a local session cookie and authenticates /auth/me", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: " PLAYER@Example.COM "
    }
  });

  assert.equal(startResponse.statusCode, 200);
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  assert.ok(startBody.loginToken);

  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(verifyResponse.statusCode, 200);
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);
  const verifyBody = AuthMeResponseSchema.parse(verifyResponse.json());

  assert.equal(verifyBody.authenticated, true);
  assert.equal(verifyBody.user.email, "player@example.com");

  const meResponse = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: {
      cookie
    }
  });

  assert.equal(meResponse.statusCode, 200);
  const meBody = AuthMeResponseSchema.parse(meResponse.json());
  assert.equal(meBody.authenticated, true);
  assert.equal(meBody.user.email, "player@example.com");
});

test("passwordless start rejects invalid email with the standard error envelope", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "not-an-email"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "BAD_REQUEST"
  );
});

test("passwordless login tokens cannot be reused", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "reuse@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );

  const firstVerifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(firstVerifyResponse.statusCode, 200);

  const secondVerifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(secondVerifyResponse.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(secondVerifyResponse.json()).error.code,
    "UNAUTHORIZED"
  );
});

test("protected auth endpoint requires and accepts an owned session", async () => {
  const unauthenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected"
  });

  assert.equal(unauthenticatedResponse.statusCode, 401);

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "protected@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);

  const authenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected",
    headers: {
      cookie
    }
  });

  assert.equal(authenticatedResponse.statusCode, 200);
  const body = AuthProtectedResponseSchema.parse(
    authenticatedResponse.json()
  );
  assert.equal(body.user.email, "protected@example.com");
});

test("sign out revokes the owned session", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "sign-out@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);

  const signOutResponse = await app.inject({
    method: "POST",
    url: "/api/auth/sign-out",
    headers: {
      cookie
    }
  });

  assert.equal(signOutResponse.statusCode, 200);

  const protectedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected",
    headers: {
      cookie
    }
  });

  assert.equal(protectedResponse.statusCode, 401);
});

test("campaign endpoints require an owned session", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/campaigns"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "UNAUTHORIZED"
  );
});

test("campaign creation stores a multiplayer campaign and list returns it", async () => {
  const cookie = await signIn("campaign-owner@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "owner-client",
      playerName: "Table Owner"
    }
  });

  assert.equal(createResponse.statusCode, 201);
  const createBody = CampaignCreateResponseSchema.parse(createResponse.json());
  assert.equal(createBody.campaign.mode, "multiplayer");
  assert.equal(createBody.campaign.title, "Table Owner");
  assert.ok(createBody.campaign.joinCode);

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/campaigns",
    headers: {
      cookie
    }
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = CampaignListResponseSchema.parse(listResponse.json());
  assert.equal(listBody.campaigns.length, 1);
  assert.equal(listBody.campaigns[0]?.id, createBody.campaign.id);
});

test("campaign read returns owned campaign summaries from Fastify", async () => {
  const cookie = await signIn("campaign-reader@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: "reader-client",
      playerName: "Reader",
      characterName: "Astra"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}`,
    headers: {
      cookie
    }
  });

  assert.equal(readResponse.statusCode, 200);
  const read = CampaignReadResponseSchema.parse(readResponse.json());
  assert.equal(read.campaign.id, created.campaign.id);
  assert.equal(read.campaign.title, "Astra");
});

test("campaign read forbids signed-in users without campaign access", async () => {
  const ownerCookie = await signIn("private-owner@example.com");
  const otherCookie = await signIn("private-other@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "dark_fantasy",
      ownerClientId: "private-owner-client",
      playerName: "Owner",
      characterName: "Nyx"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}`,
    headers: {
      cookie: otherCookie
    }
  });

  assert.equal(readResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(readResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("campaign join preview and join use the Fastify campaign API", async () => {
  const ownerCookie = await signIn("join-owner@example.com");
  const joinerCookie = await signIn("joiner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "mystery",
      ownerClientId: "join-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  assert.ok(created.campaign.joinCode);

  const previewResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join/preview",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: created.campaign.joinCode
    }
  });

  assert.equal(previewResponse.statusCode, 200);
  const preview = CampaignJoinPreviewResponseSchema.parse(
    previewResponse.json()
  );
  assert.equal(preview.availableSlots, 3);

  const joinResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: created.campaign.joinCode,
      clientId: "joiner-client",
      username: "Joined Player",
      characterName: "Lyra",
      characterSheet: "A careful investigator."
    }
  });

  assert.equal(joinResponse.statusCode, 200);
  const joined = CampaignJoinResponseSchema.parse(joinResponse.json());
  assert.equal(joined.campaign.id, created.campaign.id);
  assert.equal(joined.campaign.title, "Lyra");
  assert.equal(
    database.players.filter(
      (player) => player.campaign_id === joined.campaign.id
    ).length,
    2
  );
});

test("missing routes use the standard error envelope", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/missing"
  });

  assert.equal(response.statusCode, 404);
  assert.doesNotThrow(() => ApiErrorResponseSchema.parse(response.json()));
});
