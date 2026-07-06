import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import type { SessionId, UserId } from "@ai-dnd/domain";
import {
  debugHermesDmContractFailure,
  dungeonMasterInstructions,
  openingSceneRequest,
  parseHermesDmContract,
  type AiDebugInfo,
  type GameMessage,
  type InputPolicy
} from "@ai-dnd/dm";
import type {
  CampaignMode,
  CampaignSummary,
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission,
  RoomSnapshot
} from "@ai-dnd/contracts";

const { Pool } = pg;

export type DatabaseConfig = {
  databaseUrl: string;
  sslDisabled: boolean;
  maxConnections?: number;
};

export function createPostgresPool(config: DatabaseConfig): pg.Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.maxConnections,
    ssl: config.sslDisabled
      ? false
      : {
          rejectUnauthorized: false
        }
  });
}

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type UserRecord = {
  id: UserId;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
};

export type SessionRecord = {
  id: SessionId;
  userId: UserId;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AuthenticatedSession = {
  user: UserRecord;
  session: SessionRecord;
};

type AuthenticatedSessionRow = UserRow & {
  session_id: string;
  user_id: string;
  token_hash: string;
  session_created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
};

export type LoginTokenRow = {
  id: string;
  email: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
};

export type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;
export type TransactionClient = pg.PoolClient;

type CampaignStatus = "active" | "archived" | "deleted";
type PlayerStatus = "active" | "left" | "kicked";
type TurnStatus =
  | "collecting"
  | "resolving"
  | "resolved"
  | "failed"
  | "cancelled";

const maxPlayers = 4;
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function requireRow<TRow>(row: TRow | undefined, message: string): TRow {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return nowIso();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id as UserId,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id as SessionId,
    userId: row.user_id as UserId,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}

export async function createLoginToken(
  db: Queryable,
  input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }
): Promise<LoginTokenRow> {
  const result = await db.query<LoginTokenRow>(
    `
      insert into login_tokens (email, token_hash, expires_at)
      values ($1, $2, $3)
      returning id, email, token_hash, created_at, expires_at, consumed_at
    `,
    [input.email, input.tokenHash, input.expiresAt]
  );

  return requireRow(result.rows[0], "Failed to create login token.");
}

export async function consumeLoginToken(
  db: Queryable,
  input: {
    tokenHash: string;
    consumedAt: Date;
  }
): Promise<LoginTokenRow | null> {
  const result = await db.query<LoginTokenRow>(
    `
      update login_tokens
      set consumed_at = $2
      where token_hash = $1
        and consumed_at is null
        and expires_at > $2
      returning id, email, token_hash, created_at, expires_at, consumed_at
    `,
    [input.tokenHash, input.consumedAt]
  );

  return result.rows[0] ?? null;
}

export async function upsertUserByEmail(
  db: Queryable,
  input: {
    email: string;
    displayName: string | null;
  }
): Promise<UserRecord> {
  const result = await db.query<UserRow>(
    `
      insert into users (email, display_name)
      values ($1, $2)
      on conflict (email) do update
      set display_name = coalesce(excluded.display_name, users.display_name)
      returning id, email, display_name, created_at, updated_at
    `,
    [input.email, input.displayName]
  );

  return mapUserRow(requireRow(result.rows[0], "Failed to upsert user."));
}

export async function ensureEmailIdentity(
  db: Queryable,
  input: {
    userId: UserId;
    email: string;
  }
): Promise<void> {
  await db.query(
    `
      insert into auth_identities (user_id, provider, provider_subject, email)
      values ($1, 'email', $2, $2)
      on conflict (provider, provider_subject) do nothing
    `,
    [input.userId, input.email]
  );
}

export async function createSession(
  db: Queryable,
  input: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
  }
): Promise<SessionRecord> {
  const result = await db.query<SessionRow>(
    `
      insert into sessions (user_id, token_hash, expires_at, last_seen_at)
      values ($1, $2, $3, now())
      returning id, user_id, token_hash, created_at, expires_at, revoked_at, last_seen_at
    `,
    [input.userId, input.tokenHash, input.expiresAt]
  );

  return mapSessionRow(requireRow(result.rows[0], "Failed to create session."));
}

export async function findActiveSessionByTokenHash(
  db: Queryable,
  tokenHash: string,
  now: Date
): Promise<AuthenticatedSession | null> {
  const result = await db.query<AuthenticatedSessionRow>(
    `
      update sessions
      set last_seen_at = $2
      from users
      where sessions.token_hash = $1
        and sessions.user_id = users.id
        and sessions.revoked_at is null
        and sessions.expires_at > $2
      returning
        users.id,
        users.email,
        users.display_name,
        users.created_at,
        users.updated_at,
        sessions.id as session_id,
        sessions.user_id,
        sessions.token_hash,
        sessions.created_at as session_created_at,
        sessions.expires_at,
        sessions.revoked_at,
        sessions.last_seen_at
    `,
    [tokenHash, now]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    user: mapUserRow(row),
    session: {
      id: row.session_id as SessionId,
      userId: row.user_id as UserId,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at
    }
  };
}

export async function revokeSessionByTokenHash(
  db: Queryable,
  tokenHash: string,
  revokedAt: Date
): Promise<void> {
  await db.query(
    `
      update sessions
      set revoked_at = $2
      where token_hash = $1
        and revoked_at is null
    `,
    [tokenHash, revokedAt]
  );
}

export async function claimGuestStateForUser(
  db: pg.Pool,
  input: {
    clientId: string;
    userId: string;
  }
) {
  return withTransaction(db, async (client) => {
    const claimedCampaigns = await client.query<CampaignRow>(
      `
        update campaigns
        set owner_user_id = $2
        where owner_client_id = $1
          and owner_user_id is null
          and status <> 'deleted'
        returning *
      `,
      [input.clientId, input.userId]
    );
    const claimedPlayers = await client.query<{ id: string }>(
      `
        update players
        set user_id = $2
        where client_id = $1
          and user_id is null
          and status = 'active'
        returning id
      `,
      [input.clientId, input.userId]
    );

    for (const campaign of claimedCampaigns.rows) {
      await logCampaignEvent(client, campaign.id, "guest_state_claimed", {
        clientId: input.clientId,
        userId: input.userId
      });
    }

    return {
      claimedCampaigns: claimedCampaigns.rowCount ?? 0,
      claimedPlayers: claimedPlayers.rowCount ?? 0
    };
  });
}

export type CampaignRow = {
  id: string;
  hermes_session_id: string;
  mode: CampaignMode;
  title: string;
  status: CampaignStatus;
  has_begun: boolean;
  owner_user_id: string | null;
  owner_client_id: string | null;
  metadata: unknown;
  updated_at: Date | string;
  created_at: Date | string;
  display_character_name?: string | null;
  display_username?: string | null;
  join_code?: string | null;
};

type PlayerRow = {
  id: string;
  campaign_id: string;
  client_id: string;
  user_id: string | null;
  username: string;
  character_name: string;
  character_sheet: string;
  slot: number | null;
  status: PlayerStatus;
  last_seen_at: Date | string;
};

type TurnRow = {
  id: string;
  campaign_id: string;
  status: TurnStatus;
  updated_at?: Date | string;
};

type SubmissionRow = {
  player_id: string | null;
  client_id: string | null;
  username: string | null;
  character_name: string | null;
  content: string;
  created_at: Date | string;
};

type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date | string;
};

type JoinCodeRow = {
  campaign_id: string;
  code: string;
  title: string;
  status: CampaignStatus;
  mode: CampaignMode;
  has_begun: boolean;
};

type CampaignSettingSummary = {
  displayLocation?: string;
  worldName?: string;
  startingLocation?: string;
};

type CampaignOpeningStyle = {
  campaignGenre?: string | undefined;
  campaignGenrePromptBrief?: string | undefined;
  customWorldName?: string | undefined;
  customWorldDescription?: string | undefined;
};

type DungeonMasterProviderResponse = {
  id?: string;
  content: string;
  debug: AiDebugInfo;
};

export type DungeonMasterRuntime = {
  askProvider(input: {
    message: string;
    instructions: string;
    history?: GameMessage[];
  }): Promise<DungeonMasterProviderResponse>;
  buildPromptContext?(input: {
    campaignId: string;
    turnId?: string | undefined;
    currentAction: string;
    baseInstructions: string;
  }): Promise<{
    instructions: string;
    message: string;
    sections: unknown[];
    budget: Record<string, unknown>;
  }>;
  runPostTurnContextJobs?(input: {
    campaignId: string;
    turnId: string;
    currentAction: string;
    dmResponse: string;
    dmEventId?: string | undefined;
    rollRequests?: DiceRollRequest[] | undefined;
  }): Promise<void>;
};

function normalizeJoinCode(code: string | undefined) {
  const rawCode = code ?? "";
  const compactCode = rawCode.replace(/[^a-z0-9]/gi, "").toUpperCase();

  if (compactCode.length <= 6) {
    return compactCode;
  }

  return (
    rawCode.toUpperCase().match(/[A-HJ-NP-Z2-9]{6}/)?.[0] ?? compactCode
  );
}

function generateJoinCode() {
  return Array.from(
    { length: 6 },
    () => joinCodeAlphabet[randomInt(0, joinCodeAlphabet.length)]
  ).join("");
}

function eventPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function campaignWorldName(campaign: CampaignRow) {
  const metadata = eventPayload(campaign.metadata);
  const setting = eventPayload(metadata.setting);
  const genre = eventPayload(metadata.genre);
  const displayLocation =
    typeof setting.displayLocation === "string"
      ? setting.displayLocation.trim()
      : "";
  const startingLocation =
    typeof setting.startingLocation === "string"
      ? setting.startingLocation.trim()
      : "";
  const worldName =
    typeof setting.worldName === "string" ? setting.worldName.trim() : "";
  const customWorldName =
    typeof genre.customWorldName === "string" ? genre.customWorldName.trim() : "";

  return (
    displayLocation ||
    startingLocation ||
    worldName ||
    customWorldName ||
    campaign.title
  );
}

function campaignOpeningStyleFromMetadata(campaign: CampaignRow): CampaignOpeningStyle {
  const metadata = eventPayload(campaign.metadata);
  const genre = eventPayload(metadata.genre);

  return {
    campaignGenre: eventPayloadString(genre.label),
    campaignGenrePromptBrief: eventPayloadString(genre.promptBrief),
    customWorldName: eventPayloadString(genre.customWorldName),
    customWorldDescription: eventPayloadString(genre.customWorldDescription)
  };
}

function normalizeCampaignTitle(title: string | undefined, sessionId: string) {
  return title?.trim() || sessionId.replace(/^ai-dnd-/, "") || "New Adventure";
}

