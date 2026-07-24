import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import type { SessionId, UserId } from "@ai-dnd/domain";
import {
  eldermereMetadataProfile,
  eldermereRegions,
  formatEldermereOpeningPromptContext,
  formatEldermereTurnPromptContext,
  openingSceneRequest,
  parseDmContract,
  isEldermerePreset,
  buildMemoryUpdaterPrompt,
  buildRouterPrompt,
  jobPrompt,
  renderContextChunks,
  validateCombatEvents,
  validateMainDmOutput,
  validateMemoryPatches,
  validateRouterOutput,
  type EldermereCampaignStart,
  type AiDebugInfo,
  type ContextCategory,
  type ContextChunk,
  type GameMessage,
  type DmContractResponse,
  type DmContractParseOptions,
  type InputPolicy,
  type ValidatedRouterOutput
} from "@ai-dnd/dm";
import type {
  CampaignMode,
  CampaignSummary,
  DmStreamEvent,
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission,
  MechanicsSeed,
  MechanicsState,
  RoomSnapshot
} from "@ai-dnd/contracts";
import {
  actorKeyForPlayer,
  applyAcceptedCast,
  assertMechanicsActionAllowed,
  mechanicsStateWithActor,
  projectMechanicsIntoCharacterSheet,
  resolveMechanicsState
} from "./mechanics.js";

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
  session_id: string;
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

type OpeningTerm = {
  term: string;
  plainMeaning: string;
};

type OpeningNpcSeed = {
  name: string;
  role: string;
  wants: string;
  visibleBehavior: string;
};

type EldermereOpeningPlan = {
  campaignTitle: string;
  region: {
    name: string;
    whyThisRegion: string;
    plainDescription: string;
  };
  startingLocation: {
    name: string;
    type: string;
    whyThisLocation: string;
    plainDescription: string;
  };
  openingPremise: {
    whyThePartyIsHere: string;
    immediateObjective: string;
    immediateComplication: string;
    firstSceneLocation: string;
    openingMood: string;
    campaignPromise: string;
  };
  playerFacingFacts: string[];
  allowedPlayerFacingTerms: OpeningTerm[];
  npcSeed: OpeningNpcSeed[];
  firstInteractableChoices: string[];
  sensoryPalette: Record<string, string[]>;
  dmPrivateContext: string[];
  forbiddenOpeningTerms: string[];
  narratorInstructions: string[];
  openingQualityChecks: string[];
};

type DungeonMasterProviderResponse = {
  id?: string;
  content: string;
  debug: AiDebugInfo;
};

type ResolutionMode = "needs_dice" | "resolved_without_dice";

type DungeonMasterReply = {
  id: string;
  content: string;
  debug: AiDebugInfo;
  rollRequests: DiceRollRequest[];
  inputTargets: string[];
  inputPolicy: InputPolicy;
  resolutionMode: ResolutionMode;
  setting?: CampaignSettingSummary | undefined;
};

type DmPromptContext = {
  instructions: string;
  message: string;
  sections: unknown[];
  budget: Record<string, unknown>;
};

const dungeonMasterContractInstructions = [
  "You are the AI Taverns DnD Dungeon Master.",
  "Return exactly one valid JSON object and no Markdown.",
  "Use public_narration for player-facing narration.",
  "Use roll_requests for player-facing dice the website must collect.",
  "Use mechanics_state_update for canonical game/mechanics state changes; the website owns persistence.",
  "Required top-level keys: public_narration, resolution_mode, roll_requests, next_input_needed, input_targets, input_policy, mechanics_state_update."
].join("\n");

