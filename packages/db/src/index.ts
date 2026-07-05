import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import type { SessionId, UserId } from "@ai-dnd/domain";
import type { CampaignMode, CampaignSummary } from "@ai-dnd/contracts";

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
  client_id: string;
  user_id: string | null;
  username: string;
  character_name: string;
  character_sheet: string;
  slot: number | null;
  status: PlayerStatus;
};

type TurnRow = {
  id: string;
  campaign_id: string;
  status: TurnStatus;
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

function createStatusError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