export function mapCampaignSummaryRow(
  campaign: CampaignRow
): CampaignSummary {
  const characterName = campaign.display_character_name?.trim();
  const playerName = campaign.display_username?.trim();
  const joinCode = campaign.join_code?.trim();

  return {
    id: campaign.id,
    hermesSessionId: campaign.hermes_session_id,
    mode: campaign.mode,
    title: characterName || playerName || campaign.title,
    preview: campaignWorldName(campaign),
    messageCount: 0,
    ...(joinCode ? { joinCode } : {})
  };
}

export async function withTransaction<T>(
  db: pg.Pool,
  callback: (client: TransactionClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function logCampaignEvent(
  db: Queryable,
  campaignId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<string | undefined> {
  const result = await db.query<{ id: string }>(
    "insert into campaign_events (campaign_id, type, payload) values ($1, $2, $3::jsonb) returning id",
    [campaignId, type, JSON.stringify(payload)]
  );

  return result.rows[0]?.id;
}

async function ensureCollectingTurn(
  db: Queryable,
  campaignId: string
): Promise<TurnRow> {
  const existing = await db.query<TurnRow>(
    `
      select *
      from turns
      where campaign_id = $1 and status = 'collecting'
      order by created_at desc
      limit 1
    `,
    [campaignId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await db.query<TurnRow>(
    `
      insert into turns (campaign_id, status)
      values ($1, 'collecting')
      returning *
    `,
    [campaignId]
  );

  await logCampaignEvent(db, campaignId, "turn_created", {
    turnId: created.rows[0]?.id
  });

  return requireRow(created.rows[0], "Failed to create campaign turn.");
}

async function ensureCampaignJoinCode(
  db: Queryable,
  campaignId: string,
  userId: string
) {
  const existing = await db.query<{ code: string }>(
    `
      select code
      from campaign_join_codes
      where campaign_id = $1 and enabled = true
      order by created_at desc
      limit 1
    `,
    [campaignId]
  );

  if (existing.rows[0]?.code) {
    return existing.rows[0].code;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateJoinCode();
    const inserted = await db.query<{ code: string }>(
      `
        insert into campaign_join_codes (campaign_id, code, created_by_user_id)
        values ($1, $2, $3)
        on conflict (code) do nothing
        returning code
      `,
      [campaignId, code, userId]
    );

    if (inserted.rows[0]?.code) {
      await logCampaignEvent(db, campaignId, "join_code_created", { code });
      return inserted.rows[0].code;
    }
  }

  throw new Error("A game code could not be generated.");
}

export async function listCampaignSummariesForUser(
  db: Queryable,
  userId: string
): Promise<CampaignSummary[]> {
  const result = await db.query<CampaignRow>(
    `
      select
        campaigns.*,
        display_player.character_name as display_character_name,
        display_player.username as display_username,
        join_code.code as join_code
      from campaigns
      left join lateral (
        select players.character_name, players.username
        from players
        where players.campaign_id = campaigns.id
          and players.status = 'active'
        order by
          (players.user_id = $1) desc,
          players.slot asc nulls last,
          players.created_at asc
        limit 1
      ) display_player on true
      left join lateral (
        select campaign_join_codes.code
        from campaign_join_codes
        where campaign_join_codes.campaign_id = campaigns.id
          and campaign_join_codes.enabled = true
          and campaigns.owner_user_id = $4
        order by campaign_join_codes.created_at desc
        limit 1
      ) join_code on true
      where campaigns.status = 'active'
        and (
          campaigns.owner_user_id = $2
          or exists (
            select 1
            from players access_player
            where access_player.campaign_id = campaigns.id
              and access_player.user_id = $3
              and access_player.status = 'active'
          )
        )
      order by campaigns.updated_at desc, campaigns.created_at desc
      limit 100
    `,
    [userId, userId, userId, userId]
  );

  return result.rows.map(mapCampaignSummaryRow);
}

export async function getCampaignSummaryForUser(
  db: Queryable,
  input: {
    campaignId: string;
    userId: string;
  }
): Promise<CampaignSummary> {
  const result = await db.query<CampaignRow>(
    `
      select
        campaigns.*,
        display_player.character_name as display_character_name,
        display_player.username as display_username,
        join_code.code as join_code
      from campaigns
      left join lateral (
        select players.character_name, players.username
        from players
        where players.campaign_id = campaigns.id
          and players.status = 'active'
        order by
          (players.user_id = $2) desc,
          players.slot asc nulls last,
          players.created_at asc
        limit 1
      ) display_player on true
      left join lateral (
        select campaign_join_codes.code
        from campaign_join_codes
        where campaign_join_codes.campaign_id = campaigns.id
          and campaign_join_codes.enabled = true
          and campaigns.owner_user_id = $3
        order by campaign_join_codes.created_at desc
        limit 1
      ) join_code on true
      where campaigns.id = $1
        and campaigns.status <> 'deleted'
      limit 1
    `,
    [input.campaignId, input.userId, input.userId]
  );
  const campaign = result.rows[0];

  if (!campaign) {
    throw createStatusError(404, "Campaign not found.");
  }

  if (campaign.owner_user_id !== input.userId) {
    const player = await db.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1
          and user_id = $2
          and status = 'active'
        order by created_at asc
        limit 1
      `,
      [campaign.id, input.userId]
    );

    if (!player.rows[0]) {
      throw createStatusError(403, "You do not have access to that campaign.");
    }
  }

  return mapCampaignSummaryRow(campaign);
}

export async function createCampaignForMode(
  db: pg.Pool,
  input: {
    mode: CampaignMode;
    title: string;
    campaignGenre?: string | undefined;
    campaignGenreKind?: "preset" | "custom" | undefined;
    campaignGenrePresetId?: string | undefined;
    campaignGenrePromptBrief?: string | undefined;
    customWorldName?: string | undefined;
    customWorldDescription?: string | undefined;
    ownerClientId?: string | undefined;
    playerName: string;
    characterName?: string | undefined;
    characterSheet?: string | undefined;
    userId: string;
    runtime?: DungeonMasterRuntime | undefined;
  }
): Promise<CampaignSummary> {
  const sessionId = `ai-dnd-${randomUUID()}`;
  const genreMetadata = {
    genre: {
      kind: input.campaignGenreKind ?? "preset",
      presetId: input.campaignGenrePresetId ?? null,
      label: input.campaignGenre ?? null,
      promptBrief: input.campaignGenrePromptBrief ?? null,
      customWorldName: input.customWorldName ?? null,
      customWorldDescription: input.customWorldDescription ?? null
    }
  };

  const createdState = await withTransaction(db, async (client) => {
    const inserted = await client.query<CampaignRow>(
      `
        insert into campaigns (
          hermes_session_id,
          title,
          mode,
          has_begun,
          owner_client_id,
          owner_user_id,
          metadata
        )
        values ($1, $2, $3, false, $4, $5, $6::jsonb)
        returning *
      `,
      [
        sessionId,
        normalizeCampaignTitle(input.title, sessionId),
        input.mode,
        input.ownerClientId ?? null,
        input.userId,
        JSON.stringify(genreMetadata)
      ]
    );
    const campaign = requireRow(inserted.rows[0], "Failed to create campaign.");
    const player = await client.query<PlayerRow>(
      `
        insert into players (
          campaign_id,
          client_id,
          user_id,
          username,
          character_name,
          character_sheet,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, 0, 'active', now())
        returning *
      `,
      [
        campaign.id,
        input.ownerClientId ?? input.userId,
        input.userId,
        input.playerName,
        input.characterName ?? (input.mode === "single_player" ? input.playerName : ""),
        input.characterSheet ??
          (input.mode === "single_player"
            ? "Quick fantasy adventurer template."
            : "")
      ]
    );
    const playerRow = requireRow(player.rows[0], "Failed to create player.");
    const turn = await ensureCollectingTurn(client, campaign.id);

    await logCampaignEvent(client, campaign.id, "campaign_created", {
      hermesSessionId: sessionId,
      mode: input.mode,
      genre: input.campaignGenre,
      genreKind: input.campaignGenreKind ?? "preset"
    });
    await logCampaignEvent(client, campaign.id, "player_joined", {
      clientId: playerRow.client_id,
      username: playerRow.username,
      characterName: playerRow.character_name,
      slot: 0,
      genre: input.campaignGenre,
      genreKind: input.campaignGenreKind ?? "preset"
    });

    const joinCode =
      input.mode === "multiplayer"
        ? await ensureCampaignJoinCode(client, campaign.id, input.userId)
        : undefined;
    const openingTurn =
      input.mode === "single_player" && input.runtime
        ? (
            await client.query<TurnRow>(
              `
                update turns
                set status = 'resolving'
                where id = $1 and status = 'collecting'
                returning *
              `,
              [turn.id]
            )
          ).rows[0]
        : undefined;

    if (openingTurn) {
      await logCampaignEvent(client, campaign.id, "turn_resolving", {
        turnId: openingTurn.id,
        reason: "adventure_begun"
      });
    }

    return {
      campaign,
      player: playerRow,
      turn: openingTurn,
      summary: mapCampaignSummaryRow({
      ...campaign,
      metadata: genreMetadata,
      display_character_name: playerRow.character_name,
      display_username: playerRow.username,
      join_code: joinCode ?? null
      })
    };
  });

  if (input.mode !== "single_player" || !input.runtime || !createdState.turn) {
    return createdState.summary;
  }

  const currentAction = formatOpeningSceneRequest({
    mode: "single_player",
    players: [createdState.player],
    style: {
      campaignGenre: input.campaignGenre,
      campaignGenrePromptBrief: input.campaignGenrePromptBrief,
      customWorldName: input.customWorldName,
      customWorldDescription: input.customWorldDescription
    }
  });

  try {
    const opening = await askDungeonMaster(
      db,
      input.runtime,
      createdState.campaign,
      currentAction,
      openingSceneInstructions("single_player"),
      true,
      createdState.turn.id
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: createdState.campaign.id,
      turnId: createdState.turn.id,
      hermesMessageId: opening.id,
      reply: opening.content,
      eventType: "adventure_begun",
      pendingRollRequests: opening.rollRequests,
      inputTargets: opening.inputTargets,
      inputPolicy: opening.inputPolicy,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    await db.query("update campaigns set has_begun = true where id = $1", [
      createdState.campaign.id
    ]);

    void input.runtime.runPostTurnContextJobs?.({
      campaignId: createdState.campaign.id,
      turnId: createdState.turn.id,
      currentAction,
      dmResponse: opening.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: opening.rollRequests
    });

    return getCampaignSummaryForUser(db, {
      campaignId: createdState.campaign.id,
      userId: input.userId
    });
  } catch (error) {
    await markTurnFailed(db, createdState.turn.id, error);
    throw error;
  }
}

export async function createCampaignForHermesSession(
  db: pg.Pool,
  input: {
    sessionId: string;
    title?: string | undefined;
    ownerClientId?: string | undefined;
    ownerUserId?: string | undefined;
    mode?: CampaignMode | undefined;
  }
): Promise<CampaignRow> {
  const mode = input.mode ?? "multiplayer";

  return withTransaction(db, async (client) => {
    const result = await client.query<CampaignRow>(
      `
        insert into campaigns (
          hermes_session_id,
          title,
          owner_client_id,
          owner_user_id,
          mode
        )
        values ($1, $2, $3, $4, $5)
        on conflict (hermes_session_id) do update
        set title = excluded.title,
            mode = excluded.mode,
            status = 'active',
            deleted_at = null,
            owner_client_id = coalesce(campaigns.owner_client_id, excluded.owner_client_id),
            owner_user_id = coalesce(campaigns.owner_user_id, excluded.owner_user_id)
        returning *
      `,
      [
        input.sessionId,
        normalizeCampaignTitle(input.title, input.sessionId),
        input.ownerClientId ?? null,
        input.ownerUserId ?? null,
        mode
      ]
    );
    const campaign = requireRow(result.rows[0], "Failed to create campaign.");

    await ensureCollectingTurn(client, campaign.id);
    await logCampaignEvent(client, campaign.id, "campaign_created", {
      hermesSessionId: input.sessionId
    });

    return campaign;
  });
}

export async function previewCampaignJoinByCode(
  db: Queryable,
  gameCode: string
) {
  const code = normalizeJoinCode(gameCode);

  if (!code) {
    throw createStatusError(400, "Enter a game code.");
  }

  const result = await db.query<
    JoinCodeRow & {
      active_players: string | number;
    }
  >(
    `
      select
        campaigns.id as campaign_id,
        campaign_join_codes.code,
        campaigns.title,
        campaigns.status,
        campaigns.mode,
        campaigns.has_begun,
        count(players.id) filter (where players.status = 'active') as active_players
      from campaign_join_codes
      join campaigns on campaigns.id = campaign_join_codes.campaign_id
      left join players on players.campaign_id = campaigns.id
      where campaign_join_codes.code = $1
        and campaign_join_codes.enabled = true
      group by campaigns.id, campaign_join_codes.code
      limit 1
    `,
    [code]
  );
  const campaign = result.rows[0];

  if (!campaign || campaign.status !== "active" || campaign.mode !== "multiplayer") {
    throw createStatusError(404, "That game code was not found.");
  }

  const activePlayers = Number(campaign.active_players);
  const availableSlots = Math.max(0, maxPlayers - activePlayers);

  if (availableSlots <= 0) {
    throw createStatusError(409, "That game is already full.");
  }

  return {
    code: campaign.code,
    campaignTitle: campaign.title,
    availableSlots,
    hasBegun: campaign.has_begun
  };
}

export async function joinCampaignByCode(
  db: pg.Pool,
  input: {
    gameCode: string;
    clientId: string;
    username: string;
    characterName: string;
    characterSheet: string;
    userId: string;
  }
): Promise<CampaignSummary> {
  const code = normalizeJoinCode(input.gameCode);
  const clientId = input.clientId.trim();
  const username = input.username.trim();
  const characterName = input.characterName.trim();
  const characterSheet = input.characterSheet.trim();

  if (!code) {
    throw createStatusError(400, "Enter a game code.");
  }

  if (!clientId || !username || !characterName || !characterSheet) {
    throw createStatusError(400, "Complete your player profile before joining.");
  }

  const campaign = await withTransaction(db, async (client) => {
    const codeResult = await client.query<CampaignRow & { join_code: string }>(
      `
        select campaigns.*, campaign_join_codes.code as join_code
        from campaign_join_codes
        join campaigns on campaigns.id = campaign_join_codes.campaign_id
        where campaign_join_codes.code = $1
          and campaign_join_codes.enabled = true
          and campaigns.status = 'active'
          and campaigns.mode = 'multiplayer'
        limit 1
        for update of campaigns
      `,
      [code]
    );
    const campaignRow = codeResult.rows[0];

    if (!campaignRow) {
      throw createStatusError(404, "That game code was not found.");
    }

    const existingForUser = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and user_id = $2
        order by
          (status = 'active') desc,
          created_at asc
        limit 1
      `,
      [campaignRow.id, input.userId]
    );
    const userPlayer = existingForUser.rows[0];

    if (userPlayer?.status === "kicked") {
      throw createStatusError(403, "You cannot join this game.");
    }

    const existingForClient = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and client_id = $2
        limit 1
      `,
      [campaignRow.id, clientId]
    );
    const clientPlayer = existingForClient.rows[0];

    if (clientPlayer?.status === "kicked") {
      throw createStatusError(403, "You cannot join this game from this device.");
    }

    if (
      clientPlayer &&
      clientPlayer.user_id &&
      clientPlayer.user_id !== input.userId
    ) {
      throw createStatusError(
        409,
        "This browser is already joined to that game."
      );
    }

    const slotResult = await client.query<{ slot: number }>(
      `
        select slot
        from players
        where campaign_id = $1 and status <> 'kicked' and slot is not null
        order by slot asc
      `,
      [campaignRow.id]
    );
    const usedSlots = new Set(slotResult.rows.map((row) => row.slot));
    const existingSlot = userPlayer?.slot ?? clientPlayer?.slot ?? undefined;
    const firstOpenSlot = Array.from({ length: maxPlayers }, (_, slot) =>
      slot
    ).find((slot) => !usedSlots.has(slot));
    const slot = existingSlot ?? firstOpenSlot;

    if (slot === undefined) {
      throw createStatusError(409, "That game is already full.");
    }

    if (userPlayer?.status === "active") {
      await client.query(
        `
          update players
          set client_id = $2,
              username = $3,
              character_name = $4,
              character_sheet = $5,
              slot = $6,
              last_seen_at = now()
          where id = $1
        `,
        [userPlayer.id, clientId, username, characterName, characterSheet, slot]
      );
      await logCampaignEvent(
        client,
        campaignRow.id,
        "player_profile_updated_by_code",
        {
          clientId,
          username,
          characterName,
          slot
        }
      );
      return campaignRow;
    }

    await client.query(
      `
        insert into players (
          campaign_id,
          client_id,
          user_id,
          username,
          character_name,
          character_sheet,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'active', now())
        on conflict (campaign_id, client_id) do update
        set user_id = excluded.user_id,
            username = excluded.username,
            character_name = excluded.character_name,
            character_sheet = excluded.character_sheet,
            slot = excluded.slot,
            status = 'active',
            kicked_at = null,
            last_seen_at = now()
      `,
      [
        campaignRow.id,
        clientId,
        input.userId,
        username,
        characterName,
        characterSheet,
        slot
      ]
    );
    await logCampaignEvent(client, campaignRow.id, "player_joined_by_code", {
      clientId,
      username,
      characterName,
      slot
    });

    return campaignRow;
  });

  return mapCampaignSummaryRow({
    ...campaign,
    display_character_name: characterName,
    display_username: username,
    join_code: null
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isProfileComplete(player: PlayerRow) {
  return Boolean(
    player.username.trim() &&
      player.character_name.trim() &&
      player.character_sheet.trim()
  );
}

function isPlayerRecentlySeen(player: Pick<PlayerRow, "last_seen_at">) {
  return Date.now() - new Date(player.last_seen_at).getTime() <= 120_000;
}

function roomEventMessageKind(type: string) {
  if (type === "dm_question") {
    return "ask_dm_question";
  }

  if (type === "dm_answer") {
    return "ask_dm_answer";
  }

  return "turn";
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item): item is string => Boolean(item))
    : [];
}

function normalizeRollRequest(value: unknown): DiceRollRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const dice = typeof candidate.dice === "string" ? candidate.dice.trim() : "";
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";

  if (!dice || !label) {
    return null;
  }

  const modifier = Number(candidate.modifier);
  const advantageState =
    candidate.advantageState === "advantage" ||
    candidate.advantageState === "disadvantage" ||
    candidate.advantageState === "normal"
      ? candidate.advantageState
      : candidate.advantage_state === "advantage" ||
          candidate.advantage_state === "disadvantage" ||
          candidate.advantage_state === "normal"
        ? candidate.advantage_state
        : undefined;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : randomUUID(),
    player:
      typeof candidate.player === "string" ? candidate.player.trim() : undefined,
    dice,
    modifier: Number.isFinite(modifier) ? modifier : undefined,
    label,
    reason:
      typeof candidate.reason === "string" ? candidate.reason.trim() : undefined,
    advantageState
  };
}

function normalizeRollRequests(value: unknown): DiceRollRequest[] {
  return Array.isArray(value)
    ? value
        .map((request) => normalizeRollRequest(request))
        .filter((request): request is DiceRollRequest => Boolean(request))
    : [];
}

function pendingRollRequestsFromCampaign(campaign: CampaignRow) {
  const metadata = eventPayload(campaign.metadata);
  const requests = normalizeRollRequests(metadata.pendingRollRequests);

  if (requests.length > 0) {
    return requests;
  }

  const legacyRequest = normalizeRollRequest(metadata.pendingRollRequest);
  return legacyRequest ? [legacyRequest] : [];
}

function inputTargetsFromCampaign(campaign: CampaignRow) {
  return metadataStringArray(eventPayload(campaign.metadata).inputTargets);
}

function inputPolicyFromCampaign(
  campaign: CampaignRow
): "all_players" | "only_targeted_players" {
  const metadata = eventPayload(campaign.metadata);
  const inputTargets = inputTargetsFromCampaign(campaign);

  return metadata.inputPolicy === "only_targeted_players" && inputTargets.length > 0
    ? "only_targeted_players"
    : "all_players";
}

function normalizeRollTarget(value: string | null | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rollRequestTargetsPlayer(request: DiceRollRequest, player: PlayerRow) {
  const target = normalizeRollTarget(request.player);

  if (!target) {
    return true;
  }

  const playerNames = [player.username, player.character_name]
    .map(normalizeRollTarget)
    .filter((name): name is string => Boolean(name));

  return playerNames.some(
    (name) => target === name || target.includes(name) || name.includes(target)
  );
}

function inputTargetMatchesPlayer(target: string, player: PlayerRow) {
  const normalizedTarget = normalizeRollTarget(target);

  if (!normalizedTarget) {
    return false;
  }

  const playerNames = [player.username, player.character_name]
    .map(normalizeRollTarget)
    .filter((name): name is string => Boolean(name));

  return playerNames.some(
    (name) =>
      normalizedTarget === name ||
      normalizedTarget.includes(name) ||
      name.includes(normalizedTarget)
  );
}

function playerMatchesInputTargets(player: PlayerRow, inputTargets: string[]) {
  return inputTargets.some((target) => inputTargetMatchesPlayer(target, player));
}

function normalizedAdvantageState(request: DiceRollRequest) {
  const state =
    request.advantageState?.trim().toLowerCase() ??
    request.advantage_state?.trim().toLowerCase();

  return state === "advantage" || state === "disadvantage" ? state : "normal";
}

function physicalRollCountForRequest(
  request: DiceRollRequest,
  count: number,
  sides: number
) {
  return count === 1 &&
    sides === 20 &&
    normalizedAdvantageState(request) !== "normal"
    ? 2
    : count;
}

function scoredRollsForRequest(request: DiceRollRequest, rolls: number[]) {
  const advantageState = normalizedAdvantageState(request);

  if (rolls.length === 2 && advantageState === "advantage") {
    return [Math.max(...rolls)];
  }

  if (rolls.length === 2 && advantageState === "disadvantage") {
    return [Math.min(...rolls)];
  }

  return rolls;
}

function validateRollSubmissionResult(
  request: DiceRollRequest,
  result: DiceRollResult | undefined
) {
  const match = request.dice.trim().match(/^(\d*)d(\d+)$/i);

  if (!match) {
    throw createStatusError(400, "The DM requested an unsupported dice roll.");
  }

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);
  const physicalCount = physicalRollCountForRequest(request, count, sides);

  if (!result) {
    const rolls = Array.from({ length: physicalCount }, () =>
      randomInt(1, sides + 1)
    );
    const total = scoredRollsForRequest(request, rolls).reduce(
      (sum, roll) => sum + roll,
      request.modifier ?? 0
    );

    return { rolls, total };
  }

  if (
    !Array.isArray(result.rolls) ||
    result.rolls.length !== physicalCount ||
    !result.rolls.every(
      (roll) => Number.isInteger(roll) && roll >= 1 && roll <= sides
    )
  ) {
    throw createStatusError(400, "The submitted roll result is invalid.");
  }

  const total = scoredRollsForRequest(request, result.rolls).reduce(
    (sum, roll) => sum + roll,
    request.modifier ?? 0
  );

  if (result.total !== total) {
    throw createStatusError(
      400,
      "The submitted roll total does not match the dice."
    );
  }

  return result;
}

function modifierText(modifier: number | undefined) {
  if (!modifier) {
    return "";
  }

  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

function formatRollSubmission(
  request: DiceRollRequest,
  submittedResult?: DiceRollResult
) {
  const result = validateRollSubmissionResult(request, submittedResult);
  const rollText =
    result.rolls.length === 1 ? String(result.rolls[0]) : result.rolls.join(", ");

  return `I rolled ${request.dice}${modifierText(request.modifier)}: ${
    result.total
  } (${rollText}) for ${request.label}.`;
}

function rollSubmissionsFromPayload(
  rollRequestId?: string,
  rollResult?: DiceRollResult,
  clientMessageId?: string,
  rollSubmissions?: DiceRollSubmission[]
) {
  const submittedRolls: DiceRollSubmission[] = rollSubmissions?.length
    ? rollSubmissions
    : rollRequestId
      ? [
          {
            rollRequestId,
            ...(rollResult ? { rollResult } : {}),
            ...(clientMessageId ? { clientMessageId } : {})
          }
        ]
      : [];

  return submittedRolls.map((submission) => ({
    rollRequestId: submission.rollRequestId?.trim() ?? "",
    ...(submission.rollResult ? { rollResult: submission.rollResult } : {}),
    ...(submission.clientMessageId?.trim()
      ? { clientMessageId: submission.clientMessageId.trim() }
      : {})
  }));
}

function validatePendingRollSubmissions(
  pendingRollRequests: DiceRollRequest[],
  submittedRolls: Array<{
    rollRequestId: string;
    rollResult?: DiceRollResult;
    clientMessageId?: string;
  }>,
  player?: PlayerRow
) {
  if (submittedRolls.length === 0) {
    return {
      content: "",
      remainingRollRequests: pendingRollRequests,
      clientMessageId: undefined
    };
  }

  if (pendingRollRequests.length === 0) {
    throw createStatusError(400, "There is no pending roll to resolve.");
  }

  if (submittedRolls.length > pendingRollRequests.length) {
    throw createStatusError(400, "Too many roll results were submitted.");
  }

  const content = submittedRolls
    .map((submission, index) => {
      const pendingRollRequest = pendingRollRequests[index];

      if (!submission.rollRequestId) {
        throw createStatusError(400, "A roll request id is required.");
      }

      if (!pendingRollRequest || submission.rollRequestId !== pendingRollRequest.id) {
        throw createStatusError(409, "The DM is waiting for the required roll.");
      }

      if (player && !rollRequestTargetsPlayer(pendingRollRequest, player)) {
        throw createStatusError(403, "That roll is waiting on another player.");
      }

      return formatRollSubmission(pendingRollRequest, submission.rollResult);
    })
    .join("\n");

  return {
    content,
    remainingRollRequests: pendingRollRequests.slice(submittedRolls.length),
    clientMessageId: submittedRolls[0]?.clientMessageId
  };
}

async function setPendingRollRequests(
  db: Queryable,
  campaignId: string,
  requests: DiceRollRequest[]
) {
  const currentRequest = requests[0] ?? null;

  await db.query(
    `
      update campaigns
      set metadata = case
        when $2::jsonb = '[]'::jsonb then metadata - 'pendingRollRequest' - 'pendingRollRequests'
        else jsonb_set(
          jsonb_set(metadata, '{pendingRollRequest}', $3::jsonb, true),
          '{pendingRollRequests}',
          $2::jsonb,
          true
        )
      end
      where id = $1
    `,
    [campaignId, JSON.stringify(requests), JSON.stringify(currentRequest)]
  );
}

async function resolveRoomCampaign(
  db: Queryable,
  roomId: string,
  sessionId: string
) {
  const statement = isUuid(roomId)
    ? `
        select *
        from campaigns
        where (id = $1 or hermes_session_id = $2)
          and status <> 'deleted'
        order by created_at desc
        limit 1
      `
    : `
        select *
        from campaigns
        where (hermes_session_id = $1 or hermes_session_id = $2)
          and status <> 'deleted'
        order by created_at desc
        limit 1
      `;
  const result = await db.query<CampaignRow>(statement, [roomId, sessionId]);

  return result.rows[0] ?? null;
}

async function assertCampaignAccessForUser(
  db: Queryable,
  campaign: CampaignRow,
  userId: string
) {
  if (campaign.owner_user_id === userId) {
    return;
  }

  const player = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1
        and user_id = $2
        and status = 'active'
      order by created_at asc
      limit 1
    `,
    [campaign.id, userId]
  );

  if (!player.rows[0]) {
    throw createStatusError(403, "You do not have access to that campaign.");
  }
}

function assertCampaignOwnerForUser(campaign: CampaignRow, userId: string) {
  if (campaign.owner_user_id !== userId) {
    throw createStatusError(403, "Only the campaign owner can do that.");
  }
}

async function getActiveRoomPlayerForUser(
  db: Queryable,
  campaignId: string,
  clientId: string,
  userId: string
) {
  const result = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1
        and client_id = $2
        and user_id = $3
        and status = 'active'
      limit 1
    `,
    [campaignId, clientId, userId]
  );

  return result.rows[0] ?? null;
}

async function getCurrentRoomTurn(db: Queryable, campaignId: string) {
  const result = await db.query<TurnRow>(
    `
      select *
      from turns
      where campaign_id = $1 and status in ('collecting', 'resolving')
      order by
        case status when 'resolving' then 0 else 1 end,
        created_at desc
      limit 1
    `,
    [campaignId]
  );

  return result.rows[0] ?? null;
}

async function getTurnSubmissions(db: Queryable, turnId: string) {
  const result = await db.query<SubmissionRow>(
    `
      select
        submissions.player_id,
        players.client_id,
        players.username,
        players.character_name,
        submissions.content,
        submissions.created_at
      from submissions
      left join players on players.id = submissions.player_id
      where submissions.turn_id = $1 and submissions.status = 'submitted'
      order by submissions.created_at asc
    `,
    [turnId]
  );

  return result.rows;
}

function rowToRoomPlayer(
  player: PlayerRow,
  submittedPlayerIds: Set<string>
): RoomSnapshot["players"][number] {
  return {
    id: player.client_id,
    slot: player.slot ?? 0,
    username: player.username,
    characterName: player.character_name,
    characterSheet: player.character_sheet,
    status: submittedPlayerIds.has(player.id) ? "submitted" : "waiting",
    lastSeenAt: toIso(player.last_seen_at)
  };
}

async function buildRoomSnapshot(
  db: Queryable,
  campaign: CampaignRow
): Promise<RoomSnapshot> {
  const currentTurn = await getCurrentRoomTurn(db, campaign.id);
  const submissions = currentTurn ? await getTurnSubmissions(db, currentTurn.id) : [];
  const submittedPlayerIds = new Set(
    submissions
      .map((submission) => submission.player_id)
      .filter((playerId): playerId is string => Boolean(playerId))
  );
  const playersResult = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1 and status = 'active'
      order by slot asc nulls last, created_at asc
    `,
    [campaign.id]
  );
  const events = await db.query<EventRow>(
    `
      select id, type, payload, created_at
      from (
        select id, type, payload, created_at
        from campaign_events
        where campaign_id = $1
          and type in (
            'turn_submitted',
            'turn_resolved',
            'adventure_begun',
            'dm_question',
            'dm_answer'
          )
        order by created_at desc
        limit 100
      ) recent_events
      order by created_at asc
    `,
    [campaign.id]
  );
  const messages = events.rows
    .map((event): RoomSnapshot["messages"][number] | null => {
      const payload = eventPayload(event.payload);
      const content = typeof payload.content === "string" ? payload.content : "";

      if (!content.trim()) {
        return null;
      }

      return {
        id: String(payload.messageId || event.id),
        role: payload.role === "player" ? "player" : "dm",
        kind: roomEventMessageKind(event.type),
        content,
        createdAt: toIso(event.created_at)
      };
    })
    .filter((message): message is RoomSnapshot["messages"][number] =>
      Boolean(message)
    );
  const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);

  return {
    roomId: campaign.id,
    mode: campaign.mode,
    sessionId: campaign.hermes_session_id,
    players: playersResult.rows.map((player) =>
      rowToRoomPlayer(player, submittedPlayerIds)
    ),
    messages,
    isResolving: currentTurn?.status === "resolving",
    hasBegun: campaign.has_begun,
    pendingRollRequest: pendingRollRequests[0] ?? null,
    pendingRollRequests,
    inputTargets: inputTargetsFromCampaign(campaign),
    inputPolicy: inputPolicyFromCampaign(campaign),
    updatedAt: toIso(campaign.updated_at)
  };
}

function previewText(value: string | undefined, maxLength = 1000) {
  const text = value ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function textStats(value: string | undefined) {
  const text = value ?? "";

  return {
    length: text.length,
    preview: previewText(text)
  };
}

function errorSummary(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error)
  };
}

function providerDebugSummary(debug: AiDebugInfo | undefined) {
  if (!debug) {
    return undefined;
  }

  return {
    providerResponseId: debug.providerResponseId,
    model: debug.model,
    requestMessageCount: debug.requestMessages.length,
    requestMessages: debug.requestMessages.map((message, index) => ({
      index,
      role: message.role,
      contentLength: message.content.length,
      contentPreview: previewText(message.content)
    })),
    rawResponseLength: debug.rawResponse.length,
    rawResponsePreview: previewText(debug.rawResponse),
    providerTimings: debug.providerTimings
  };
}

async function logTurnDebugTrace(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    phase: string;
    turnId?: string | undefined;
    elapsedMs?: number | undefined;
    payload?: Record<string, unknown> | undefined;
  }
) {
  const tracePayload = {
    traceId: input.traceId,
    phase: input.phase,
    turnId: input.turnId,
    elapsedMs: input.elapsedMs,
    at: nowIso(),
    ...(input.payload ?? {})
  };

  await logCampaignEvent(db, input.campaignId, "turn_debug_trace", tracePayload);
}