export type DungeonMasterRuntime = {
  askProvider(input: {
    message: string;
    instructions: string;
    history?: GameMessage[];
    currentPlayerAction?: string;
    onPublicNarrationDelta?: (text: string) => void;
  }): Promise<DungeonMasterProviderResponse>;
  emitDmStreamEvent?(event: DmStreamEvent): void;
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
  const worldProfile = eventPayload(metadata.worldProfile);
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
  const profileWorldName =
    typeof worldProfile.worldName === "string"
      ? worldProfile.worldName.trim()
      : "";
  const profileStartingLocation = eventPayload(worldProfile.startingLocation);
  const profileStartingLocationName =
    typeof profileStartingLocation.name === "string"
      ? profileStartingLocation.name.trim()
      : "";
  const customWorldName =
    typeof genre.customWorldName === "string" ? genre.customWorldName.trim() : "";

  return (
    displayLocation ||
    startingLocation ||
    worldName ||
    profileStartingLocationName ||
    profileWorldName ||
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

function campaignWorldProfileMetadata(input: {
  campaignGenrePresetId?: string | undefined;
  eldermereStart?: EldermereCampaignStart | undefined;
}) {
  return isEldermerePreset(input.campaignGenrePresetId)
    ? { worldProfile: eldermereMetadataProfile(input.eldermereStart) }
    : {};
}

function randomEldermereCampaignStart(): EldermereCampaignStart {
  const region = eldermereRegions[randomInt(0, eldermereRegions.length)];

  if (!region) {
    throw new Error("Eldermere has no configured regions.");
  }

  const settlement =
    region.settlements[randomInt(0, region.settlements.length)];

  if (!settlement) {
    throw new Error(`Eldermere region ${region.name} has no settlements.`);
  }

  return { region, settlement };
}

function eldermereCampaignStartFromMetadata(
  campaign: Pick<CampaignRow, "metadata">
): EldermereCampaignStart | undefined {
  const metadata = eventPayload(campaign.metadata);
  const worldProfile = eventPayload(metadata.worldProfile);
  const selectedRegion = eventPayload(worldProfile.selectedRegion);
  const startingLocation = eventPayload(worldProfile.startingLocation);
  const regionName =
    typeof selectedRegion.name === "string" ? selectedRegion.name.trim() : "";
  const settlementName =
    typeof startingLocation.name === "string"
      ? startingLocation.name.trim()
      : "";
  const region = eldermereRegions.find((candidate) => candidate.name === regionName);
  const settlement = region?.settlements.find(
    (candidate) => candidate.name === settlementName
  );

  return region && settlement ? { region, settlement } : undefined;
}

function hasEldermereWorldProfile(campaign: Pick<CampaignRow, "metadata">) {
  const metadata = eventPayload(campaign.metadata);
  const worldProfile = eventPayload(metadata.worldProfile);
  const genre = eventPayload(metadata.genre);
  const worldName =
    typeof worldProfile.worldName === "string"
      ? worldProfile.worldName.trim()
      : "";
  const source =
    typeof worldProfile.source === "string" ? worldProfile.source.trim() : "";
  const presetId =
    typeof genre.presetId === "string" ? genre.presetId.trim() : "";

  return (
    isEldermerePreset(presetId) ||
    (worldName === "Eldermere" && source === "flagship_world")
  );
}

function withEldermereTurnContext(
  instructions: string,
  campaign: Pick<CampaignRow, "metadata">
) {
  if (!hasEldermereWorldProfile(campaign)) {
    return instructions;
  }

  return [
    instructions,
    "",
    formatEldermereTurnPromptContext(
      eldermereCampaignStartFromMetadata(campaign)
    )
  ].join("\n");
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
    sessionId: campaign.session_id,
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
    "insert into campaign_events (campaign_id, type, payload, created_at) values ($1, $2, $3::jsonb, clock_timestamp()) returning id",
    [campaignId, type, JSON.stringify(payload)]
  );

  return result.rows[0]?.id;
}

async function writeMechanicsStateForLockedCampaign(
  db: Queryable,
  campaignId: string,
  mechanicsState: MechanicsState
) {
  await db.query(
    `
      update campaigns
      set metadata = jsonb_set(metadata, '{mechanicsState}', $2::jsonb, true),
          updated_at = now()
      where id = $1
    `,
    [campaignId, JSON.stringify(mechanicsState)]
  );
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function stringListField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function applyMechanicsStateUpdate(
  state: MechanicsState,
  update: Record<string, unknown> | undefined,
  updatedAt?: string
): MechanicsState {
  if (!update || Object.keys(update).length === 0) {
    return state;
  }

  const rawActors = isRecord(update.actors) ? update.actors : update;
  const nextActors = { ...state.actors };
  let changed = false;

  for (const [actorKey, rawActor] of Object.entries(rawActors)) {
    if (actorKey === "combat" || actorKey === "updatedAt" || !isRecord(rawActor)) {
      continue;
    }

    const existing = nextActors[actorKey];
    const characterName =
      typeof rawActor.characterName === "string" && rawActor.characterName.trim()
        ? rawActor.characterName
        : existing?.characterName;

    if (!existing && !characterName) {
      continue;
    }

    nextActors[actorKey] = {
      ...(existing ?? { characterName: characterName ?? actorKey }),
      ...(characterName ? { characterName } : {}),
      ...(numberField(rawActor, "currentHp") !== undefined
        ? { currentHp: numberField(rawActor, "currentHp") }
        : {}),
      ...(numberField(rawActor, "maxHp") !== undefined
        ? { maxHp: numberField(rawActor, "maxHp") }
        : {}),
      ...(stringListField(rawActor, "conditions") !== undefined
        ? { conditions: stringListField(rawActor, "conditions") }
        : {}),
      ...(rawActor.concentration === null || isRecord(rawActor.concentration)
        ? { concentration: rawActor.concentration as MechanicsState["actors"][string]["concentration"] }
        : {})
    };
    changed = true;
  }

  const rawCombat = isRecord(update.combat) ? update.combat : undefined;
  const nextCombat = rawCombat
    ? {
        ...state.combat,
        ...(typeof rawCombat.active === "boolean" ? { active: rawCombat.active } : {}),
        ...(numberField(rawCombat, "round") !== undefined
          ? { round: numberField(rawCombat, "round") ?? state.combat.round }
          : {}),
        ...(typeof rawCombat.turnOwner === "string" || rawCombat.turnOwner === null
          ? { turnOwner: rawCombat.turnOwner }
          : {}),
        ...(stringListField(rawCombat, "initiativeOrder") !== undefined
          ? { initiativeOrder: stringListField(rawCombat, "initiativeOrder") ?? [] }
          : {})
      }
    : state.combat;

  changed ||= nextCombat !== state.combat;

  return changed
    ? {
        ...state,
        updatedAt,
        combat: nextCombat,
        actors: nextActors
      }
    : state;
}

async function addOrReplacePlayerMechanicsActor(
  db: Queryable,
  input: {
    campaign: CampaignRow;
    playerId: string;
    characterName: string;
    characterSheet?: string | undefined;
    seed?: MechanicsSeed | undefined;
  }
) {
  const currentState = resolveMechanicsState(input.campaign, []);
  const nextState = mechanicsStateWithActor({
    existing: currentState,
    playerId: input.playerId,
    characterName: input.characterName,
    characterSheet: input.characterSheet,
    seed: input.seed,
    updatedAt: nowIso()
  });

  await writeMechanicsStateForLockedCampaign(db, input.campaign.id, nextState);
  input.campaign.metadata = {
    ...eventPayload(input.campaign.metadata),
    mechanicsState: nextState
  };

  return nextState;
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

async function seedEldermerePromptContextRecords(
  db: Queryable,
  campaignId: string,
  sourceEventIds: string[] = []
) {
  const style = {
    genre: "anchored high fantasy adventure",
    tone: [
      "wondrous",
      "perilous",
      "morally clear but not simple",
      "wry when the moment allows it"
    ],
    pacing: "deliberate exploration punctuated by sharp, sudden danger",
    themes: [
      "inheritance and debt",
      "the true cost of power",
      "faith practiced under divine silence",
      "what a generation chooses to build on other people's ruins"
    ],
    mysteryStyle:
      "Clues are concrete and diegetic; answers unfold gradually across sessions rather than in one reveal.",
    violenceLevel: "heroic-consequential",
    narrationDensity: "rich",
    contentBoundaries: [
      "no sexual content involving minors",
      "fade-to-black on torture and sexual content by default",
      "avoid real-world political allegory",
      "body horror and cosmic dread are permitted but should be earned, not gratuitous"
    ]
  };
  const currentScene = {
    location: "",
    sceneSummary:
      "The campaign has been initialized in Eldermere, but the opening scene has not chosen a concrete starting location yet.",
    partyPosture: [],
    presentCharacters: [],
    offscreenRelevantCharacters: [],
    activeThreats: [],
    importantInteractables: [],
    exitsOrPaths: [],
    constraints: [],
    pendingRolls: [],
    unresolvedQuestions: [],
    changedThisTurn: ["Eldermere world profile initialized"]
  };
  const memories = [
    {
      title: "Eldermere",
      summary:
        "Eldermere is AI Taverns' flagship anchored-high-fantasy world, built on the bones of the fallen Second Dominion after the Graywake drove the gods into silence.",
      entities: ["Eldermere", "Second Dominion", "Graywake"],
      importance: 5
    },
    {
      title: "Wellglass",
      summary:
        "The strongest magic in Eldermere requires Wellglass: crystallized, refined godsblood scavenged from Second Dominion ruins. It is finite, costly, and consumed when used.",
      entities: ["Wellglass", "Second Dominion"],
      importance: 5
    },
    {
      title: "Eldermere Divine Forces",
      summary:
        "Eldermere has five Divine Forces: the Hearth-Warden, the Iron Judge, the Deep Currents, the Verdant Choir, and the Ashen Scholar. They speak through omens, dreams, and masks rather than plain reliable instruction.",
      entities: [
        "Hearth-Warden",
        "Iron Judge",
        "Deep Currents",
        "Verdant Choir",
        "Ashen Scholar"
      ],
      importance: 4
    }
  ];

  const chunks = [
    {
      contextKey: "world:eldermere-style",
      category: "relevant_world_context",
      title: "Eldermere Style And Current Scene",
      visibility: "dm_only",
      priority: 10,
      bodyMarkdown: [
        "# Eldermere Style And Current Scene",
        "",
        "## Style",
        JSON.stringify(style, null, 2),
        "",
        "## Current Scene",
        JSON.stringify(currentScene, null, 2)
      ].join("\n")
    },
    ...memories.map((memory) => ({
      contextKey: `world:${memory.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      category: "relevant_world_context",
      title: memory.title,
      visibility: "dm_only",
      priority: memory.importance,
      bodyMarkdown: [
        `# ${memory.title}`,
        "",
        memory.summary,
        "",
        `Entities: ${memory.entities.join(", ")}`,
        sourceEventIds.length > 0
          ? `Source event IDs: ${sourceEventIds.join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    }))
  ];

  for (const chunk of chunks) {
    await bestEffortRuntimeInsert(
      db,
      `
        insert into campaign_context_chunks (
          campaign_id,
          context_key,
          category,
          title,
          visibility,
          priority,
          body_markdown
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (campaign_id, context_key) do update
        set category = excluded.category,
            title = excluded.title,
            visibility = excluded.visibility,
            priority = excluded.priority,
            body_markdown = excluded.body_markdown,
            archived_at = null,
            updated_at = now()
      `,
      [
        campaignId,
        chunk.contextKey,
        chunk.category,
        chunk.title,
        chunk.visibility,
        chunk.priority,
        chunk.bodyMarkdown
      ]
    );
  }
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
    mechanicsSeed?: MechanicsSeed | undefined;
    userId: string;
    runtime?: DungeonMasterRuntime | undefined;
  }
): Promise<CampaignSummary> {
  const sessionId = `ai-dnd-${randomUUID()}`;
  const eldermereStart = isEldermerePreset(input.campaignGenrePresetId)
    ? randomEldermereCampaignStart()
    : undefined;
  const genreMetadata = {
    genre: {
      kind: input.campaignGenreKind ?? "preset",
      presetId: input.campaignGenrePresetId ?? null,
      label: input.campaignGenre ?? null,
      promptBrief: input.campaignGenrePromptBrief ?? null,
      customWorldName: input.customWorldName ?? null,
      customWorldDescription: input.customWorldDescription ?? null
    },
    ...campaignWorldProfileMetadata({
      campaignGenrePresetId: input.campaignGenrePresetId,
      eldermereStart
    })
  };

  const createdState = await withTransaction(db, async (client) => {
    const inserted = await client.query<CampaignRow>(
      `
        insert into campaigns (
          session_id,
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
    const mechanicsState = mechanicsStateWithActor({
      playerId: playerRow.id,
      characterName: playerRow.character_name,
      characterSheet: playerRow.character_sheet,
      seed: input.mechanicsSeed,
      updatedAt: nowIso()
    });

    await writeMechanicsStateForLockedCampaign(
      client,
      campaign.id,
      mechanicsState
    );
    const turn = await ensureCollectingTurn(client, campaign.id);

    const createdEventId = await logCampaignEvent(client, campaign.id, "campaign_created", {
      sessionId: sessionId,
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

    if (hasEldermereWorldProfile(campaign)) {
      await seedEldermerePromptContextRecords(
        client,
        campaign.id,
        createdEventId ? [createdEventId] : []
      );
    }

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
      mechanicsState,
      player: playerRow,
      turn: openingTurn,
      summary: mapCampaignSummaryRow({
      ...campaign,
      metadata: { ...genreMetadata, mechanicsState },
      display_character_name: playerRow.character_name,
      display_username: playerRow.username,
      join_code: joinCode ?? null
      })
    };
  });

  if (input.mode !== "single_player" || !input.runtime || !createdState.turn) {
    return createdState.summary;
  }

  const runtime = input.runtime;
  const openingTurn = createdState.turn;
  const openingRequest = formatOpeningSceneRequest({
    campaign: createdState.campaign,
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
    const opening = hasEldermereWorldProfile(createdState.campaign)
      ? await (async () => {
          const plan = await askEldermereOpeningPlanner(
            db,
            runtime,
            createdState.campaign,
            openingRequest,
            openingTurn.id
          );
          await persistEldermereOpeningPlan(db, createdState.campaign.id, plan);

          return askEldermereOpeningNarrator(
            db,
            runtime,
            createdState.campaign,
            openingRequest,
            openingSceneInstructions("single_player"),
            plan,
            openingTurn.id,
            { allowResolvedCombatWithoutRolls: true }
          );
        })()
      : await askDungeonMaster(
          db,
          runtime,
          createdState.campaign,
          openingRequest,
          openingSceneInstructions("single_player"),
          true,
          openingTurn.id,
          undefined,
          { allowResolvedCombatWithoutRolls: true },
          { buildPromptContext: false }
        );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: createdState.campaign.id,
      turnId: openingTurn.id,
      modelMessageId: opening.id,
      reply: opening.content,
      eventType: "adventure_begun",
      pendingRollRequests: opening.rollRequests,
      inputTargets: opening.inputTargets,
      inputPolicy: opening.inputPolicy,
      resolutionMode: opening.resolutionMode,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    await db.query("update campaigns set has_begun = true where id = $1", [
      createdState.campaign.id
    ]);

    void runtime.runPostTurnContextJobs?.({
      campaignId: createdState.campaign.id,
      turnId: openingTurn.id,
      currentAction: openingRequest,
      dmResponse: opening.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: opening.rollRequests
    });

    return getCampaignSummaryForUser(db, {
      campaignId: createdState.campaign.id,
      userId: input.userId
    });
  } catch (error) {
    await markTurnFailed(db, openingTurn.id, error);
    throw error;
  }
}

export async function createCampaignForSession(
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
          session_id,
          title,
          owner_client_id,
          owner_user_id,
          mode
        )
        values ($1, $2, $3, $4, $5)
        on conflict (session_id) do update
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
      sessionId: input.sessionId
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
    mechanicsSeed?: MechanicsSeed | undefined;
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
      await addOrReplacePlayerMechanicsActor(client, {
        campaign: campaignRow,
        playerId: userPlayer.id,
        characterName,
        characterSheet,
        seed: input.mechanicsSeed
      });
      return campaignRow;
    }

    const insertedPlayer = await client.query<PlayerRow>(
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
    const joinedPlayer =
      insertedPlayer.rows[0] ??
      (await client.query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1 and client_id = $2
          limit 1
        `,
        [campaignRow.id, clientId]
      )).rows[0];

    if (joinedPlayer) {
      await addOrReplacePlayerMechanicsActor(client, {
        campaign: campaignRow,
        playerId: joinedPlayer.id,
        characterName,
        characterSheet,
        seed: input.mechanicsSeed
      });
    }
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

function inferredRollRequestPlayer(label: string) {
  const initiativeMatch = label.match(/^initiative\s*\(([^)]+)\)$/i);
  const initiativeTarget = initiativeMatch?.[1]?.trim();

  return initiativeTarget || "";
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
      typeof candidate.player === "string" && candidate.player.trim()
        ? candidate.player.trim()
        : inferredRollRequestPlayer(label) || undefined,
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

  const playerNames = [
    actorKeyForPlayer(player.id),
    `player:${player.client_id}`,
    player.client_id,
    player.username,
    player.character_name
  ]
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

  const playerNames = [
    actorKeyForPlayer(player.id),
    `player:${player.client_id}`,
    player.client_id,
    player.username,
    player.character_name
  ]
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

function metadataWithPendingRollRequests(
  metadata: unknown,
  requests: DiceRollRequest[]
) {
  const currentRequest = requests[0] ?? null;

  if (requests.length === 0) {
    const nextMetadata = { ...eventPayload(metadata) };
    delete nextMetadata.pendingRollRequest;
    delete nextMetadata.pendingRollRequests;

    return nextMetadata;
  }

  return {
    ...eventPayload(metadata),
    pendingRollRequest: currentRequest,
    pendingRollRequests: requests
  };
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
        where (id = $1 or session_id = $2)
          and status <> 'deleted'
        order by created_at desc
        limit 1
      `
    : `
        select *
        from campaigns
        where (session_id = $1 or session_id = $2)
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
  submittedPlayerIds: Set<string>,
  mechanicsState?: MechanicsState
): RoomSnapshot["players"][number] {
  const actor = mechanicsState?.actors[actorKeyForPlayer(player.id)];

  return {
    id: player.client_id,
    actorKey: actorKeyForPlayer(player.id),
    slot: player.slot ?? 0,
    username: player.username,
    characterName: player.character_name,
    characterSheet: projectMechanicsIntoCharacterSheet(
      player.character_sheet,
      actor
    ),
    status: submittedPlayerIds.has(player.id) ? "submitted" : "waiting",
    lastSeenAt: toIso(player.last_seen_at)
  };
}

function roomCombatSnapshot(
  mechanicsState: MechanicsState,
  players: PlayerRow[]
): RoomSnapshot["combat"] {
  const turnOwner = mechanicsState.combat.turnOwner;
  const turnOwnerPlayer = turnOwner
    ? players.find(
        (player) =>
          actorKeyForPlayer(player.id) === turnOwner ||
          `player:${player.client_id}` === turnOwner ||
          player.client_id === turnOwner
      )
    : undefined;
  const turnOwnerActor = turnOwner ? mechanicsState.actors[turnOwner] : undefined;

  return {
    active: mechanicsState.combat.active,
    round: mechanicsState.combat.round,
    turnOwner,
    turnOwnerPlayerId: turnOwnerPlayer?.client_id ?? null,
    turnOwnerCharacterName:
      turnOwnerPlayer?.character_name || turnOwnerActor?.characterName || null,
    initiativeOrder: mechanicsState.combat.initiativeOrder
  };
}

function eventAiDebug(payload: Record<string, unknown>, role: "player" | "dm") {
  if (role !== "dm") {
    return undefined;
  }

  const debug = payload.aiDebug;

  if (
    !debug ||
    typeof debug !== "object" ||
    !Array.isArray((debug as AiDebugInfo).requestMessages) ||
    typeof (debug as AiDebugInfo).rawResponse !== "string"
  ) {
    return undefined;
  }

  return debug as AiDebugInfo;
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
  const mechanicsState = resolveMechanicsState(campaign, playersResult.rows);
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
        order by created_at desc,
          case type
            when 'dm_answer' then 0
            when 'turn_resolved' then 1
            when 'adventure_begun' then 1
            when 'dm_question' then 2
            when 'turn_submitted' then 3
            else 4
          end asc,
          id desc
        limit 100
      ) recent_events
      order by created_at asc,
        case type
          when 'turn_submitted' then 0
          when 'dm_question' then 0
          when 'turn_resolved' then 1
          when 'adventure_begun' then 1
          when 'dm_answer' then 1
          else 2
        end asc,
        id asc
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

      const role = payload.role === "player" ? "player" : "dm";
      const debug = eventAiDebug(payload, role);

      return {
        id: String(payload.messageId || event.id),
        role,
        kind: roomEventMessageKind(event.type),
        content,
        createdAt: toIso(event.created_at),
        ...(typeof payload.username === "string"
          ? { playerName: payload.username }
          : {}),
        ...(typeof payload.characterName === "string"
          ? { characterName: payload.characterName }
          : {}),
        ...(debug ? { debug } : {})
      };
    })
    .filter((message): message is RoomSnapshot["messages"][number] =>
      Boolean(message)
    );
  const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);

  return {
    roomId: campaign.id,
    mode: campaign.mode,
    sessionId: campaign.session_id,
    players: playersResult.rows.map((player) =>
      rowToRoomPlayer(player, submittedPlayerIds, mechanicsState)
    ),
    messages,
    isResolving: currentTurn?.status === "resolving",
    hasBegun: campaign.has_begun,
    pendingRollRequest: pendingRollRequests[0] ?? null,
    pendingRollRequests,
    inputTargets: inputTargetsFromCampaign(campaign),
    inputPolicy: inputPolicyFromCampaign(campaign),
    combat: roomCombatSnapshot(mechanicsState, playersResult.rows),
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

function providerDebugSummary(
  debug: AiDebugInfo | undefined,
  options: { includeRawResponse?: boolean } = {}
) {
  if (!debug) {
    return undefined;
  }

  return {
    providerResponseId: debug.providerResponseId,
    model: debug.model,
    temperature: debug.temperature,
    combatState: debug.combatState,
    requestMessageCount: debug.requestMessages.length,
    requestMessages: debug.requestMessages.map((message, index) => ({
      index,
      role: message.role,
      contentLength: message.content.length,
      contentPreview: previewText(message.content)
    })),
    rawResponseLength: debug.rawResponse.length,
    rawResponsePreview: previewText(debug.rawResponse),
    ...(options.includeRawResponse ? { rawResponse: debug.rawResponse } : {}),
    providerTimings: debug.providerTimings
  };
}

function providerDebugFromError(error: unknown) {
  if (
    error instanceof Error &&
    "debug" in error &&
    typeof error.debug === "object" &&
    error.debug !== null
  ) {
    return error.debug as AiDebugInfo;
  }

  return undefined;
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

  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_turn_traces (
        campaign_id,
        trace_id,
        turn_id,
        phase,
        elapsed_ms,
        payload
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      input.phase,
      input.elapsedMs ?? null,
      JSON.stringify(tracePayload)
    ]
  );
}

function isMissingRuntimeTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "42P01" ||
      (error as { code?: unknown }).code === "42703")
  );
}

function isTransactionClient(db: Queryable): db is TransactionClient {
  return (
    "release" in db &&
    typeof (db as { release?: unknown }).release === "function"
  );
}

async function bestEffortRuntimeInsert(
  db: Queryable,
  sql: string,
  values: unknown[]
) {
  if (isTransactionClient(db)) {
    const savepointName = `runtime_insert_${randomUUID().replace(/-/g, "_")}`;

    await db.query(`savepoint ${savepointName}`);

    try {
      await db.query(sql, values);
      await db.query(`release savepoint ${savepointName}`);
    } catch (error) {
      await db.query(`rollback to savepoint ${savepointName}`);
      await db.query(`release savepoint ${savepointName}`);

      if (!isMissingRuntimeTableError(error)) {
        throw error;
      }
    }

    return;
  }

  try {
    await db.query(sql, values);
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }
  }
}

async function logDmTurnTrace(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    phase: string;
    payload: Record<string, unknown>;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_turn_traces (
        campaign_id,
        trace_id,
        turn_id,
        phase,
        payload
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      input.phase,
      JSON.stringify(input.payload)
    ]
  );
}

async function logDmContextSnapshot(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    router: ValidatedRouterOutput;
    chunks: ContextChunk[];
    omitted: unknown[];
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_context_snapshots (
        campaign_id,
        trace_id,
        turn_id,
        selected_job,
        requested_context_keys,
        included_context_keys,
        omitted_context_keys,
        payload
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      input.router.jobNeeded,
      JSON.stringify(input.router.contextKeys),
      JSON.stringify(input.chunks.map((chunk) => chunk.id)),
      JSON.stringify(input.omitted),
      JSON.stringify({
        fallbackUsed: input.router.fallbackUsed,
        errors: input.router.errors
      })
    ]
  );
}

async function logDmModelCall(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    phase: "router" | "main" | "memory_updater";
    providerData: DungeonMasterProviderResponse;
    durationMs: number;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_model_calls (
        campaign_id,
        trace_id,
        turn_id,
        phase,
        provider,
        model,
        raw_response,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      input.phase,
      "deepseek",
      input.providerData.debug.model ?? null,
      input.providerData.content,
      JSON.stringify({
        durationMs: input.durationMs,
        providerResponseId: input.providerData.debug.providerResponseId,
        timings: input.providerData.debug.providerTimings
      })
    ]
  );
}

async function logDmOutputReport(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    payload: Record<string, unknown>;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_output_reports (
        campaign_id,
        trace_id,
        turn_id,
        payload
      )
      values ($1, $2, $3, $4::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      JSON.stringify(input.payload)
    ]
  );
}

async function logDmMemoryPatchLog(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    payload: Record<string, unknown>;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into dm_memory_patch_logs (
        campaign_id,
        trace_id,
        turn_id,
        payload
      )
      values ($1, $2, $3, $4::jsonb)
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      JSON.stringify(input.payload)
    ]
  );
}

function contextKeyEntries(router: ValidatedRouterOutput) {
  return Object.entries(router.contextKeys).flatMap(([category, keys]) =>
    keys.map((key) => ({
      category: category as ContextCategory,
      key
    }))
  );
}

function mapContextChunkRow(row: Record<string, unknown>): ContextChunk {
  const category = String(row.category ?? row.context_type) as ContextCategory;
  const id = String(row.context_key ?? row.key ?? row.id);
  const title = String(row.title ?? id);
  const visibility =
    row.visibility === "player_safe" || row.visibility === "dm_only"
      ? row.visibility
      : "dm_only";
  const priority = typeof row.priority === "number" ? row.priority : 0;
  const bodyMarkdown = String(row.body_markdown ?? row.bodyMarkdown ?? "");
  const updatedAt = row.updated_at ? toIso(row.updated_at as Date | string) : undefined;

  return {
    id,
    category,
    title,
    visibility,
    priority,
    bodyMarkdown,
    ...(updatedAt ? { updatedAt } : {})
  };
}

async function retrieveSelectedContextChunks(
  db: Queryable,
  campaignId: string,
  router: ValidatedRouterOutput,
  maxChars = 24000
) {
  const requested = contextKeyEntries(router);
  const requestedKeys = requested.map((entry) => entry.key);

  if (requestedKeys.length === 0) {
    return { chunks: [] as ContextChunk[], omitted: [] as unknown[] };
  }

  let rows: Record<string, unknown>[] = [];

  try {
    const result = await db.query<Record<string, unknown>>(
      `
        select
          context_key,
          category,
          title,
          visibility,
          priority,
          body_markdown,
          updated_at
        from campaign_context_chunks
        where campaign_id = $1
          and context_key = any($2::text[])
          and category = any($3::text[])
          and archived_at is null
        order by priority desc, updated_at desc
      `,
      [
        campaignId,
        requestedKeys,
        [...new Set(requested.map((entry) => entry.category))]
      ]
    );
    rows = result.rows;
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }
  }

  const seen = new Set<string>();
  const found = new Map(rows.map((row) => [String(row.context_key), row]));
  const chunks: ContextChunk[] = [];
  const omitted: unknown[] = [];
  let usedChars = 0;

  for (const request of requested) {
    if (seen.has(request.key)) {
      omitted.push({ ...request, reason: "duplicate" });
      continue;
    }

    seen.add(request.key);
    const row = found.get(request.key);

    if (!row) {
      omitted.push({ ...request, reason: "missing" });
      continue;
    }

    const chunk = mapContextChunkRow(row);
    const nextChars = usedChars + chunk.bodyMarkdown.length;

    if (nextChars > maxChars) {
      omitted.push({ ...request, reason: "budget_exceeded" });
      continue;
    }

    usedChars = nextChars;
    chunks.push(chunk);
  }

  return { chunks, omitted };
}

function mechanicsActorsForValidation(campaign: Pick<CampaignRow, "metadata">) {
  return Object.fromEntries(
    Object.entries(resolveMechanicsState(campaign, []).actors).map(([key, actor]) => {
      const state: {
        currentHp?: number;
        maxHp?: number;
        conditions?: string[];
      } = {};

      if (actor.currentHp !== undefined) {
        state.currentHp = actor.currentHp;
      }

      if (actor.maxHp !== undefined) {
        state.maxHp = actor.maxHp;
      }

      if (actor.conditions !== undefined) {
        state.conditions = actor.conditions;
      }

      return [key, state];
    })
  );
}

async function buildModularDmPromptContext(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: Pick<CampaignRow, "id" | "metadata">,
  input: {
    traceId: string;
    turnId?: string | undefined;
    currentAction: string;
    baseInstructions: string;
    history: GameMessage[];
  }
): Promise<DmPromptContext> {
  const routerStartedAt = Date.now();
  const routerData = await runtime.askProvider({
    instructions: buildRouterPrompt(),
    message: input.currentAction,
    history: input.history
  });
  const router = validateRouterOutput(routerData.content);

  await logDmModelCall(db, {
    campaignId: campaign.id,
    traceId: input.traceId,
    turnId: input.turnId,
    phase: "router",
    providerData: routerData,
    durationMs: Date.now() - routerStartedAt
  });

  const context = await retrieveSelectedContextChunks(db, campaign.id, router);

  await logDmContextSnapshot(db, {
    campaignId: campaign.id,
    traceId: input.traceId,
    turnId: input.turnId,
    router,
    chunks: context.chunks,
    omitted: context.omitted
  });

  return {
    instructions: [
      input.baseInstructions,
      "",
      jobPrompt(router.jobNeeded)
    ].join("\n"),
    message: [
      "Selected context chunks:",
      renderContextChunks(context.chunks),
      "",
      "Current turn input:",
      input.currentAction
    ].join("\n"),
    sections: [
      {
        kind: "router",
        jobNeeded: router.jobNeeded,
        contextKeys: router.contextKeys,
        fallbackUsed: router.fallbackUsed,
        errors: router.errors
      },
      {
        kind: "context_snapshot",
        includedContextKeys: context.chunks.map((chunk) => chunk.id),
        omittedContextKeys: context.omitted
      }
    ],
    budget: {
      maxContextChars: 24000,
      includedContextChars: context.chunks.reduce(
        (total, chunk) => total + chunk.bodyMarkdown.length,
        0
      )
    }
  };
}

async function listCampaignContextIds(db: Queryable, campaignId: string) {
  try {
    const result = await db.query<{ context_key: string }>(
      `
        select context_key
        from campaign_context_chunks
        where campaign_id = $1 and archived_at is null
      `,
      [campaignId]
    );

    return new Set(result.rows.map((row) => row.context_key));
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return new Set<string>();
  }
}

async function applyAcceptedMemoryPatch(
  db: Queryable,
  campaignId: string,
  patch: Record<string, unknown>
) {
  const operation = patch.operation;
  const contextId = String(patch.context_id ?? patch.contextId ?? "");
  const markdown = String(patch.markdown ?? "");

  if (operation === "append") {
    await bestEffortRuntimeInsert(
      db,
      `
        update campaign_context_chunks
        set body_markdown = concat_ws(E'\n', body_markdown, $3),
          updated_at = now()
        where campaign_id = $1 and context_key = $2
      `,
      [campaignId, contextId, markdown]
    );
    return;
  }

  if (operation === "replace_section") {
    await bestEffortRuntimeInsert(
      db,
      `
        update campaign_context_chunks
        set body_markdown = $3,
          updated_at = now()
        where campaign_id = $1 and context_key = $2
      `,
      [campaignId, contextId, markdown]
    );
    return;
  }

  if (operation === "archive_chunk") {
    await bestEffortRuntimeInsert(
      db,
      `
        update campaign_context_chunks
        set archived_at = now(),
          updated_at = now()
        where campaign_id = $1 and context_key = $2
      `,
      [campaignId, contextId]
    );
    return;
  }

  if (operation === "create_chunk") {
    await bestEffortRuntimeInsert(
      db,
      `
        insert into campaign_context_chunks (
          campaign_id,
          context_key,
          category,
          title,
          visibility,
          priority,
          body_markdown
        )
        values ($1, $2, $3, $4, $5, 0, $6)
      `,
      [
        campaignId,
        contextId,
        String(patch.context_type ?? patch.contextType),
        String(patch.title ?? contextId),
        String(patch.visibility ?? "dm_only"),
        markdown
      ]
    );
  }
}

async function applyAcceptedMemoryPatches(
  db: Queryable,
  campaignId: string,
  patches: Record<string, unknown>[]
) {
  for (const patch of patches) {
    await applyAcceptedMemoryPatch(db, campaignId, patch);
  }
}

export async function runModularPostTurnContextJobs(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    turnId: string;
    currentAction: string;
    dmResponse: string;
    rollRequests?: DiceRollRequest[] | undefined;
  }
) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const history = await getCampaignEventMessages(db, input.campaignId, 8);
  const message = [
    "Current turn input:",
    input.currentAction,
    "",
    "Accepted public narration:",
    input.dmResponse,
    "",
    "Roll requests:",
    JSON.stringify(input.rollRequests ?? [], null, 2),
    "",
    "Recent messages:",
    JSON.stringify(history, null, 2)
  ].join("\n");

  try {
    await logDmTurnTrace(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      phase: "memory_updater_started",
      payload: {
        historyCount: history.length,
        message: textStats(message)
      }
    });

    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      instructions: buildMemoryUpdaterPrompt(),
      message,
      history: []
    });

    await logDmModelCall(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      phase: "memory_updater",
      providerData,
      durationMs: Date.now() - providerStartedAt
    });

    const parsed = parseJsonRecord(providerData.content);
    const proposedPatches = [
      ...(Array.isArray(parsed?.patches) ? parsed.patches : []),
      ...(Array.isArray(parsed?.new_context_chunks)
        ? parsed.new_context_chunks.map((chunk) =>
            eventPayload({
              ...(eventPayload(chunk)),
              operation: "create_chunk"
            })
          )
        : []),
      ...(Array.isArray(parsed?.remove_context_chunks)
        ? parsed.remove_context_chunks.map((chunk) => ({
            operation: "archive_chunk",
            context_id: typeof chunk === "string"
              ? chunk
              : eventPayload(chunk).context_id
          }))
        : [])
    ];
    const existingContextIds = await listCampaignContextIds(db, input.campaignId);
    const validation = validateMemoryPatches(
      proposedPatches,
      existingContextIds
    );

    await applyAcceptedMemoryPatches(
      db,
      input.campaignId,
      validation.accepted
    );

    await logDmMemoryPatchLog(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "memory_updater",
        proposedPatches,
        acceptedPatches: validation.accepted,
        discardedPatches: validation.discarded,
        durationMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    await logDmMemoryPatchLog(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "memory_updater",
        failed: true,
        error: errorSummary(error),
        durationMs: Date.now() - startedAt
      }
    });
  }
}

function formatCanonicalCharacterContext(
  players: PlayerRow[],
  mechanicsState: MechanicsState
) {
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
        projectMechanicsIntoCharacterSheet(
          player.character_sheet,
          mechanicsState.actors[actorKeyForPlayer(player.id)]
        )
      ].join("\n")
    )
  ].join("\n\n");
}

function formatMechanicsPromptContext(mechanicsState: MechanicsState) {
  return [
    "Authoritative mechanics state:",
    "If mechanicsState conflicts with transcript history, generated character-sheet text, or model memory, mechanicsState wins.",
    JSON.stringify(mechanicsState)
  ].join("\n");
}

function normalizeCombatTurnOwnerForInput(
  state: MechanicsState,
  input: {
    mode: CampaignMode;
    nextInputNeeded: "player_actions" | "dice_results";
    inputPolicy: InputPolicy;
  }
): MechanicsState {
  if (!state.combat.active || input.nextInputNeeded !== "player_actions") {
    return state;
  }

  if (
    input.mode === "multiplayer" &&
    input.inputPolicy === "all_players" &&
    state.combat.turnOwner?.startsWith("player:")
  ) {
    return {
      ...state,
      combat: {
        ...state.combat,
        turnOwner: null
      }
    };
  }

  if (input.mode === "single_player" && state.combat.turnOwner === null) {
    const livingPlayerActorKeys = Object.entries(state.actors)
      .filter(
        ([actorKey, actor]) =>
          actorKey.startsWith("player:") &&
          (actor.currentHp === undefined || actor.currentHp > 0)
      )
      .map(([actorKey]) => actorKey);

    if (livingPlayerActorKeys.length === 1) {
      return {
        ...state,
        combat: {
          ...state.combat,
          turnOwner: livingPlayerActorKeys[0] ?? null
        }
      };
    }
  }

  return state;
}

function formatSoloTurn(
  campaign: CampaignRow,
  player: PlayerRow,
  content: string
) {
  const mechanicsState = resolveMechanicsState(campaign, [player]);
  const turnInput = {
    type: "solo_turn",
    action_policy:
      "Only treat concrete declared actions as actions. Quoted speech, questions, promises, plans, and corrections are dialogue or intent unless the player also says they move, travel, enter, search, attack, take something, cast a spell, or otherwise change the scene.",
    submissions: [
      {
        player: player.username,
        character: player.character_name,
        content
      }
    ]
  };

  return [
    formatCanonicalCharacterContext([player], mechanicsState),
    "",
    formatMechanicsPromptContext(mechanicsState),
    "",
    "Current turn input JSON:",
    JSON.stringify(turnInput, null, 2)
  ].join("\n");
}

function formatMultiplayerTurn(
  campaign: CampaignRow,
  players: PlayerRow[],
  submissions: SubmissionRow[]
) {
  const mechanicsState = resolveMechanicsState(campaign, players);
  const turnInput = {
    type: "multiplayer_turn",
    resolution_policy:
      "Resolve these submitted actions as one combined party turn. Account for timing, positioning, cooperation, conflict, and consequences across the whole party before asking what happens next.",
    submissions: submissions.map((submission) => ({
      player: submission.username?.trim() || "Unknown player",
      character: submission.character_name?.trim() || "Unknown character",
      content: submission.content
    }))
  };

  return [
    formatCanonicalCharacterContext(players, mechanicsState),
    "",
    formatMechanicsPromptContext(mechanicsState),
    "",
    "Current turn input JSON:",
    JSON.stringify(turnInput, null, 2)
  ].join("\n");
}

function formatOpeningSceneRequest(input: {
  campaign: CampaignRow;
  mode: CampaignMode;
  players: PlayerRow[];
  style: CampaignOpeningStyle;
}) {
  const mechanicsState = resolveMechanicsState(input.campaign, input.players);
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
    formatCanonicalCharacterContext(input.players, mechanicsState),
    "",
    formatMechanicsPromptContext(mechanicsState),
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

function eldermereOpeningPlannerInstructions() {
  return [
    "You are the campaign-opening planner for AI Taverns, a D&D-style fantasy campaign app.",
    "Your job is not to write player-facing narration.",
    "Create a compact structured campaign opener seed that a separate narrator will turn into the opening scene.",
    "The narrator will not receive the full world lore, so separate player-safe facts, private DM context, allowed opening terms, and forbidden opening terms.",
    "Use the selected Eldermere region and settlement when provided. Do not choose a different primary region or starting settlement.",
    "Make the opener specific, playable, and mysterious. Let the narrator start with a human-scale scene, not a history lecture.",
    "The player-facing opening should use at most 3 Eldermere-specific setting proper nouns total, not counting ordinary NPC names. The chosen region and starting location count toward this limit.",
    "Prefer plain descriptions over official names: use concrete meaning before setting terminology.",
    "Return exactly one valid JSON object and no Markdown.",
    "Use this exact JSON shape:",
    JSON.stringify(
      {
        campaign_title: "short evocative title",
        region: {
          name: "chosen region name",
          why_this_region: "why this region makes a strong opener",
          plain_description: "one sentence the player could understand"
        },
        starting_location: {
          name: "chosen town, ruin, road, tavern, settlement, camp, observatory, shrine, district, or landmark",
          type: "short type label",
          why_this_location: "why this is the right first location",
          plain_description: "one sentence the player could understand"
        },
        opening_premise: {
          why_the_party_is_here: "concrete reason the player or party came here",
          immediate_objective: "what they are trying to do now",
          immediate_complication: "what blocks, complicates, or pressures that objective",
          first_scene_location: "where the narration should begin physically",
          opening_mood: "short mood phrase",
          campaign_promise: "what kind of adventure this opener promises"
        },
        player_facing_facts: [
          "facts the narrator may safely reveal immediately"
        ],
        allowed_player_facing_terms: [
          {
            term: "setting term allowed in narration",
            plain_meaning: "plain explanation the narrator should include on first use"
          }
        ],
        npc_seed: [
          {
            name: "NPC name",
            role: "what the player understands this person to be",
            wants: "what this NPC wants in the opening",
            visible_behavior: "how they come across"
          }
        ],
        first_interactable_choices: [
          "clear option the player could take",
          "clear option the player could take",
          "clear option the player could take"
        ],
        sensory_palette: {
          sights: ["specific visible detail"],
          sounds: ["specific sound"],
          smells: ["specific smell"],
          textures_or_weather: ["specific tactile or weather detail"]
        },
        dm_private_context: [
          "facts the DM can use later but the narrator must not reveal directly in the opening"
        ],
        forbidden_opening_terms: [
          "setting terms or lore names that should not appear in the first player-facing narration"
        ],
        narrator_instructions: ["instructions for the second narrator call"],
        opening_quality_checks: [
          "check the narrator should pass before output"
        ]
      },
      null,
      2
    )
  ].join("\n");
}

function formatEldermereOpeningPlannerRequest(input: {
  openingRequest: string;
  campaign: CampaignRow;
}) {
  return [
    input.openingRequest,
    "",
    formatEldermereOpeningPromptContext(
      eldermereCampaignStartFromMetadata(input.campaign)
    )
  ].join("\n");
}

function formatEldermereNarratorOpeningRequest(input: {
  openingRequest: string;
  plan: EldermereOpeningPlan;
}) {
  return [
    input.openingRequest,
    "",
    "Eldermere opening plan:",
    JSON.stringify(openingPlanToJson(input.plan), null, 2),
    "",
    "Narrator boundary:",
    "Write the player-facing opener only from the Eldermere opening plan above, the canonical character sheets, and the website DM instructions.",
    "Do not use the full Eldermere world bible. Do not introduce extra Eldermere lore, factions, institutions, ancient ages, regions, gods, magic resources, or historical terms beyond the allowed_player_facing_terms.",
    "If a useful idea appears in dm_private_context, imply it only through concrete visible facts or pressure; do not reveal it as confirmed exposition.",
    "Forbidden opening terms must not appear in public_narration.",
    "Allowed player-facing terms must be explained plainly on first use.",
    'Set setting.world_name to "Eldermere".',
    `Set setting.starting_location and setting.display_location to "${input.plan.startingLocation.name}".`
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string`);
    return "";
  }

  return value.trim();
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  const value = record[key];

  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return [];
  }

  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (strings.length !== value.length) {
    errors.push(`${key} must contain only non-empty strings`);
  }

  return strings;
}

function readObject(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  const value = record[key];

  if (!isRecord(value)) {
    errors.push(`${key} must be an object`);
    return {};
  }

  return value;
}

function readObjectArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  const value = record[key];

  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return [];
  }

  const objects = value.filter(isRecord);

  if (objects.length !== value.length) {
    errors.push(`${key} must contain only objects`);
  }

  return objects;
}

function parseOpeningTerm(value: Record<string, unknown>, index: number) {
  const errors: string[] = [];

  return {
    value: {
      term: readString(value, "term", errors),
      plainMeaning: readString(value, "plain_meaning", errors)
    },
    errors: errors.map((error) => `allowed_player_facing_terms[${index}].${error}`)
  };
}

function parseOpeningNpcSeed(value: Record<string, unknown>, index: number) {
  const errors: string[] = [];

  return {
    value: {
      name: readString(value, "name", errors),
      role: readString(value, "role", errors),
      wants: readString(value, "wants", errors),
      visibleBehavior: readString(value, "visible_behavior", errors)
    },
    errors: errors.map((error) => `npc_seed[${index}].${error}`)
  };
}

function parseSensoryPalette(
  value: Record<string, unknown>,
  errors: string[]
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (!Array.isArray(item)) {
        errors.push(`sensory_palette.${key} must be an array`);
        return [key, []];
      }

      const strings = item
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (strings.length !== item.length) {
        errors.push(`sensory_palette.${key} must contain only non-empty strings`);
      }

      return [key, strings];
    })
  );
}

function parseEldermereOpeningPlan(content: string) {
  const parsed = parseJsonRecord(content);
  const errors: string[] = [];
  const region = readObject(parsed, "region", errors);
  const startingLocation = readObject(parsed, "starting_location", errors);
  const openingPremise = readObject(parsed, "opening_premise", errors);
  const sensoryPalette = readObject(parsed, "sensory_palette", errors);
  const allowedTermResults = readObjectArray(
    parsed,
    "allowed_player_facing_terms",
    errors
  ).map(parseOpeningTerm);
  const npcSeedResults = readObjectArray(parsed, "npc_seed", errors).map(
    parseOpeningNpcSeed
  );

  const plan: EldermereOpeningPlan = {
    campaignTitle: readString(parsed, "campaign_title", errors),
    region: {
      name: readString(region, "name", errors),
      whyThisRegion: readString(region, "why_this_region", errors),
      plainDescription: readString(region, "plain_description", errors)
    },
    startingLocation: {
      name: readString(startingLocation, "name", errors),
      type: readString(startingLocation, "type", errors),
      whyThisLocation: readString(startingLocation, "why_this_location", errors),
      plainDescription: readString(
        startingLocation,
        "plain_description",
        errors
      )
    },
    openingPremise: {
      whyThePartyIsHere: readString(
        openingPremise,
        "why_the_party_is_here",
        errors
      ),
      immediateObjective: readString(
        openingPremise,
        "immediate_objective",
        errors
      ),
      immediateComplication: readString(
        openingPremise,
        "immediate_complication",
        errors
      ),
      firstSceneLocation: readString(
        openingPremise,
        "first_scene_location",
        errors
      ),
      openingMood: readString(openingPremise, "opening_mood", errors),
      campaignPromise: readString(openingPremise, "campaign_promise", errors)
    },
    playerFacingFacts: readStringArray(parsed, "player_facing_facts", errors),
    allowedPlayerFacingTerms: allowedTermResults.map((result) => result.value),
    npcSeed: npcSeedResults.map((result) => result.value),
    firstInteractableChoices: readStringArray(
      parsed,
      "first_interactable_choices",
      errors
    ),
    sensoryPalette: parseSensoryPalette(sensoryPalette, errors),
    dmPrivateContext: readStringArray(parsed, "dm_private_context", errors),
    forbiddenOpeningTerms: readStringArray(
      parsed,
      "forbidden_opening_terms",
      errors
    ),
    narratorInstructions: readStringArray(
      parsed,
      "narrator_instructions",
      errors
    ),
    openingQualityChecks: readStringArray(
      parsed,
      "opening_quality_checks",
      errors
    )
  };

  errors.push(
    ...allowedTermResults.flatMap((result) => result.errors),
    ...npcSeedResults.flatMap((result) => result.errors)
  );

  if (plan.allowedPlayerFacingTerms.length === 0) {
    errors.push("allowed_player_facing_terms must include at least one term");
  }

  if (plan.firstInteractableChoices.length < 2) {
    errors.push("first_interactable_choices must include at least two choices");
  }

  if (errors.length > 0) {
    throw new Error(`Eldermere opening planner returned invalid JSON: ${errors.join("; ")}`);
  }

  return plan;
}

function openingPlanToJson(plan: EldermereOpeningPlan) {
  return {
    campaign_title: plan.campaignTitle,
    region: {
      name: plan.region.name,
      why_this_region: plan.region.whyThisRegion,
      plain_description: plan.region.plainDescription
    },
    starting_location: {
      name: plan.startingLocation.name,
      type: plan.startingLocation.type,
      why_this_location: plan.startingLocation.whyThisLocation,
      plain_description: plan.startingLocation.plainDescription
    },
    opening_premise: {
      why_the_party_is_here: plan.openingPremise.whyThePartyIsHere,
      immediate_objective: plan.openingPremise.immediateObjective,
      immediate_complication: plan.openingPremise.immediateComplication,
      first_scene_location: plan.openingPremise.firstSceneLocation,
      opening_mood: plan.openingPremise.openingMood,
      campaign_promise: plan.openingPremise.campaignPromise
    },
    player_facing_facts: plan.playerFacingFacts,
    allowed_player_facing_terms: plan.allowedPlayerFacingTerms.map((term) => ({
      term: term.term,
      plain_meaning: term.plainMeaning
    })),
    npc_seed: plan.npcSeed.map((npc) => ({
      name: npc.name,
      role: npc.role,
      wants: npc.wants,
      visible_behavior: npc.visibleBehavior
    })),
    first_interactable_choices: plan.firstInteractableChoices,
    sensory_palette: plan.sensoryPalette,
    dm_private_context: plan.dmPrivateContext,
    forbidden_opening_terms: plan.forbiddenOpeningTerms,
    narrator_instructions: plan.narratorInstructions,
    opening_quality_checks: plan.openingQualityChecks
  };
}

function openingSceneInstructions(mode: CampaignMode) {
  const modeDirection =
    mode === "single_player"
      ? "The website has provided the solo player's character setup."
      : "The website has provided the full current party.";

  return [
    dungeonMasterContractInstructions,
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

const gameplayTurnOutputContractReminder = [
  "Output contract reminder:",
  "Return only one valid JSON object. Do not include prose, Markdown, or commentary outside JSON.",
  "Required top-level keys: public_narration, resolution_mode, roll_requests, next_input_needed, input_targets, input_policy, mechanics_state_update.",
  "Set resolution_mode to needs_dice whenever roll_requests is non-empty or next_input_needed is dice_results; otherwise set it to resolved_without_dice.",
  "When resolution_mode is needs_dice, public_narration must not resolve the rolled outcome.",
  "If hostilities start while combat is inactive and enemies are ready or aware, ask the acting player for initiative in public_narration and roll_requests before resolving the attack or damage.",
  "If the acting player clearly surprises unaware enemies, resolve the opening action's required rolls first, then ask initiative before enemy counteraction.",
  "Also include non-empty mechanics_state_update.combat with active, round, turnOwner, and provisional initiativeOrder as actor-key strings when initiative roll_requests pauses resolution.",
  "If combat turnOwner is or becomes npc:*, resolve NPC turns before returning control to players.",
  "Off-turn player combat declarations are only stated intent, not actions already in motion; never say they are mid-swing, following immediately, or resolving before the next initiative actor.",
  "When multiple player submissions arrive in active combat, resolve the current turn owner's valid action first, keep other submissions as pending intent, and if the next actor is an enemy resolve that enemy turn before later player intent.",
  "Do not end with next_input_needed player_actions while turnOwner is npc:*; set turnOwner to a player actor, or null for a multiplayer all-player prompt.",
  "If the stored turnOwner is an NPC key or NPC character name, do not let submitted player attacks or spells preempt that NPC turn.",
  "In singleplayer active combat, return control with turnOwner set to the player actor key, not null.",
  "Resolve NPC attacks fully using explicit wording: 'attack roll: X vs AC Y - hit/miss'; on a hit, immediately state 'damage roll: dice = total damage', update player HP, then return control.",
  "For NPC hits, public_narration must include the words attack roll, vs AC, and damage roll before injury narration.",
  "Do not end an NPC turn with only a wind-up like lunges, swings, aims, starts casting, or bears down unless a player-facing roll or reaction is required first.",
  "When the final active enemy is defeated, set combat active false, turnOwner null, and initiativeOrder empty; do not say a specific combatant is up next after combat ends.",
  "Build combat actor names and keys only from the current scene and character sheets; never copy example NPC names into initiativeOrder.",
  "initiativeOrder should include active combatants only; exclude captives, bystanders, and noncombatants unless they can act in the fight."
].join("\n");

function appendGameplayTurnOutputContractReminder(message: string) {
  return [message, "", gameplayTurnOutputContractReminder].join("\n");
}

async function askEldermereOpeningPlanner(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: CampaignRow,
  openingRequest: string,
  turnId?: string
) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const instructions = eldermereOpeningPlannerInstructions();
  const message = formatEldermereOpeningPlannerRequest({
    openingRequest,
    campaign
  });

  await logTurnDebugTrace(db, {
    campaignId: campaign.id,
    traceId,
    phase: "eldermere_opening_planner_started",
    turnId,
    elapsedMs: 0,
    payload: {
      message: textStats(message),
      instructions: textStats(instructions)
    }
  });

  const callPlanner = async (attempt: "initial" | "repair") => {
    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      message:
        attempt === "initial"
          ? message
          : [
              "The previous Eldermere opening planner response failed validation.",
              "Return a corrected response using exactly the required JSON shape.",
              "Do not include Markdown or commentary.",
              "",
              "Original planner request:",
              message
            ].join("\n"),
      instructions
    });

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase:
        attempt === "initial"
          ? "eldermere_opening_planner_response_received"
          : "eldermere_opening_planner_repair_response_received",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        durationMs: Date.now() - providerStartedAt,
        provider: providerDebugSummary(providerData.debug)
      }
    });

    return providerData;
  };

  let initialData: DungeonMasterProviderResponse | undefined;

  try {
    initialData = await callPlanner("initial");
    const plan = parseEldermereOpeningPlan(initialData.content);

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "eldermere_opening_planner_completed",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        campaignTitle: plan.campaignTitle,
        region: plan.region.name,
        startingLocation: plan.startingLocation.name,
        allowedTerms: plan.allowedPlayerFacingTerms.map((term) => term.term),
        forbiddenTerms: plan.forbiddenOpeningTerms
      }
    });

    return plan;
  } catch (initialError) {
    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "eldermere_opening_planner_validation_failed",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        error: errorSummary(initialError),
        rawResponse: initialData ? textStats(initialData.content) : undefined
      }
    });

    try {
      const repairData = await callPlanner("repair");
      const plan = parseEldermereOpeningPlan(repairData.content);

      await logTurnDebugTrace(db, {
        campaignId: campaign.id,
        traceId,
        phase: "eldermere_opening_planner_repair_completed",
        turnId,
        elapsedMs: Date.now() - startedAt,
        payload: {
          campaignTitle: plan.campaignTitle,
          region: plan.region.name,
          startingLocation: plan.startingLocation.name,
          allowedTerms: plan.allowedPlayerFacingTerms.map((term) => term.term),
          forbiddenTerms: plan.forbiddenOpeningTerms
        }
      });

      return plan;
    } catch (repairError) {
      await logTurnDebugTrace(db, {
        campaignId: campaign.id,
        traceId,
        phase: "eldermere_opening_planner_failed",
        turnId,
        elapsedMs: Date.now() - startedAt,
        payload: {
          initialError: errorSummary(initialError),
          repairError: errorSummary(repairError)
        }
      });

      throw new Error(
        `Eldermere opening planner failed validation. Trace ID: ${traceId}`
      );
    }
  }
}

