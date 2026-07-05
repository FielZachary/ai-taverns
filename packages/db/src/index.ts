import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import type { SessionId, UserId } from "@ai-dnd/domain";
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

function normalizeJoinCode(code: string | undefined) {
  return (code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
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

  return withTransaction(db, async (client) => {
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
        input.characterSheet ?? ""
      ]
    );
    const playerRow = requireRow(player.rows[0], "Failed to create player.");

    await ensureCollectingTurn(client, campaign.id);
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

    return mapCampaignSummaryRow({
      ...campaign,
      metadata: genreMetadata,
      display_character_name: playerRow.character_name,
      display_username: playerRow.username,
      join_code: joinCode ?? null
    });
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

      await ensureCollectingTurn(client, lockedCampaign.id);
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

      return begun.rows[0] ?? lockedCampaign;
    }

    return lockedCampaign;
  });

  return buildRoomSnapshot(db, campaign);
}

async function allTargetedPlayersSubmitted(
  db: Queryable,
  campaignId: string,
  turnId: string,
  inputTargets: string[]
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
  const targetedPlayers = activePlayers.filter((player) =>
    playerMatchesInputTargets(player, inputTargets)
  );

  if (targetedPlayers.length === 0) {
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

  return targetedPlayers.every((player) => submittedPlayerIds.has(player.id));
}

export async function submitRoomTurnForUser(
  db: pg.Pool,
  input: {
    roomId: string;
    sessionId: string;
    playerId: string;
    message: string;
    userId: string;
    rollRequestId?: string;
    rollResult?: DiceRollResult;
    clientMessageId?: string;
    rollSubmissions?: DiceRollSubmission[];
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

    if (
      !isRollSubmission &&
      inputPolicy === "only_targeted_players" &&
      (await allTargetedPlayersSubmitted(
        client,
        campaignRow.id,
        turn.id,
        inputTargets
      ))
    ) {
      await client.query(
        "update campaigns set metadata = metadata - 'inputTargets' - 'inputPolicy' where id = $1",
        [campaignRow.id]
      );
    }

    return campaignRow;
  });

  const updatedCampaign = await resolveRoomCampaign(
    db,
    campaign.id,
    campaign.hermes_session_id
  );

  return buildRoomSnapshot(db, updatedCampaign ?? campaign);
}

function createStatusError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