function formatCanonicalCharacterContext(players: PlayerRow[]) {
  const playablePlayers = players.filter(isProfileComplete);

  if (playablePlayers.length === 0) {
    return "Canonical player characters:\nNo completed character sheets are available.";
  }

  return [
    "Canonical player characters:",
    "Use these website-owned character sheets when framing scenes, choosing checks and modifiers, judging character capabilities, and spotlighting class, species, background, or story hooks.",
    "",
    ...playablePlayers.map((player, index) =>
      [
        `${index + 1}. ${player.username} playing ${player.character_name}`,
        "Character sheet:",
        player.character_sheet
      ].join("\n")
    )
  ].join("\n\n");
}

function formatSoloTurn(player: PlayerRow, content: string) {
  return [
    formatCanonicalCharacterContext([player]),
    "",
    "Current player action:",
    "Only treat concrete declared actions as actions. Quoted speech, questions, promises, plans, and corrections are dialogue or intent unless the player also says they move, travel, enter, search, attack, take something, cast a spell, or otherwise change the scene.",
    `${player.username} (${player.character_name}): ${content}`
  ].join("\n");
}

function formatMultiplayerTurn(players: PlayerRow[], submissions: SubmissionRow[]) {
  const actionLines = submissions.map((submission) => {
    const username = submission.username?.trim() || "Unknown player";
    const characterName = submission.character_name?.trim() || "Unknown character";

    return `${username} (${characterName}): ${submission.content}`;
  });

  return [
    formatCanonicalCharacterContext(players),
    "",
    "Current party actions:",
    "Resolve these submitted actions as one combined party turn. Account for timing, positioning, cooperation, conflict, and consequences across the whole party before asking what happens next.",
    ...actionLines
  ].join("\n");
}