function findForbiddenOpeningTerms(
  narration: string,
  plan: EldermereOpeningPlan
) {
  const allowedTerms = new Set(
    plan.allowedPlayerFacingTerms.map((term) => term.term.toLowerCase())
  );

  return [...new Set(plan.forbiddenOpeningTerms)]
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => !allowedTerms.has(term.toLowerCase()))
    .filter((term) => openingNarrationContainsTerm(narration, term));
}

function openingNarrationTermPattern(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`,
    "iu"
  );
}

function openingNarrationContainsTerm(narration: string, term: string) {
  return openingNarrationTermPattern(term).test(narration);
}

function plainReplacementForForbiddenOpeningTerm(term: string) {
  switch (term.toLowerCase()) {
    case "second dominion":
      return "the fallen empire";
    case "graywake":
      return "the old catastrophe";
    case "hush":
      return "the long silence";
    case "wellglass":
      return "rare crystal";
    default:
      return "old lore";
  }
}

function scrubForbiddenOpeningTerms(
  narration: string,
  plan: EldermereOpeningPlan
) {
  const allowedTerms = new Set(
    plan.allowedPlayerFacingTerms.map((term) => term.term.toLowerCase())
  );

  return [...new Set(plan.forbiddenOpeningTerms)]
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => !allowedTerms.has(term.toLowerCase()))
    .reduce(
      (current, term) =>
        current.replace(
          openingNarrationTermPattern(term),
          (_match, prefix: string) =>
            `${prefix}${plainReplacementForForbiddenOpeningTerm(term)}`
        ),
      narration
    );
}

function repairEldermereOpeningReply(
  reply: DungeonMasterReply,
  plan: EldermereOpeningPlan
): DungeonMasterReply {
  return {
    ...reply,
    content: scrubForbiddenOpeningTerms(reply.content, plan),
    setting: {
      ...reply.setting,
      worldName: "Eldermere",
      startingLocation: plan.startingLocation.name,
      displayLocation: plan.startingLocation.name
    }
  };
}

function eldermereOpeningSettingErrors(
  setting: CampaignSettingSummary | undefined,
  plan: EldermereOpeningPlan
) {
  const errors: string[] = [];

  if (setting?.worldName !== "Eldermere") {
    errors.push('setting.world_name must be "Eldermere"');
  }

  if (!setting?.startingLocation) {
    errors.push("setting.starting_location must be present");
  }

  if (!setting?.displayLocation) {
    errors.push("setting.display_location must be present");
  }

  if (
    setting?.startingLocation &&
    setting.startingLocation !== plan.startingLocation.name
  ) {
    errors.push(
      `setting.starting_location must be "${plan.startingLocation.name}"`
    );
  }

  return errors;
}

async function askEldermereOpeningNarrator(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: CampaignRow,
  openingRequest: string,
  instructions: string,
  plan: EldermereOpeningPlan,
  turnId?: string,
  contractOptions?: DmContractParseOptions
) {
  const narratorMessage = formatEldermereNarratorOpeningRequest({
    openingRequest,
    plan
  });
  const opening = await askDungeonMaster(
    db,
    runtime,
    campaign,
    narratorMessage,
    instructions,
    false,
    turnId,
    undefined,
    contractOptions,
    {
      buildPromptContext: false,
      includeEldermereTurnContext: false,
      suppressStreaming: true
    }
  );
  const forbiddenTerms = findForbiddenOpeningTerms(opening.content, plan);
  const settingErrors = eldermereOpeningSettingErrors(opening.setting, plan);

  if (forbiddenTerms.length === 0 && settingErrors.length === 0) {
    return opening;
  }

  const forbiddenTermPlural = forbiddenTerms.length === 1 ? "" : "s";
  const repairMessage = [
    narratorMessage,
    "",
    "Rewrite required:",
    ...(forbiddenTerms.length > 0
      ? [
          `The previous public_narration used ${forbiddenTerms.length} forbidden opening term${forbiddenTermPlural} from forbidden_opening_terms.`
        ]
      : []),
    ...(settingErrors.length > 0
      ? [`The previous setting metadata was invalid: ${settingErrors.join("; ")}.`]
      : []),
    "Return the same opening situation as valid AI Taverns DM JSON, but remove those terms from public_narration.",
    "Use only allowed_player_facing_terms and plain descriptions. Preserve setting metadata."
  ].join("\n");
  const repairedOpening = await askDungeonMaster(
    db,
    runtime,
    campaign,
    repairMessage,
    instructions,
    false,
    turnId,
    undefined,
    contractOptions,
    {
      buildPromptContext: false,
      includeEldermereTurnContext: false,
      suppressStreaming: true
    }
  );
  const remainingForbiddenTerms = findForbiddenOpeningTerms(
    repairedOpening.content,
    plan
  );
  const remainingSettingErrors = eldermereOpeningSettingErrors(
    repairedOpening.setting,
    plan
  );

  if (remainingForbiddenTerms.length > 0 || remainingSettingErrors.length > 0) {
    return repairEldermereOpeningReply(repairedOpening, plan);
  }

  return repairedOpening;
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
  campaign: CampaignRow,
  players: PlayerRow[],
  asker: PlayerRow,
  question: string
) {
  const mechanicsState = resolveMechanicsState(campaign, players.length > 0 ? players : [asker]);

  return [
    formatCanonicalCharacterContext(
      players.length > 0 ? players : [asker],
      mechanicsState
    ),
    "",
    formatMechanicsPromptContext(mechanicsState),
    "",
    "Out-of-turn Ask DM question:",
    "The player is asking for clarification without advancing time. Answer as table guidance, not as a committed character action.",
    `${asker.username} (${asker.character_name}): ${question}`
  ].join("\n");
}

async function getCampaignEventMessages(
  db: Queryable,
  campaignId: string,
  limit = 30,
  excludeTurnId?: string
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
        order by created_at desc,
          case type
            when 'dm_answer' then 0
            when 'turn_resolved' then 1
            when 'adventure_begun' then 1
            when 'dm_question' then 2
            when 'turn_submitted' then 3
            else 4
          end asc,
          id desc
        limit $2
      ) recent_events
      order by created_at asc,
        case type
          when 'turn_submitted' then 0
          when 'dm_question' then 0
          when 'turn_resolved' then 1
          when 'adventure_begun' then 1
          when 'dm_answer' then 1
          else 2
        end asc,
        id asc
    `,
    [campaignId, limit]
  );
  const resolvedTurnIds = new Set(
    events.rows
      .filter((event) => event.type === "turn_resolved")
      .map((event) => {
        const payload = eventPayload(event.payload);
        return typeof payload.turnId === "string" ? payload.turnId : "";
      })
      .filter(Boolean)
  );

  return events.rows
    .map((event): GameMessage | null => {
      const payload = eventPayload(event.payload);
      const content = typeof payload.content === "string" ? payload.content : "";
      const eventTurnId = typeof payload.turnId === "string" ? payload.turnId : "";

      if (!content.trim()) {
        return null;
      }

      if (
        event.type === "turn_submitted" &&
        (!eventTurnId ||
          eventTurnId === excludeTurnId ||
          !resolvedTurnIds.has(eventTurnId))
      ) {
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
        createdAt: toIso(event.created_at),
        ...(typeof payload.username === "string"
          ? { playerName: payload.username }
          : {}),
        ...(typeof payload.characterName === "string"
          ? { characterName: payload.characterName }
          : {})
      };
    })
    .filter((message): message is GameMessage => message !== null);
}