function formatOpeningSceneRequest(input: {
  mode: CampaignMode;
  players: PlayerRow[];
  style: CampaignOpeningStyle;
}) {
  const modeDirection =
    input.mode === "single_player"
      ? "This is a singleplayer campaign. Spotlight the solo character directly, tie the premise to their sheet or background when possible, and make the first choice immediately actionable for one player."
      : "This is a multiplayer campaign. Establish why the party is together now with a shared job, summons, debt, journey, investigation, emergency, or mutual destination; do not make them feel like unrelated strangers standing near an encounter.";
  const customWorldName = input.style.customWorldName
    ? `World name: ${input.style.customWorldName}`
    : "";
  const customWorldDescription = input.style.customWorldDescription
    ? `Custom world description: ${input.style.customWorldDescription}`
    : "";

  return [
    formatCanonicalCharacterContext(input.players),
    "",
    "Current player action:",
    openingSceneRequest,
    "",
    "Campaign opening setup:",
    `Mode: ${input.mode}`,
    `Party size: ${input.players.length}`,
    input.style.campaignGenre ? `Campaign genre: ${input.style.campaignGenre}` : "",
    input.style.campaignGenrePromptBrief
      ? `Campaign genre guidance: ${input.style.campaignGenrePromptBrief}`
      : "",
    customWorldName,
    customWorldDescription,
    "",
    "Campaign opener requirements:",
    "Write a true campaign opener, not only a room description, road encounter, or local hazard.",
    "Establish a named starting place and a named larger region, realm, frontier, city, or world. If the setup does not provide names, invent strong fantasy names.",
    "Establish why the character or party is here now and what set them on this path.",
    "Give the character a concrete first objective, destination, mystery, obligation, rescue, delivery, investigation, or promise that can drive the next several scenes.",
    "Introduce an immediate obstacle, threat, discovery, or NPC demand that blocks or complicates that objective right now.",
    "Make the campaign promise legible: what kind of adventure this is, what larger problem is stirring, and why the character should care.",
    "Use character sheet details to personalize hooks, warnings, sensory cues, relationships, or stakes without rewriting character backstories.",
    "",
    "Opening scene quality bar:",
    "Write 4-7 rich paragraphs with concrete sensory detail, spatial clarity, premise, purpose, an immediate tension, and clear interactable choices.",
    "Begin in the fiction immediately; do not ask what kind of world the player wants.",
    "Return no player-facing roll requests unless danger or uncertainty already requires dice before the player can act.",
    "End with a direct player-facing prompt such as 'What do you do?'",
    modeDirection
  ]
    .filter(Boolean)
    .join("\n");
}

function openingSceneInstructions(mode: CampaignMode) {
  const modeDirection =
    mode === "single_player"
      ? "The website has provided the solo player's character setup."
      : "The website has provided the full current party.";

  return [
    dungeonMasterInstructions,
    modeDirection,
    "Use the campaign setup and canonical character sheets to begin with a rich campaign opener: establish named place, larger context, shared purpose, first objective, and immediate obstacle. Do not mention implementation details."
  ].join(" ");
}

function askDmInstructions() {
  return [
    "You are the AI Taverns DnD Dungeon Master answering an out-of-turn table question.",
    "Return exactly one valid JSON object and no Markdown.",
    "{\"answer\":\"Your player-facing answer.\"}",
    "This is not a player action and must not advance game time.",
    "Do not move the scene forward, resolve consequences, consume resources, request dice, change pending rolls, trigger NPC actions, or introduce new hidden facts as if discovered.",
    "Use only already-established campaign context, visible character knowledge, rules reasoning, and reasonable table clarification.",
    "If the player is asking to do something in the fiction, tell them to submit it as a turn/action instead of resolving it here.",
    "Keep the answer concise and useful, normally 1-3 short paragraphs."
  ].join("\n");
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    const firstBrace = value.indexOf("{");
    const lastBrace = value.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(value.slice(firstBrace, lastBrace + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }

    return {};
  }
}

function answerFromAskDmProviderResponse(content: string) {
  const parsed = parseJsonRecord(content);
  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";

  if (answer) {
    return answer;
  }

  const trimmed = content.trim();

  if (trimmed) {
    return trimmed;
  }

  throw new Error("The DM provider returned an empty answer.");
}