async function askDungeonMaster(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: Pick<CampaignRow, "id" | "session_id" | "metadata" | "mode">,
  message: string,
  instructions: string,
  includeHistory = true,
  turnId?: string,
  currentPlayerAction?: string,
  contractOptions?: DmContractParseOptions,
  options?: {
    buildPromptContext?: boolean;
    includeEldermereTurnContext?: boolean;
    suppressStreaming?: boolean;
  }
): Promise<DungeonMasterReply> {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const streamEmitter =
    turnId && !options?.suppressStreaming ? runtime.emitDmStreamEvent : undefined;
  const streamTurnId = streamEmitter ? turnId : undefined;
  const shouldBuildPromptContext = options?.buildPromptContext !== false;
  const instructionsWithWorldContext =
    options?.includeEldermereTurnContext === false
      ? instructions
      : withEldermereTurnContext(instructions, campaign);
  let providerDebug: AiDebugInfo | undefined;

  if (streamEmitter && streamTurnId) {
    streamEmitter({
      type: "dm_stream_started",
      roomId: campaign.id,
      turnId: streamTurnId
    });
  }

  await logTurnDebugTrace(db, {
    campaignId: campaign.id,
    traceId,
    phase: "dm_turn_started",
    turnId,
    elapsedMs: 0,
    payload: {
      sessionId: campaign.session_id,
      includeHistory,
      message: textStats(message),
      instructions: textStats(instructionsWithWorldContext)
    }
  });

  try {
    const history = includeHistory
      ? await getCampaignEventMessages(db, campaign.id, 30, turnId)
      : [];
    const promptContext = shouldBuildPromptContext
      ? runtime.buildPromptContext
        ? await runtime.buildPromptContext({
            campaignId: campaign.id,
            turnId,
            currentAction: message,
            baseInstructions: instructionsWithWorldContext
          })
        : await buildModularDmPromptContext(db, runtime, campaign, {
            traceId,
            turnId,
            currentAction: message,
            baseInstructions: instructionsWithWorldContext,
            history
          })
      : null;
    const providerMessage = appendGameplayTurnOutputContractReminder(
      promptContext?.message ?? message
    );
    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      message: providerMessage,
      instructions: promptContext?.instructions ?? instructionsWithWorldContext,
      history,
      ...(currentPlayerAction ? { currentPlayerAction } : {}),
      ...(streamEmitter && streamTurnId
        ? {
            onPublicNarrationDelta: (text: string) => {
              if (!text) {
                return;
              }

              streamEmitter({
                type: "dm_stream_delta",
                roomId: campaign.id,
                turnId: streamTurnId,
                text
              });
            }
          }
        : {})
    });
    providerDebug = providerData.debug;
    const providerDurationMs = Date.now() - providerStartedAt;

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "provider_response_received",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        durationMs: providerDurationMs,
        historyCount: history.length,
        promptContextSections: promptContext?.sections ?? [],
        promptContextBudget: promptContext?.budget ?? {},
        provider: providerDebugSummary(providerData.debug, {
          includeRawResponse: true
        })
      }
    });

    await logDmModelCall(db, {
      campaignId: campaign.id,
      traceId,
      turnId,
      phase: "main",
      providerData,
      durationMs: providerDurationMs
    });

    let outputEnvelope:
      | ReturnType<typeof validateMainDmOutput>
      | undefined;
    let outputEnvelopeError: unknown;

    try {
      outputEnvelope = validateMainDmOutput(providerData.content);
    } catch (error) {
      outputEnvelopeError = error;
    }

    const contract: DmContractResponse = parseDmContract(
      providerData.content,
      {
        ...contractOptions,
        currentAction: message,
        ...(currentPlayerAction ? { currentPlayerAction } : {})
      }
    );

    const rollRequests = normalizeRollRequests(contract.rollRequests);
    const reply = contract.publicNarration;
    const combatValidation = outputEnvelope
      ? validateCombatEvents(outputEnvelope.combatEvents, {
          actors: mechanicsActorsForValidation(campaign)
        })
      : { accepted: [], discarded: [] };
    const memoryValidation = outputEnvelope
      ? validateMemoryPatches(
          outputEnvelope.proposedContextUpdates,
          new Set(
            promptContext?.sections.flatMap((section) =>
              typeof section === "object" &&
              section !== null &&
              "includedContextKeys" in section &&
              Array.isArray(
                (section as { includedContextKeys?: unknown }).includedContextKeys
              )
                ? ((section as { includedContextKeys: string[] })
                    .includedContextKeys)
                : []
            ) ?? []
          )
        )
      : { accepted: [], discarded: [] };
    const mechanicsState = resolveMechanicsState(campaign, []);
    const nextMechanicsState = normalizeCombatTurnOwnerForInput(
      applyMechanicsStateUpdate(
        mechanicsState,
        contract.mechanicsStateUpdate,
        nowIso()
      ),
      {
        mode: campaign.mode,
        nextInputNeeded: contract.nextInputNeeded,
        inputPolicy: contract.inputPolicy
      }
    );

    if (nextMechanicsState !== mechanicsState) {
      await writeMechanicsStateForLockedCampaign(
        db,
        campaign.id,
        nextMechanicsState
      );
    }
    const debugWithCombatState: AiDebugInfo = {
      ...providerData.debug,
      combatState: {
        combat: nextMechanicsState.combat,
        actors: nextMechanicsState.actors
      }
    };

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
        outputEnvelopeValidated: Boolean(outputEnvelope),
        outputEnvelopeError: outputEnvelopeError
          ? errorSummary(outputEnvelopeError)
          : undefined,
        rollRequestsCount: rollRequests.length,
        rollRequestLabels: rollRequests.map((request) => request.label),
        nextInputNeeded: contract.nextInputNeeded,
        inputPolicy: contract.inputPolicy,
        inputTargets: contract.inputTargets,
        resolutionMode: contract.resolutionMode
      }
    });

    await logDmOutputReport(db, {
      campaignId: campaign.id,
      traceId,
      turnId,
      payload: {
        outputEnvelopeValidated: Boolean(outputEnvelope),
        outputEnvelopeError: outputEnvelopeError
          ? errorSummary(outputEnvelopeError)
          : undefined,
        rollRequestsCount: rollRequests.length,
        acceptedCombatEventsCount: combatValidation.accepted.length,
        discardedCombatEvents: combatValidation.discarded,
        acceptedImmediateContextUpdatesCount: memoryValidation.accepted.length,
        discardedImmediateContextUpdates: memoryValidation.discarded
      }
    });

    if (outputEnvelope?.proposedContextUpdates.length) {
      await logDmMemoryPatchLog(db, {
        campaignId: campaign.id,
        traceId,
        turnId,
        payload: {
          source: "main_dm_output",
          proposedPatches: outputEnvelope.proposedContextUpdates,
          acceptedPatches: memoryValidation.accepted,
          discardedPatches: memoryValidation.discarded
        }
      });
    }

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
      id: providerData.id ?? randomUUID(),
      content: reply,
      debug: debugWithCombatState,
      rollRequests,
      inputTargets: contract.inputTargets,
      inputPolicy: contract.inputPolicy,
      resolutionMode: contract.resolutionMode,
      setting: contract.setting
    };
  } catch (error) {
    providerDebug ??= providerDebugFromError(error);

    await logTurnDebugTrace(db, {
      campaignId: campaign.id,
      traceId,
      phase: "dm_turn_failed",
      turnId,
      elapsedMs: Date.now() - startedAt,
      payload: {
        error: errorSummary(error),
        provider: providerDebugSummary(providerDebug, {
          includeRawResponse: true
        })
      }
    });

    if (error instanceof Error && error.message.includes("Trace ID:")) {
      if (streamEmitter && streamTurnId) {
        streamEmitter({
          type: "dm_stream_failed",
          roomId: campaign.id,
          turnId: streamTurnId,
          message: error.message
        });
      }
      throw error;
    }

    const wrappedError = new Error(
      `${error instanceof Error ? error.message : "DM provider call failed."} Trace ID: ${traceId}`
    );

    if (streamEmitter && streamTurnId) {
      streamEmitter({
        type: "dm_stream_failed",
        roomId: campaign.id,
        turnId: streamTurnId,
        message: wrappedError.message
      });
    }

    throw wrappedError;
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

async function persistEldermereOpeningPlan(
  db: Queryable,
  campaignId: string,
  plan: EldermereOpeningPlan
) {
  await db.query(
    `
      update campaigns
      set metadata = jsonb_set(
        jsonb_set(metadata, '{eldermereOpeningPlan}', $2::jsonb, true),
        '{eldermereOpeningPlanVersion}',
        '1'::jsonb,
        true
      )
      where id = $1
    `,
    [campaignId, JSON.stringify(openingPlanToJson(plan))]
  );
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
    modelMessageId: string | undefined;
    reply: string;
    eventType: "adventure_begun" | "turn_resolved";
    pendingRollRequests?: DiceRollRequest[];
    inputTargets?: string[];
    inputPolicy?: InputPolicy;
    resolutionMode?: "needs_dice" | "resolved_without_dice";
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
        set status = 'resolved', model_message_id = $2, resolved_at = now(), error = null
        where id = $1
      `,
      [input.turnId, input.modelMessageId ?? null]
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
      modelMessageId: input.modelMessageId,
      messageId: input.modelMessageId ?? randomUUID(),
      role: "dm",
      content: input.reply,
      ...settingPatch,
      pendingRollRequest: currentPendingRollRequest,
      pendingRollRequests,
      resolutionMode:
        input.resolutionMode ??
        (pendingRollRequests.length > 0 ? "needs_dice" : "resolved_without_dice"),
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
    mechanicsSeed?: MechanicsSeed | undefined;
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
    const savedPlayer =
      (await client.query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1 and client_id = $2
          limit 1
        `,
        [campaignRow.id, input.playerId]
      )).rows[0] ?? existing.rows[0];

    if (savedPlayer) {
      await addOrReplacePlayerMechanicsActor(client, {
        campaign: campaignRow,
        playerId: savedPlayer.id,
        characterName: input.characterName,
        characterSheet: input.characterSheet,
        seed: input.mechanicsSeed
      });
    }

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

  const runtime = input.runtime;
  const openingTurn = beginState.turn;
  const openingRequest = formatOpeningSceneRequest({
    campaign: beginState.campaign,
    mode: "multiplayer",
    players: beginState.players,
    style: campaignOpeningStyleFromMetadata(beginState.campaign)
  });

  try {
    const opening = hasEldermereWorldProfile(beginState.campaign)
      ? await (async () => {
          const plan = await askEldermereOpeningPlanner(
            db,
            runtime,
            beginState.campaign,
            openingRequest,
            openingTurn.id
          );
          await persistEldermereOpeningPlan(db, beginState.campaign.id, plan);

          return askEldermereOpeningNarrator(
            db,
            runtime,
            beginState.campaign,
            openingRequest,
            openingSceneInstructions("multiplayer"),
            plan,
            openingTurn.id,
            { allowResolvedCombatWithoutRolls: true }
          );
        })()
      : await askDungeonMaster(
          db,
          runtime,
          beginState.campaign,
          openingRequest,
          openingSceneInstructions("multiplayer"),
          true,
          openingTurn.id,
          undefined,
          { allowResolvedCombatWithoutRolls: true },
          { buildPromptContext: false }
        );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: beginState.campaign.id,
      turnId: openingTurn.id,
      modelMessageId: opening.id,
      reply: opening.content,
      eventType: "adventure_begun",
      pendingRollRequests: opening.rollRequests,
      inputTargets: opening.inputTargets,
      inputPolicy: opening.inputPolicy,
      resolutionMode: opening.resolutionMode,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    runtime.emitDmStreamEvent?.({
      type: "dm_stream_done",
      roomId: beginState.campaign.id,
      turnId: openingTurn.id,
      messageId: opening.id
    });

    await db.query("update campaigns set has_begun = true where id = $1", [
      beginState.campaign.id
    ]);

    void runtime.runPostTurnContextJobs?.({
      campaignId: beginState.campaign.id,
      turnId: openingTurn.id,
      currentAction: openingRequest,
      dmResponse: opening.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: opening.rollRequests
    });
  } catch (error) {
    await markTurnFailed(db, openingTurn.id, error);
    await logCampaignEvent(db, beginState.campaign.id, "turn_failed", {
      turnId: openingTurn.id,
      error: error instanceof Error ? error.message : "DM provider call failed."
    });
    throw error;
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    beginState.campaign.id,
    beginState.campaign.session_id
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
    skipTurn?: boolean;
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
      : input.skipTurn
        ? `${player.character_name} skips their turn.`
      : input.message.trim();

    if (!trimmedContent) {
      throw createStatusError(400, "A player message is required.");
    }

    if (!isRollSubmission && !input.skipTurn) {
      const mechanicsState = resolveMechanicsState(campaignRow, [player]);

      try {
        assertMechanicsActionAllowed({
          state: mechanicsState,
          player,
          message: trimmedContent
        });
      } catch (error) {
        throw createStatusError(
          400,
          error instanceof Error ? error.message : "That action is not allowed."
        );
      }

      const nextMechanicsState = applyAcceptedCast({
        state: mechanicsState,
        player,
        message: trimmedContent,
        updatedAt: nowIso()
      });

      if (nextMechanicsState !== mechanicsState) {
        await writeMechanicsStateForLockedCampaign(
          client,
          campaignRow.id,
          nextMechanicsState
        );
        campaignRow.metadata = {
          ...eventPayload(campaignRow.metadata),
          mechanicsState: nextMechanicsState
        };
      }
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
      campaignRow.metadata = metadataWithPendingRollRequests(
        campaignRow.metadata,
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
      username: player.username,
      characterName: player.character_name,
      skipped: Boolean(input.skipTurn),
      content: trimmedContent
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
        submitState.campaign,
        submitState.players,
        submitState.submissions
      );
      const reply = await askDungeonMaster(
        db,
        input.runtime,
        submitState.campaign,
        currentAction,
        dungeonMasterContractInstructions,
        true,
        submitState.turn.id
      );
      const resolvedTurn = await finishResolvedTurn(db, {
        campaignId: submitState.campaign.id,
        turnId: submitState.turn.id,
        modelMessageId: reply.id,
        reply: reply.content,
        eventType: "turn_resolved",
        pendingRollRequests: reply.rollRequests,
        inputTargets: reply.inputTargets,
        inputPolicy: reply.inputPolicy,
        resolutionMode: reply.resolutionMode,
        aiDebug: reply.debug
      });

      input.runtime.emitDmStreamEvent?.({
        type: "dm_stream_done",
        roomId: submitState.campaign.id,
        turnId: submitState.turn.id,
        messageId: reply.id
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
    submitState.campaign.session_id
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
  const currentAction = formatAskDmQuestion(
    campaign,
    players,
    player,
    trimmedQuestion
  );
  const streamTurnId = runtime.emitDmStreamEvent ? randomUUID() : undefined;
  const instructions = withEldermereTurnContext(askDmInstructions(), campaign);
  const promptContext = runtime.buildPromptContext
    ? await runtime.buildPromptContext({
        campaignId: campaign.id,
        turnId: streamTurnId,
        currentAction,
        baseInstructions: instructions
      })
    : null;
  const history = promptContext
    ? []
    : await getCampaignEventMessages(db, campaign.id);

  if (streamTurnId) {
    runtime.emitDmStreamEvent?.({
      type: "dm_stream_started",
      roomId: campaign.id,
      turnId: streamTurnId
    });
  }

  try {
    const providerData = await runtime.askProvider({
      message: promptContext?.message ?? currentAction,
      instructions: promptContext?.instructions ?? instructions,
      history,
      currentPlayerAction: trimmedQuestion,
      ...(streamTurnId
        ? {
            onPublicNarrationDelta: (text: string) => {
              if (!text) {
                return;
              }

              runtime.emitDmStreamEvent?.({
                type: "dm_stream_delta",
                roomId: campaign.id,
                turnId: streamTurnId,
                text
              });
            }
          }
        : {})
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
        username: player.username,
        characterName: player.character_name,
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

    if (streamTurnId) {
      runtime.emitDmStreamEvent?.({
        type: "dm_stream_done",
        roomId: campaign.id,
        turnId: streamTurnId,
        messageId: answerMessageId
      });
    }
  } catch (error) {
    if (streamTurnId) {
      runtime.emitDmStreamEvent?.({
        type: "dm_stream_failed",
        roomId: campaign.id,
        turnId: streamTurnId,
        message:
          error instanceof Error ? error.message : "DM provider call failed."
      });
    }

    throw error;
  }

  const updatedCampaign = await resolveRoomCampaign(
    db,
    campaign.id,
    campaign.session_id
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

    if (!isRollSubmission) {
      const mechanicsState = resolveMechanicsState(campaign, [player]);

      try {
        assertMechanicsActionAllowed({
          state: mechanicsState,
          player,
          message: trimmedContent
        });
      } catch (error) {
        throw createStatusError(
          400,
          error instanceof Error ? error.message : "That action is not allowed."
        );
      }

      const nextMechanicsState = applyAcceptedCast({
        state: mechanicsState,
        player,
        message: trimmedContent,
        updatedAt: nowIso()
      });

      if (nextMechanicsState !== mechanicsState) {
        await writeMechanicsStateForLockedCampaign(
          client,
          campaign.id,
          nextMechanicsState
        );
        campaign.metadata = {
          ...eventPayload(campaign.metadata),
          mechanicsState: nextMechanicsState
        };
      }
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
      campaign.metadata = metadataWithPendingRollRequests(
        campaign.metadata,
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
      username: player.username,
      characterName: player.character_name,
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
      soloState.campaign.session_id
    );

    return buildRoomSnapshot(db, updatedCampaign ?? soloState.campaign);
  }

  try {
    const currentAction = formatSoloTurn(
      soloState.campaign,
      soloState.player,
      soloState.content
    );
    const reply = await askDungeonMaster(
      db,
      runtime,
      soloState.campaign,
      currentAction,
      dungeonMasterContractInstructions,
      true,
      soloState.turn.id,
      soloState.content
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: soloState.campaign.id,
      turnId: soloState.turn.id,
      modelMessageId: reply.id,
      reply: reply.content,
      eventType: "turn_resolved",
      pendingRollRequests: reply.rollRequests,
      inputTargets: reply.inputTargets,
      inputPolicy: reply.inputPolicy,
      resolutionMode: reply.resolutionMode,
      aiDebug: reply.debug
    });

    runtime.emitDmStreamEvent?.({
      type: "dm_stream_done",
      roomId: soloState.campaign.id,
      turnId: soloState.turn.id,
      messageId: reply.id
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
    soloState.campaign.session_id
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

    const targetEvent = (
      await client.query<EventRow>(
        `
          select id, type, payload, created_at
          from campaign_events
          where campaign_id = $1
            and type in ('turn_submitted', 'turn_resolved', 'adventure_begun')
            and payload->>'messageId' = $2
            and payload->>'role' = 'dm'
          order by created_at desc
          limit 1
        `,
        [campaign.id, input.messageId]
      )
    ).rows[0];
    const targetPayload = eventPayload(targetEvent?.payload);

    if (
      !targetEvent ||
      (targetEvent.type !== "turn_resolved" &&
        targetEvent.type !== "adventure_begun")
    ) {
      throw createStatusError(409, "That DM response cannot be regenerated.");
    }

    const turnId = eventPayloadString(targetPayload.turnId);

    if (!turnId) {
      throw createStatusError(409, "That response is missing turn information.");
    }

    await client.query(
      `
        update turns
        set status = 'cancelled', updated_at = now()
        where campaign_id = $1
          and id <> $2
          and created_at > $3
          and status in ('collecting', 'resolving', 'resolved', 'failed')
      `,
      [campaign.id, turnId, targetEvent.created_at]
    );
    await client.query(
      `
        update submissions
        set status = 'cancelled', updated_at = now()
        where campaign_id = $1
          and turn_id <> $2
          and created_at > $3
          and status in ('submitted', 'included_in_turn')
      `,
      [campaign.id, turnId, targetEvent.created_at]
    );
    await client.query(
      `
        delete from campaign_events
        where campaign_id = $1
          and created_at > $2
      `,
      [campaign.id, targetEvent.created_at]
    );

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
      targetEvent.id
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
      targetEvent.type === "adventure_begun"
        ? "adventure_begun"
        : "turn_resolved";

    return {
      campaign,
      currentAction: formatSoloTurn(campaign, player, first.content),
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
      dungeonMasterContractInstructions,
      true,
      regenerationState.turn.id,
      regenerationState.currentPlayerAction
    );
    const resolvedTurn = await finishResolvedTurn(db, {
      campaignId: regenerationState.campaign.id,
      turnId: regenerationState.turn.id,
      modelMessageId: reply.id,
      reply: reply.content,
      eventType: regenerationState.eventType,
      pendingRollRequests: reply.rollRequests,
      inputTargets: reply.inputTargets,
      inputPolicy: reply.inputPolicy,
      resolutionMode: reply.resolutionMode,
      setting: reply.setting,
      aiDebug: reply.debug
    });

    runtime.emitDmStreamEvent?.({
      type: "dm_stream_done",
      roomId: regenerationState.campaign.id,
      turnId: regenerationState.turn.id,
      messageId: reply.id
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
    regenerationState.campaign.session_id
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
  const traceResult = await db.query<{
    id: string;
    trace_id: string;
    turn_id: string | null;
    phase: string;
    elapsed_ms: number | null;
    payload: unknown;
    created_at: Date;
  }>(
    `
      select id, trace_id, turn_id, phase, elapsed_ms, payload, created_at
      from dm_turn_traces
      where campaign_id = $1
        and ($2::text is null or trace_id = $2)
      order by created_at desc
      limit $3
    `,
    [input.campaignId, input.traceId ?? null, limit]
  );

  return traceResult.rows.map((trace) => ({
    id: trace.id,
    traceId: trace.trace_id,
    turnId: trace.turn_id ?? undefined,
    phase: trace.phase,
    elapsedMs: trace.elapsed_ms ?? undefined,
    createdAt: toIso(trace.created_at),
    ...eventPayload(trace.payload)
  }));
}

function createStatusError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