async function getActivePlayers(db: Queryable, campaignId: string) {
  const result = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1 and status = 'active'
      order by slot asc nulls last, created_at asc
    `,
    [campaignId]
  );

  return result.rows.filter(isPlayerRecentlySeen);
}

function formatAskDmQuestion(
  players: PlayerRow[],
  asker: PlayerRow,
  question: string
) {
  return [
    formatCanonicalCharacterContext(players.length > 0 ? players : [asker]),
    "",
    "Out-of-turn Ask DM question:",
    "The player is asking for clarification without advancing time. Answer as table guidance, not as a committed character action.",
    `${asker.username} (${asker.character_name}): ${question}`
  ].join("\n");
}

async function getCampaignEventMessages(
  db: Queryable,
  campaignId: string,
  limit = 30
): Promise<GameMessage[]> {
  const events = await db.query<EventRow>(
    `
      select id, type, payload, created_at
      from (
        select id, type, payload, created_at
        from campaign_events
        where campaign_id = $1
          and type in (
            'turn_submitted',
            'turn_resolved',
            'adventure_begun',
            'dm_question',
            'dm_answer'
          )
        order by created_at desc
        limit $2
      ) recent_events
      order by created_at asc
    `,
    [campaignId, limit]
  );

  return events.rows
    .map((event): GameMessage | null => {
      const payload = eventPayload(event.payload);
      const content = typeof payload.content === "string" ? payload.content : "";

      if (!content.trim()) {
        return null;
      }

      return {
        id: String(payload.messageId || event.id),
        role: payload.role === "player" ? "player" : "dm",
        kind:
          event.type === "dm_question"
            ? "ask_dm_question"
            : event.type === "dm_answer"
              ? "ask_dm_answer"
              : "turn",
        content,
        createdAt: toIso(event.created_at)
      };
    })
    .filter((message): message is GameMessage => message !== null);
}

async function askDungeonMaster(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: Pick<CampaignRow, "id" | "hermes_session_id">,
  message: string,
  instructions: string,
  includeHistory = true,
  turnId?: string,
  currentPlayerAction?: string
) {
  const traceId = randomUUID();
  const startedAt = Date.now();

  await logTurnDebugTrace(db, {
    campaignId: campaign.id,
    traceId,
    phase: "dm_turn_started",
    turnId,
    elapsedMs: 0,
    payload: {
      hermesSessionId: campaign.hermes_session_id,
      includeHistory,
      message: textStats(message),
      instructions: textStats(instructions)
    }
  });

  try {
    const promptContext = runtime.buildPromptContext
      ? await runtime.buildPromptContext({
          campaignId: campaign.id,
          turnId,
          currentAction: message,
          baseInstructions: instructions
        })
      : null;
    const history =
      includeHistory && !promptContext
        ? await getCampaignEventMessages(db, campaign.id)
        : [];
    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      message: promptContext?.message ?? message,
      instructions: promptContext?.instructions ?? instructions,
      history
    });

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "provider_response_received",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        durationMs: Date.now() - providerStartedAt,
        historyCount: history.length,
        provider: providerDebugSummary(providerData.debug)
      }
    });

    const contract = parseHermesDmContract(providerData.content, {
      currentAction: message,
      ...(currentPlayerAction ? { currentPlayerAction } : {})
    });
    const rollRequests = normalizeRollRequests(contract.rollRequests);
    const reply = contract.publicNarration;

    if (!reply) {
      throw new Error(`The DM provider returned an empty reply. Trace ID: ${traceId}`);
    }

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "dm_contract_parse_succeeded",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        rollRequestsCount: rollRequests.length,
        rollRequestLabels: rollRequests.map((request) => request.label),
        nextInputNeeded: contract.nextInputNeeded,
        inputPolicy: contract.inputPolicy,
        inputTargets: contract.inputTargets
      }
    });

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "dm_turn_completed",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        reply: textStats(reply),
        rollRequestsCount: rollRequests.length,
        nextInputNeeded: contract.nextInputNeeded
      }
    });

    return {
      id: providerData.id,
      content: reply,
      debug: providerData.debug,
      rollRequests,
      inputTargets: contract.inputTargets,
      inputPolicy: contract.inputPolicy,
      setting: contract.setting
    };
  } catch (error) {
    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "dm_turn_failed",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        error: errorSummary(error),
        diagnostics:
          error instanceof Error
            ? undefined
            : debugHermesDmContractFailure(String(error), { currentAction: message })
      }
    });

    if (error instanceof Error && error.message.includes("Trace ID:")) {
      throw error;
    }

    throw new Error(
      `${error instanceof Error ? error.message : "DM provider call failed."} Trace ID: ${traceId}`
    );
  }
}

function settingMetadata(setting: CampaignSettingSummary | undefined) {
  const displayLocation = setting?.displayLocation?.trim();
  const worldName = setting?.worldName?.trim();
  const startingLocation = setting?.startingLocation?.trim();

  if (!displayLocation && !worldName && !startingLocation) {
    return {};
  }

  return {
    setting: {
      displayLocation: displayLocation || startingLocation || worldName || null,
      worldName: worldName || null,
      startingLocation: startingLocation || null
    }
  };
}

async function setPendingInputTargets(
  db: Queryable,
  campaignId: string,
  inputTargets: string[],
  inputPolicy: InputPolicy
) {
  const shouldTargetPlayers =
    inputPolicy === "only_targeted_players" && inputTargets.length > 0;

  await db.query(
    `
      update campaigns
      set metadata = case
        when $2::jsonb = '[]'::jsonb then metadata - 'inputTargets' - 'inputPolicy'
        else jsonb_set(
          jsonb_set(metadata, '{inputTargets}', $2::jsonb, true),
          '{inputPolicy}',
          $3::jsonb,
          true
        )
      end
      where id = $1
    `,
    [
      campaignId,
      JSON.stringify(shouldTargetPlayers ? inputTargets : []),
      JSON.stringify(shouldTargetPlayers ? inputPolicy : "all_players")
    ]
  );
}

async function finishResolvedTurn(
  db: pg.Pool,
  input: {
    campaignId: string;
    turnId: string;
    hermesMessageId: string | undefined;
    reply: string;
    eventType: "adventure_begun" | "turn_resolved";
    pendingRollRequests?: DiceRollRequest[];
    inputTargets?: string[];
    inputPolicy?: InputPolicy;
    setting?: CampaignSettingSummary | undefined;
    aiDebug?: AiDebugInfo | undefined;
  }
) {
  const pendingRollRequests = input.pendingRollRequests ?? [];
  const currentPendingRollRequest = pendingRollRequests[0] ?? null;
  const settingPatch = settingMetadata(input.setting);
  let dmEventId: string | undefined;

  await withTransaction(db, async (client) => {
    await client.query(
      `
        update turns
        set status = 'resolved', hermes_message_id = $2, resolved_at = now(), error = null
        where id = $1
      `,
      [input.turnId, input.hermesMessageId ?? null]
    );
    await client.query(
      `
        update submissions
        set status = 'included_in_turn'
        where turn_id = $1 and status = 'submitted'
      `,
      [input.turnId]
    );
    dmEventId = await logCampaignEvent(client, input.campaignId, input.eventType, {
      turnId: input.turnId,
      hermesMessageId: input.hermesMessageId,
      messageId: input.hermesMessageId ?? randomUUID(),
      role: "dm",
      content: input.reply,
      ...settingPatch,
      pendingRollRequest: currentPendingRollRequest,
      pendingRollRequests,
      inputTargets: input.inputTargets ?? [],
      inputPolicy: input.inputPolicy ?? "all_players",
      aiDebug: input.aiDebug
    });

    if (
      input.eventType === "adventure_begun" &&
      Object.keys(settingPatch).length > 0
    ) {
      await client.query(
        `
          update campaigns
          set metadata = metadata || $2::jsonb
          where id = $1
        `,
        [input.campaignId, JSON.stringify(settingPatch)]
      );
    }

    await setPendingRollRequests(client, input.campaignId, pendingRollRequests);
    await setPendingInputTargets(
      client,
      input.campaignId,
      input.inputTargets ?? [],
      input.inputPolicy ?? "all_players"
    );
    await ensureCollectingTurn(client, input.campaignId);
  });

  return { dmEventId };
}

async function markTurnFailed(db: Queryable, turnId: string, error: unknown) {
  await db.query(
    `
      update turns
      set status = 'failed', error = $2
      where id = $1
    `,
    [turnId, error instanceof Error ? error.message : "DM provider call failed."]
  );
}

export async function getRoomForUser(
  db: pg.Pool,
  input: {
    roomId: string;
    sessionId: string;
    userId: string;
  }
): Promise<RoomSnapshot> {
  const campaign = await resolveRoomCampaign(db, input.roomId, input.sessionId);

  if (!campaign) {
    throw createStatusError(404, "Campaign not found.");
  }

  await assertCampaignAccessForUser(db, campaign, input.userId);

  const player = await db.query<PlayerRow>(
    `
      update players
      set last_seen_at = now()
      where campaign_id = $1
        and user_id = $2
        and status = 'active'
      returning *
    `,
    [campaign.id, input.userId]
  );

  return buildRoomSnapshot(db, {
    ...campaign,
    updated_at: player.rows[0] ? new Date() : campaign.updated_at
  });
}

export async function registerRoomPlayerForUser(
  db: pg.Pool,
  input: {
    roomId: string;
    sessionId: string;
    playerId: string;
    username: string;
    characterName: string;
    characterSheet: string;
    userId: string;
  }
): Promise<RoomSnapshot> {
  const campaign = await withTransaction(db, async (client) => {
    const campaignRow = await resolveRoomCampaign(
      client,
      input.roomId,
      input.sessionId
    );

    if (!campaignRow) {
      throw createStatusError(404, "Campaign not found.");
    }

    await assertCampaignAccessForUser(client, campaignRow, input.userId);

    const existing = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and client_id = $2
        limit 1
      `,
      [campaignRow.id, input.playerId]
    );
    const slotResult = await client.query<{ slot: number }>(
      `
        select slot
        from players
        where campaign_id = $1 and status <> 'kicked' and slot is not null
        order by slot asc
      `,
      [campaignRow.id]
    );
    const usedSlots = new Set(slotResult.rows.map((row) => row.slot));
    const firstOpenSlot = Array.from({ length: maxPlayers }, (_, slot) =>
      slot
    ).find((slot) => !usedSlots.has(slot));
    const slot = existing.rows[0]?.slot ?? firstOpenSlot;

    if (slot === undefined) {
      throw createStatusError(409, "The room already has four active players.");
    }

    await client.query(
      `
        insert into players (
          campaign_id,
          client_id,
          username,
          character_name,
          character_sheet,
          user_id,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'active', now())
        on conflict (campaign_id, client_id) do update
        set username = excluded.username,
            character_name = excluded.character_name,
            character_sheet = excluded.character_sheet,
            user_id = coalesce(players.user_id, excluded.user_id),
            status = 'active',
            kicked_at = null,
            last_seen_at = now()
      `,
      [
        campaignRow.id,
        input.playerId,
        input.username,
        input.characterName,
        input.characterSheet,
        input.userId,
        slot
      ]
    );
    await logCampaignEvent(
      client,
      campaignRow.id,
      existing.rows[0] ? "profile_updated" : "player_joined",
      {
        clientId: input.playerId,
        username: input.username,
        characterName: input.characterName,
        slot
      }
    );

    return campaignRow;
  });

  return buildRoomSnapshot(db, campaign);
}

export async function beginRoomForUser(
  db: pg.Pool,
  input: {
    roomId: string;
    sessionId: string;
    userId: string;
    runtime?: DungeonMasterRuntime | undefined;
  }
): Promise<RoomSnapshot> {
  const beginState = await withTransaction(db, async (client) => {
    const campaignRow = await resolveRoomCampaign(
      client,
      input.roomId,
      input.sessionId
    );

    if (!campaignRow) {
      throw createStatusError(404, "Campaign not found.");
    }

    assertCampaignOwnerForUser(campaignRow, input.userId);

    const locked = await client.query<CampaignRow>(
      "select * from campaigns where id = $1 for update",
      [campaignRow.id]
    );
    const lockedCampaign = requireRow(locked.rows[0], "Campaign not found.");

    if (!lockedCampaign.has_begun) {
      const players = (
        await client.query<PlayerRow>(
          `
            select *
            from players
            where campaign_id = $1 and status = 'active'
            order by slot asc nulls last, created_at asc
          `,
          [lockedCampaign.id]
        )
      ).rows;

      if (players.filter(isProfileComplete).length < 2) {
        throw createStatusError(
          400,
          "At least two players are needed to begin the adventure."
        );
      }

      const turn = await ensureCollectingTurn(client, lockedCampaign.id);

      if (input.runtime) {
        const openingTurn = (
          await client.query<TurnRow>(
            `
              update turns
              set status = 'resolving'
              where id = $1 and status = 'collecting'
              returning *
            `,
            [turn.id]
          )
        ).rows[0];

        if (!openingTurn) {
          throw createStatusError(409, "That opening turn is already resolving.");
        }

        await logCampaignEvent(client, lockedCampaign.id, "turn_resolving", {
          turnId: openingTurn.id,
          reason: "adventure_begun"
        });

        return {
          campaign: lockedCampaign,
          players,
          turn: openingTurn,
          shouldAskDungeonMaster: true
        };
      }

      const begun = await client.query<CampaignRow>(
        `
          update campaigns
          set has_begun = true, updated_at = now()
          where id = $1 and has_begun = false
          returning *
        `,
        [lockedCampaign.id]
      );
      await logCampaignEvent(client, lockedCampaign.id, "adventure_begun", {
        messageId: randomUUID(),
        role: "dm",
        content: "The adventure begins."
      });

      return {
        campaign: begun.rows[0] ?? lockedCampaign,
        players,
        shouldAskDungeonMaster: false
      };
    }

    return {
      campaign: lockedCampaign,
      players: [],
      shouldAskDungeonMaster: false
    };
  });

  if (!beginState.shouldAskDungeonMaster || !input.runtime || !beginState.turn) {
    return buildRoomSnapshot(db, beginState.campaign);
  }

  const currentAction = formatOpeningSceneRequest({
    mode: "multiplayer",
    players: beginState.players,
    style: campaignOpeningStyleFromMetadata(beginState.campaign)
  });

  try {
    const opening = await askDungeonMaster(
      db,
      input.runtime,
      beginState.campaign,
      currentAction,
      openingSceneInstructions("multiplayer"),
      true,
      beginState.turn.id
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: beginState.campaign.id,
      turnId: beginState.turn.id,
      hermesMessageId: opening.id,
      reply: opening.content,
      eventType: "adventure_begun",
      pendingRollRequests: opening.rollRequests,
      inputTargets: opening.inputTargets,
      inputPolicy: opening.inputPolicy,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    await db.query("update campaigns set has_begun = true where id = $1", [
      beginState.campaign.id
    ]);

    void input.runtime.runPostTurnContextJobs?.({
      campaignId: beginState.campaign.id,
      turnId: beginState.turn.id,
      currentAction,
      dmResponse: opening.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: opening.rollRequests
    });
  } catch (error) {
    await markTurnFailed(db, beginState.turn.id, error);
    await logCampaignEvent(db, beginState.campaign.id, "turn_failed", {
      turnId: beginState.turn.id,
      error: error instanceof Error ? error.message : "DM provider call failed."
    });
    throw error;
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    beginState.campaign.id,
    beginState.campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? beginState.campaign);
}

async function allRequiredPlayersSubmitted(
  db: Queryable,
  campaignId: string,
  turnId: string,
  inputTargets: string[],
  inputPolicy: "all_players" | "only_targeted_players"
) {
  const activePlayers = (
    await db.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and status = 'active'
      `,
      [campaignId]
    )
  ).rows.filter(isProfileComplete);
  const requiredPlayers =
    inputPolicy === "only_targeted_players"
      ? activePlayers.filter((player) =>
          playerMatchesInputTargets(player, inputTargets)
        )
      : activePlayers;

  if (requiredPlayers.length === 0) {
    return true;
  }

  const submissions = await db.query<{ player_id: string | null }>(
    `
      select player_id
      from submissions
      where turn_id = $1 and status = 'submitted'
    `,
    [turnId]
  );
  const submittedPlayerIds = new Set(
    submissions.rows
      .map((submission) => submission.player_id)
      .filter((playerId): playerId is string => Boolean(playerId))
  );

  return requiredPlayers.every((player) => submittedPlayerIds.has(player.id));
}

export async function submitRoomTurnForUser(
  db: pg.Pool,
  input: {
    roomId: string;
    sessionId: string;
    playerId: string;
    message: string;
    userId: string;
    runtime: DungeonMasterRuntime;
    rollRequestId?: string;
    rollResult?: DiceRollResult;
    clientMessageId?: string;
    rollSubmissions?: DiceRollSubmission[];
  }
): Promise<RoomSnapshot> {
  const submitState = await withTransaction(db, async (client) => {
    const campaignRow = await resolveRoomCampaign(
      client,
      input.roomId,
      input.sessionId
    );

    if (!campaignRow) {
      throw createStatusError(404, "Campaign not found.");
    }

    await assertCampaignAccessForUser(client, campaignRow, input.userId);

    if (!campaignRow.has_begun) {
      throw createStatusError(400, "Begin the adventure before sending turns.");
    }

    const player = await getActiveRoomPlayerForUser(
      client,
      campaignRow.id,
      input.playerId,
      input.userId
    );

    if (!player) {
      throw createStatusError(400, "Join the room before submitting a turn.");
    }

    if (!isProfileComplete(player)) {
      throw createStatusError(400, "Player profile is incomplete.");
    }

    const pendingRollRequests = pendingRollRequestsFromCampaign(campaignRow);
    const inputTargets = inputTargetsFromCampaign(campaignRow);
    const inputPolicy = inputPolicyFromCampaign(campaignRow);
    const submittedRolls = rollSubmissionsFromPayload(
      input.rollRequestId,
      input.rollResult,
      input.clientMessageId,
      input.rollSubmissions
    );
    const isRollSubmission = submittedRolls.length > 0;
    const rollSubmission = validatePendingRollSubmissions(
      pendingRollRequests,
      submittedRolls,
      player
    );

    if (!isRollSubmission && pendingRollRequests.length > 0) {
      throw createStatusError(409, "The DM is waiting for the required roll.");
    }

    if (
      !isRollSubmission &&
      inputPolicy === "only_targeted_players" &&
      !playerMatchesInputTargets(player, inputTargets)
    ) {
      throw createStatusError(403, "The DM is waiting on another player.");
    }

    const turn = await ensureCollectingTurn(client, campaignRow.id);
    const trimmedContent = isRollSubmission
      ? rollSubmission.content
      : input.message.trim();

    if (!trimmedContent) {
      throw createStatusError(400, "A player message is required.");
    }

    await client.query(
      `
        insert into submissions (campaign_id, turn_id, player_id, content)
        values ($1, $2, $3, $4)
        on conflict (turn_id, player_id) do update
        set content = case
              when $5 then submissions.content || E'\n' || excluded.content
              else excluded.content
            end,
            status = 'submitted'
      `,
      [campaignRow.id, turn.id, player.id, trimmedContent, isRollSubmission]
    );

    if (isRollSubmission) {
      await setPendingRollRequests(
        client,
        campaignRow.id,
        rollSubmission.remainingRollRequests
      );
    }

    await client.query("update players set last_seen_at = now() where id = $1", [
      player.id
    ]);
    await logCampaignEvent(client, campaignRow.id, "turn_submitted", {
      turnId: turn.id,
      clientId: player.client_id,
      role: "player",
      messageId:
        rollSubmission.clientMessageId ||
        input.clientMessageId ||
        randomUUID(),
      content: `${player.username} (${player.character_name}): ${trimmedContent}`
    });

    if (isRollSubmission && rollSubmission.remainingRollRequests.length > 0) {
      return { campaign: campaignRow, shouldResolve: false as const };
    }

    const shouldResolve = isRollSubmission
      ? true
      : await allRequiredPlayersSubmitted(
          client,
          campaignRow.id,
          turn.id,
          inputTargets,
          inputPolicy
        );

    if (!shouldResolve) {
      return { campaign: campaignRow, shouldResolve: false as const };
    }

    const claimedTurn = await client.query<TurnRow>(
      `
        update turns
        set status = 'resolving'
        where id = $1 and status = 'collecting'
        returning *
      `,
      [turn.id]
    );

    if (!claimedTurn.rows[0]) {
      throw createStatusError(409, "That turn is already resolving.");
    }

    await logCampaignEvent(client, campaignRow.id, "turn_resolving", {
      turnId: turn.id,
      reason: isRollSubmission ? "rolls_submitted" : "all_players_submitted"
    });

    const players = (
      await client.query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1 and status = 'active'
          order by slot asc nulls last, created_at asc
        `,
        [campaignRow.id]
      )
    ).rows.filter(isProfileComplete);
    const submissions = await getTurnSubmissions(client, turn.id);

    return {
      campaign: campaignRow,
      shouldResolve: true as const,
      turn: claimedTurn.rows[0],
      players,
      submissions
    };
  });

  if (submitState.shouldResolve) {
    try {
      const currentAction = formatMultiplayerTurn(
        submitState.players,
        submitState.submissions
      );
      const reply = await askDungeonMaster(
        db,
        input.runtime,
        submitState.campaign,
        currentAction,
        dungeonMasterInstructions,
        true,
        submitState.turn.id,
        currentAction
      );
      const resolvedTurn = await finishResolvedTurn(db, {
        campaignId: submitState.campaign.id,
        turnId: submitState.turn.id,
        hermesMessageId: reply.id,
        reply: reply.content,
        eventType: "turn_resolved",
        pendingRollRequests: reply.rollRequests,
        inputTargets: reply.inputTargets,
        inputPolicy: reply.inputPolicy,
        aiDebug: reply.debug
      });

      void input.runtime.runPostTurnContextJobs?.({
        campaignId: submitState.campaign.id,
        turnId: submitState.turn.id,
        currentAction,
        dmResponse: reply.content,
        dmEventId: resolvedTurn.dmEventId,
        rollRequests: reply.rollRequests
      });
    } catch (error) {
      await markTurnFailed(db, submitState.turn.id, error);
      await logCampaignEvent(db, submitState.campaign.id, "turn_failed", {
        turnId: submitState.turn.id,
        error: error instanceof Error ? error.message : "DM provider call failed."
      });
      throw error;
    }
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    submitState.campaign.id,
    submitState.campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? submitState.campaign);
}

async function getActivePlayerForUser(
  db: Queryable,
  campaignId: string,
  userId: string
) {
  const result = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1
        and user_id = $2
        and status = 'active'
      order by created_at asc
      limit 1
    `,
    [campaignId, userId]
  );

  return result.rows[0] ?? null;
}

export async function askDungeonMasterQuestionForUser(
  db: pg.Pool,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    question: string;
    userId: string;
    clientMessageId?: string;
  }
): Promise<RoomSnapshot> {
  const trimmedQuestion = input.question.trim();

  if (!trimmedQuestion) {
    throw createStatusError(400, "A question is required.");
  }

  const { campaign, player } = await withTransaction(db, async (client) => {
    const campaignRow = (
      await client.query<CampaignRow>(
        `
          select *
          from campaigns
          where id = $1 and status = 'active'
          limit 1
        `,
        [input.campaignId]
      )
    ).rows[0];

    if (!campaignRow) {
      throw createStatusError(404, "Campaign not found.");
    }

    await assertCampaignAccessForUser(client, campaignRow, input.userId);

    const activePlayer = await getActivePlayerForUser(
      client,
      campaignRow.id,
      input.userId
    );

    if (!activePlayer) {
      throw createStatusError(400, "An active player profile is required.");
    }

    await client.query("update players set last_seen_at = now() where id = $1", [
      activePlayer.id
    ]);

    return { campaign: campaignRow, player: activePlayer };
  });

  const players = await getActivePlayers(db, campaign.id);
  const currentAction = formatAskDmQuestion(players, player, trimmedQuestion);
  const promptContext = runtime.buildPromptContext
    ? await runtime.buildPromptContext({
        campaignId: campaign.id,
        currentAction,
        baseInstructions: askDmInstructions()
      })
    : null;
  const history = promptContext
    ? []
    : await getCampaignEventMessages(db, campaign.id);
  const providerData = await runtime.askProvider({
    message: promptContext?.message ?? currentAction,
    instructions: promptContext?.instructions ?? askDmInstructions(),
    history
  });
  const answer = answerFromAskDmProviderResponse(providerData.content);
  const questionMessageId = input.clientMessageId?.trim() || randomUUID();
  const answerMessageId = providerData.id || randomUUID();

  await withTransaction(db, async (client) => {
    await logCampaignEvent(client, campaign.id, "dm_question", {
      messageId: questionMessageId,
      role: "player",
      playerId: player.id,
      clientId: player.client_id,
      content: trimmedQuestion
    });
    await logCampaignEvent(client, campaign.id, "dm_answer", {
      messageId: answerMessageId,
      role: "dm",
      playerId: player.id,
      inReplyToMessageId: questionMessageId,
      content: answer,
      aiDebug: providerData.debug
    });
  });

  const updatedCampaign = await resolveRoomCampaign(
    db,
    campaign.id,
    campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? campaign);
}

export async function submitSoloTurnForUser(
  db: pg.Pool,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    message: string;
    userId: string;
    rollRequestId?: string;
    rollResult?: DiceRollResult;
    clientMessageId?: string;
    rollSubmissions?: DiceRollSubmission[];
  }
): Promise<RoomSnapshot> {
  const soloState = await withTransaction(db, async (client) => {
    const campaign = (
      await client.query<CampaignRow>(
        `
          select *
          from campaigns
          where id = $1 and status = 'active'
          limit 1
        `,
        [input.campaignId]
      )
    ).rows[0];

    if (!campaign) {
      throw createStatusError(404, "Campaign not found.");
    }

    await assertCampaignAccessForUser(client, campaign, input.userId);

    if (campaign.mode !== "single_player") {
      throw createStatusError(
        400,
        "Solo turns are only available in singleplayer campaigns."
      );
    }

    const player = await getActivePlayerForUser(client, campaign.id, input.userId);

    if (!player) {
      throw createStatusError(400, "A solo player profile is required.");
    }

    const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);
    const submittedRolls = rollSubmissionsFromPayload(
      input.rollRequestId,
      input.rollResult,
      input.clientMessageId,
      input.rollSubmissions
    );
    const isRollSubmission = submittedRolls.length > 0;
    const rollSubmission = validatePendingRollSubmissions(
      pendingRollRequests,
      submittedRolls,
      player
    );

    if (!isRollSubmission && pendingRollRequests.length > 0) {
      throw createStatusError(409, "The DM is waiting for the required roll.");
    }

    const turn = await ensureCollectingTurn(client, campaign.id);
    const trimmedContent = isRollSubmission
      ? rollSubmission.content
      : input.message.trim();

    if (!trimmedContent) {
      throw createStatusError(400, "A player message is required.");
    }

    const submissionResult = await client.query<{ content: string }>(
      `
        insert into submissions (campaign_id, turn_id, player_id, content)
        values ($1, $2, $3, $4)
        on conflict (turn_id, player_id) do update
        set content = case
              when $5 then submissions.content || E'\n' || excluded.content
              else excluded.content
            end,
            status = 'submitted'
        returning content
      `,
      [campaign.id, turn.id, player.id, trimmedContent, isRollSubmission]
    );
    const submittedContent = submissionResult.rows[0]?.content ?? trimmedContent;

    if (isRollSubmission) {
      await setPendingRollRequests(
        client,
        campaign.id,
        rollSubmission.remainingRollRequests
      );
    }

    await client.query("update players set last_seen_at = now() where id = $1", [
      player.id
    ]);
    await logCampaignEvent(client, campaign.id, "turn_submitted", {
      turnId: turn.id,
      clientId: player.client_id,
      role: "player",
      messageId: rollSubmission.clientMessageId || input.clientMessageId || randomUUID(),
      content: trimmedContent
    });

    if (isRollSubmission && rollSubmission.remainingRollRequests.length > 0) {
      return { campaign, shouldResolve: false, turn, player, content: submittedContent };
    }

    const claimedTurn = await client.query<TurnRow>(
      `
        update turns
        set status = 'resolving'
        where id = $1 and status = 'collecting'
        returning *
      `,
      [turn.id]
    );

    if (!claimedTurn.rows[0]) {
      throw createStatusError(409, "That turn is already resolving.");
    }

    await logCampaignEvent(client, campaign.id, "turn_resolving", {
      turnId: turn.id,
      reason: "solo_turn"
    });

    return {
      campaign,
      shouldResolve: true,
      turn: claimedTurn.rows[0],
      player,
      content: submittedContent
    };
  });

  if (!soloState.shouldResolve) {
    const updatedCampaign = await resolveRoomCampaign(
      db,
      soloState.campaign.id,
      soloState.campaign.hermes_session_id
    );

    return buildRoomSnapshot(db, updatedCampaign ?? soloState.campaign);
  }

  try {
    const currentAction = formatSoloTurn(soloState.player, soloState.content);
    const reply = await askDungeonMaster(
      db,
      runtime,
      soloState.campaign,
      currentAction,
      dungeonMasterInstructions,
      true,
      soloState.turn.id,
      soloState.content
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: soloState.campaign.id,
      turnId: soloState.turn.id,
      hermesMessageId: reply.id,
      reply: reply.content,
      eventType: "turn_resolved",
      pendingRollRequests: reply.rollRequests,
      inputTargets: reply.inputTargets,
      inputPolicy: reply.inputPolicy,
      aiDebug: reply.debug
    });

    void runtime.runPostTurnContextJobs?.({
      campaignId: soloState.campaign.id,
      turnId: soloState.turn.id,
      currentAction,
      dmResponse: reply.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: reply.rollRequests
    });
  } catch (error) {
    await markTurnFailed(db, soloState.turn.id, error);
    await logCampaignEvent(db, soloState.campaign.id, "turn_failed", {
      turnId: soloState.turn.id,
      error: error instanceof Error ? error.message : "DM provider call failed."
    });
    throw error;
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    soloState.campaign.id,
    soloState.campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? soloState.campaign);
}

function eventPayloadString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function regenerateCampaignResponseForUser(
  db: pg.Pool,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    messageId: string;
    userId: string;
  }
): Promise<RoomSnapshot> {
  const regenerationState = await withTransaction(db, async (client) => {
    const campaign = (
      await client.query<CampaignRow>(
        `
          select *
          from campaigns
          where id = $1 and status = 'active'
          limit 1
        `,
        [input.campaignId]
      )
    ).rows[0];

    if (!campaign) {
      throw createStatusError(404, "Campaign not found.");
    }

    await assertCampaignAccessForUser(client, campaign, input.userId);

    const latestVisibleEvent = (
      await client.query<EventRow>(
        `
          select id, type, payload, created_at
          from campaign_events
          where campaign_id = $1
            and type in ('turn_submitted', 'turn_resolved', 'adventure_begun')
          order by created_at desc
          limit 1
        `,
        [campaign.id]
      )
    ).rows[0];
    const latestPayload = eventPayload(latestVisibleEvent?.payload);

    if (
      !latestVisibleEvent ||
      (latestVisibleEvent.type !== "turn_resolved" &&
        latestVisibleEvent.type !== "adventure_begun") ||
      latestPayload.role !== "dm" ||
      latestPayload.messageId !== input.messageId
    ) {
      throw createStatusError(409, "Only the latest DM response can be regenerated.");
    }

    const turnId = eventPayloadString(latestPayload.turnId);

    if (!turnId) {
      throw createStatusError(409, "That response is missing turn information.");
    }

    const resolvingTurn = (
      await client.query<TurnRow>(
        `
          update turns
          set status = 'resolving', error = null, updated_at = now()
          where id = $1
            and campaign_id = $2
            and status in ('resolved', 'failed')
          returning *
        `,
        [turnId, campaign.id]
      )
    ).rows[0];

    if (!resolvingTurn) {
      throw createStatusError(409, "That response cannot be regenerated right now.");
    }

    await client.query(
      `
        update submissions
        set status = 'submitted', updated_at = now()
        where turn_id = $1 and status = 'included_in_turn'
      `,
      [turnId]
    );
    await client.query("delete from campaign_events where id = $1", [
      latestVisibleEvent.id
    ]);
    await logCampaignEvent(client, campaign.id, "turn_resolving", {
      turnId,
      reason: "regenerate_response",
      replacedMessageId: input.messageId
    });
    await setPendingRollRequests(client, campaign.id, []);
    await setPendingInputTargets(client, campaign.id, [], "all_players");

    const submissions = await client.query<
      SubmissionRow & { character_sheet: string | null; slot: number | null }
    >(
      `
        select
          submissions.player_id,
          players.client_id,
          players.username,
          players.character_name,
          players.character_sheet,
          players.slot,
          submissions.content,
          submissions.created_at
        from submissions
        left join players on players.id = submissions.player_id
        where submissions.turn_id = $1
          and submissions.status in ('submitted', 'included_in_turn')
        order by submissions.created_at asc
      `,
      [resolvingTurn.id]
    );
    const first = submissions.rows[0];

    if (!first?.player_id || !first.client_id || !first.username || !first.character_name) {
      throw createStatusError(409, "That turn is missing player input.");
    }

    const player: PlayerRow = {
      id: first.player_id,
      client_id: first.client_id,
      user_id: null,
      username: first.username,
      character_name: first.character_name,
      character_sheet: first.character_sheet ?? "",
      campaign_id: campaign.id,
      slot: first.slot,
      status: "active",
      last_seen_at: new Date()
    };

    const eventType: "adventure_begun" | "turn_resolved" =
      latestVisibleEvent.type === "adventure_begun"
        ? "adventure_begun"
        : "turn_resolved";

    return {
      campaign,
      currentAction: formatSoloTurn(player, first.content),
      currentPlayerAction: first.content,
      eventType,
      turn: resolvingTurn
    };
  });

  try {
    const reply = await askDungeonMaster(
      db,
      runtime,
      regenerationState.campaign,
      regenerationState.currentAction,
      dungeonMasterInstructions,
      true,
      regenerationState.turn.id,
      regenerationState.currentPlayerAction
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: regenerationState.campaign.id,
      turnId: regenerationState.turn.id,
      hermesMessageId: reply.id,
      reply: reply.content,
      eventType: regenerationState.eventType,
      pendingRollRequests: reply.rollRequests,
      inputTargets: reply.inputTargets,
      inputPolicy: reply.inputPolicy,
      setting: reply.setting,
      aiDebug: reply.debug
    });

    void runtime.runPostTurnContextJobs?.({
      campaignId: regenerationState.campaign.id,
      turnId: regenerationState.turn.id,
      currentAction: regenerationState.currentAction,
      dmResponse: reply.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: reply.rollRequests
    });
  } catch (error) {
    await markTurnFailed(db, regenerationState.turn.id, error);
    await logCampaignEvent(db, regenerationState.campaign.id, "turn_failed", {
      turnId: regenerationState.turn.id,
      error: error instanceof Error ? error.message : "DM provider call failed."
    });
    throw error;
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    regenerationState.campaign.id,
    regenerationState.campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? regenerationState.campaign);
}

export async function listCampaignDebugTracesForUser(
  db: Queryable,
  input: {
    campaignId: string;
    userId: string;
    traceId?: string;
    limit?: number;
  }
) {
  const result = await db.query<CampaignRow>(
    `
      select *
      from campaigns
      where id = $1 and status <> 'deleted'
      limit 1
    `,
    [input.campaignId]
  );
  const campaign = result.rows[0];

  if (!campaign) {
    throw createStatusError(404, "Campaign not found.");
  }

  await assertCampaignAccessForUser(db, campaign, input.userId);

  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const traceResult = await db.query<EventRow>(
    `
      select id, type, payload, created_at
      from campaign_events
      where campaign_id = $1
        and type = 'turn_debug_trace'
        and ($2::text is null or payload->>'traceId' = $2)
      order by created_at desc
      limit $3
    `,
    [input.campaignId, input.traceId ?? null, limit]
  );

  return traceResult.rows.map((event) => ({
    id: event.id,
    createdAt: toIso(event.created_at),
    ...eventPayload(event.payload)
  }));
}

function createStatusError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
