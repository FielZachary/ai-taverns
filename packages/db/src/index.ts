import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import type { SessionId, UserId } from "@ai-dnd/domain";
import {
  eldermereMetadataProfile,
  eldermereRegions,
  formatEldermereOpeningPromptContext,
  formatNameDirectorPromptContext,
  formatEldermereTurnPromptContext,
  openingSceneRequest,
  parseDmContract,
  recoverDmContractAfterParseFailure,
  debugDmContractFailure,
  rollRequestDiagnostics,
  isEldermerePreset,
  buildMemoryUpdaterPrompt,
  buildRouterPrompt,
  contextCategories,
  formatRouterCurrentTurnInput,
  buildLivingWorldPressureEnginePrompt,
  jobPrompt,
  renderContextChunks,
  validateLivingWorldOutput,
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
  type DmNextInputNeeded,
  type DmJobName,
  type InputPolicy,
  type RouterContextKeys,
  type ValidatedRouterOutput
} from "@ai-dnd/dm";
import type {
  AiModelId,
  CampaignInvite,
  CampaignMode,
  CampaignSummary,
  DmStreamEvent,
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission,
  MechanicsSeed,
  MechanicsState,
  RoomSocketEvent,
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
const inviteTokenBytes = 32;

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

type CampaignSummaryRow = Omit<CampaignRow, "session_id"> & {
  session_id?: string;
  sessionId?: string;
  portrait_asset_id?: string | null;
  portrait_public_url?: string | null;
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
  portrait_asset_id?: string | null;
  portrait_public_url?: string | null;
  portrait_status?: "pending" | "ready" | "failed" | "deleted" | null;
};

export type MediaStorageProvider = "local" | "digitalocean_spaces" | "s3";

export type StoredMediaAssetObject = {
  storageProvider: MediaStorageProvider;
  bucket: string | null;
  objectKey: string;
  publicUrl: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
};

export type MediaAssetRow = {
  id: string;
  owner_user_id: string | null;
  campaign_id: string | null;
  player_id: string | null;
  kind: "character_portrait" | "campaign_cover" | "npc_portrait";
  status: "pending" | "ready" | "failed" | "deleted";
  storage_provider: MediaStorageProvider;
  bucket: string | null;
  object_key: string | null;
  public_url: string | null;
  content_type: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  provider: string | null;
  model: string | null;
  provider_request_id: string | null;
  generation_metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CharacterPortraitTarget = {
  campaignId: string;
  campaignTitle: string;
  campaignGenre: string | null;
  customWorldName: string | null;
  playerId: string;
  ownerUserId: string | null;
  username: string;
  characterName: string;
  characterSheet: string;
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

type CampaignInviteRow = {
  id: string;
  campaign_id: string;
  token_hash: string;
  enabled: boolean;
  max_uses: number | null;
  use_count: number;
  expires_at: Date | string | null;
  created_by_user_id: string;
  created_at: Date | string;
  disabled_at: Date | string | null;
  disabled_by_user_id: string | null;
};

type CampaignInvitePreviewRow = CampaignInviteRow & {
  campaign_title: string;
  campaign_status: CampaignStatus;
  campaign_mode: CampaignMode;
  campaign_has_begun: boolean;
  active_players: string | number;
};

type CampaignSettingSummary = {
  displayLocation?: string;
  worldName?: string;
  startingLocation?: string;
};

type CampaignOpeningStyle = {
  campaignGenre?: string | undefined;
  campaignGenrePresetId?: string | undefined;
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
  campaignFoundation?: Record<string, unknown> | undefined;
  forbiddenOpeningTerms: string[];
  narratorInstructions: string[];
  openingQualityChecks: string[];
};

function extractExistingPromptNames(...values: Array<string | undefined>) {
  return [
    ...new Set(
      values
        .flatMap((value) =>
          value?.match(/\b[A-Z][a-z]+(?:\s+(?:of|the|and|[A-Z][a-z]+)){0,3}\b/g) ??
          []
        )
        .map((name) => name.trim())
        .filter((name) => name.length >= 3)
    )
  ];
}

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
  nextInputNeeded: DmNextInputNeeded;
  resolutionMode: ResolutionMode;
  setting?: CampaignSettingSummary | undefined;
};

type InventoryPatchDiscard = {
  item: unknown;
  reasons: string[];
};

type InventoryPatchValidation = {
  accepted: Record<string, unknown>[];
  discarded: InventoryPatchDiscard[];
};

const currencyDenominations = ["PP", "GP", "EP", "SP", "CP"] as const;
type CurrencyDenomination = (typeof currencyDenominations)[number];

const currencyCopperValue: Record<CurrencyDenomination, number> = {
  PP: 1000,
  GP: 100,
  EP: 50,
  SP: 10,
  CP: 1
};

type EldermereOpeningPlannerDebug =
  NonNullable<AiDebugInfo["eldermereOpeningPlanner"]>;

type EldermereOpeningPlannerResult = {
  plan: EldermereOpeningPlan;
  debug: EldermereOpeningPlannerDebug;
};

type DmPromptContext = {
  instructions: string;
  message: string;
  jobNeeded?: DmJobName;
  sections: unknown[];
  budget: Record<string, unknown>;
  routerDebug?: NonNullable<AiDebugInfo["router"]>;
};

const dungeonMasterContractInstructions = [
  "You are the AI Taverns DnD Dungeon Master.",
  "Return exactly one valid JSON object. Do not use Markdown outside the JSON object; Markdown emphasis is allowed inside public_narration strings when the job guidance asks for it.",
  "Use public_narration for player-facing narration.",
  "Use roll_requests only for player-controlled dice the website must collect.",
  "In roll_requests, dice must be bare dice notation only, such as 1d20, 3d4, or 8d6. Do not include + or - modifiers in dice; put static bonuses or penalties in modifier. Example: Magic Missile uses dice \"3d4\" and modifier 3, not dice \"3d4+3\".",
  "Use mechanics_state_update for canonical game/mechanics state changes; the website owns persistence.",
  "Required top-level keys: public_narration, resolution_mode, roll_requests, next_input_needed, input_targets, input_policy, mechanics_state_update, inventory_state_update.",
  "Always include inventory_state_update. Use {\"patches\": []} when no inventory, equipment, or currency change is clearly resolved this turn."
].join("\n");

export type DungeonMasterRuntime = {
  askProvider(input: {
    message: string;
    instructions: string;
    history?: GameMessage[];
    currentPlayerAction?: string;
    dmJob?: DmJobName;
    model?: AiModelId;
    onPublicNarrationDelta?: (text: string) => void;
  }): Promise<DungeonMasterProviderResponse>;
  emitDmStreamEvent?(event: DmStreamEvent | RoomSocketEvent): void;
  buildPromptContext?(input: {
    campaignId: string;
    turnId?: string | undefined;
    currentAction: string;
    baseInstructions: string;
    model?: AiModelId;
  }): Promise<{
    instructions: string;
    message: string;
    jobNeeded?: DmJobName;
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

function generateInviteToken() {
  return randomBytes(inviteTokenBytes).toString("base64url");
}

function hashInviteToken(token: string) {
  return createHash("sha256")
    .update("ai-taverns-campaign-invite:")
    .update(token)
    .digest("hex");
}

function normalizeInviteToken(token: string | undefined) {
  return (token ?? "").trim();
}

function mapCampaignInviteRow(row: CampaignInviteRow): CampaignInvite {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    enabled: row.enabled,
    maxUses: row.max_uses,
    useCount: Number(row.use_count),
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    createdAt: toIso(row.created_at),
    disabledAt: row.disabled_at ? toIso(row.disabled_at) : null
  };
}

function eventPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedCurrencyDenomination(value: unknown): CurrencyDenomination | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, CurrencyDenomination> = {
    cp: "CP",
    copper: "CP",
    coppers: "CP",
    "copper piece": "CP",
    "copper pieces": "CP",
    sp: "SP",
    silver: "SP",
    silvers: "SP",
    "silver piece": "SP",
    "silver pieces": "SP",
    ep: "EP",
    electrum: "EP",
    "electrum piece": "EP",
    "electrum pieces": "EP",
    gp: "GP",
    gold: "GP",
    golds: "GP",
    "gold piece": "GP",
    "gold pieces": "GP",
    pp: "PP",
    platinum: "PP",
    "platinum piece": "PP",
    "platinum pieces": "PP"
  };

  return aliases[normalized] ?? null;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function reasonCurrencyDenomination(
  reason: unknown,
  delta: number
): CurrencyDenomination | null {
  if (typeof reason !== "string") {
    return null;
  }

  const normalized = reason.toLowerCase();
  const magnitude = Math.abs(delta);
  const amountPattern = Number.isInteger(magnitude)
    ? String(magnitude).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : null;
  const denominationPatterns: Array<[CurrencyDenomination, RegExp]> = [
    ["CP", /\b(?:cp|copper|coppers|copper pieces?)\b/i],
    ["SP", /\b(?:sp|silver|silvers|silver pieces?)\b/i],
    ["EP", /\b(?:ep|electrum|electrum pieces?)\b/i],
    ["GP", /\b(?:gp|gold|golds|gold pieces?)\b/i],
    ["PP", /\b(?:pp|platinum|platinum pieces?)\b/i]
  ];

  for (const [denomination, pattern] of denominationPatterns) {
    if (!pattern.test(normalized)) {
      continue;
    }

    if (!amountPattern || new RegExp(`\\b${amountPattern}\\b`).test(normalized)) {
      return denomination;
    }
  }

  return null;
}

function sectionHeadingPattern(sectionName: string) {
  return new RegExp(
    `(^|\\n)(#{1,6}\\s*)?${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`,
    "i"
  );
}

function replaceCharacterSheetSection(
  characterSheet: string,
  sectionName: string,
  lines: string[]
) {
  const normalized = characterSheet.replace(/\r\n/g, "\n");
  const heading = sectionHeadingPattern(sectionName).exec(normalized);
  const sectionText = lines.length > 0 ? lines.join("\n") : "None";

  if (!heading?.index && heading?.index !== 0) {
    const separator = normalized.trimEnd() ? "\n\n" : "";
    return `${normalized.trimEnd()}${separator}${sectionName}\n${sectionText}`;
  }

  const contentStart = heading.index + heading[0].length;
  const nextHeading = /\n(?:#{1,6}\s*)?[A-Z][A-Za-z/& -]{1,60}\s*\n/g;
  nextHeading.lastIndex = contentStart;
  const nextMatch = nextHeading.exec(normalized);
  const contentEnd = nextMatch?.index ?? normalized.length;

  return [
    normalized.slice(0, contentStart),
    sectionText,
    normalized.slice(contentEnd)
  ].join("");
}

function extractCharacterSheetSectionLines(
  characterSheet: string,
  sectionName: string
) {
  const normalized = characterSheet.replace(/\r\n/g, "\n");
  const heading = sectionHeadingPattern(sectionName).exec(normalized);

  if (!heading) {
    return [];
  }

  const contentStart = heading.index + heading[0].length;
  const nextHeading = /\n(?:#{1,6}\s*)?[A-Z][A-Za-z/& -]{1,60}\s*\n/g;
  nextHeading.lastIndex = contentStart;
  const nextMatch = nextHeading.exec(normalized);
  const contentEnd = nextMatch?.index ?? normalized.length;

  return normalized
    .slice(contentStart, contentEnd)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^none$/i.test(line));
}

function parseCurrencyLines(lines: string[]) {
  const amounts: Record<CurrencyDenomination, number> = {
    PP: 0,
    GP: 0,
    EP: 0,
    SP: 0,
    CP: 0
  };
  const passthrough: string[] = [];

  for (const line of lines) {
    const match =
      line.match(/^\s*(?:[-*]\s*)?(PP|GP|EP|SP|CP)\s*[:x-]?\s*(-?\d+)\s*$/i) ??
      line.match(/^\s*(?:[-*]\s*)?(-?\d+)\s+(PP|GP|EP|SP|CP)\s*$/i) ??
      line.match(/^\s*(?:[-*]\s*)?(-?\d+)\s+(platinum|gold|electrum|silver|copper)(?:\s+pieces?)?\s*$/i);

    if (!match) {
      passthrough.push(line);
      continue;
    }

    const firstValue = match[1];
    const secondValue = match[2];
    const firstIsAmount = typeof firstValue === "string" && /^-?\d+$/.test(firstValue);
    const denomination = normalizedCurrencyDenomination(
      firstIsAmount ? secondValue : firstValue
    );
    const amount = Number(firstIsAmount ? firstValue : secondValue);

    if (!denomination || !Number.isFinite(amount)) {
      passthrough.push(line);
      continue;
    }

    amounts[denomination] += amount;
  }

  return { amounts, passthrough };
}

function totalCopper(amounts: Record<CurrencyDenomination, number>) {
  return currencyDenominations.reduce(
    (sum, denomination) =>
      sum + amounts[denomination] * currencyCopperValue[denomination],
    0
  );
}

function currencyLinesFromCopper(
  total: number,
  passthrough: string[],
  options?: { includeElectrum?: boolean }
) {
  let remaining = total;
  const lines: string[] = [];
  const renderDenominations: CurrencyDenomination[] = options?.includeElectrum
    ? ["PP", "GP", "EP", "SP", "CP"]
    : ["PP", "GP", "SP", "CP"];

  for (const denomination of renderDenominations) {
    const value = currencyCopperValue[denomination];
    const amount = Math.floor(remaining / value);
    remaining -= amount * value;

    if (amount > 0) {
      lines.push(`${denomination}: ${amount}`);
    }
  }

  return [...lines, ...passthrough].length > 0 ? [...lines, ...passthrough] : ["None"];
}

function patchActorKeyMatchesPlayer(patchActorKey: unknown, player: PlayerRow) {
  if (typeof patchActorKey !== "string") {
    return false;
  }

  return (
    patchActorKey === actorKeyForPlayer(player.id) ||
    patchActorKey === `player:${player.client_id}` ||
    patchActorKey === player.client_id ||
    patchActorKey === player.id
  );
}

function normalizedInventoryOperation(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["gain", "gained", "add", "added", "receive", "received"].includes(normalized)) {
    return "add";
  }

  if (
    [
      "remove",
      "removed",
      "drop",
      "dropped",
      "lose",
      "lost",
      "consume",
      "consumed",
      "spend",
      "spent",
      "give",
      "gave",
      "trade",
      "traded"
    ].includes(normalized)
  ) {
    return "remove";
  }

  if (["equip", "equipped"].includes(normalized)) {
    return "equip";
  }

  if (["unequip", "unequipped", "stow", "stowed"].includes(normalized)) {
    return "unequip";
  }

  return null;
}

function inventoryItemName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseInventoryItemLine(line: string) {
  const trimmed = line.replace(/^\s*[-*]\s*/, "").trim();
  const suffixMatch = trimmed.match(/^(.+?)\s+x\s*(\d+)$/i);
  const prefixMatch = trimmed.match(/^(\d+)\s+x?\s+(.+)$/i);

  if (suffixMatch?.[1] && suffixMatch[2]) {
    return {
      name: suffixMatch[1].trim(),
      quantity: Number(suffixMatch[2])
    };
  }

  if (prefixMatch?.[1] && prefixMatch[2]) {
    return {
      name: prefixMatch[2].trim(),
      quantity: Number(prefixMatch[1])
    };
  }

  return { name: trimmed, quantity: 1 };
}

function formatInventoryItemLine(name: string, quantity: number) {
  return quantity > 1 ? `${name} x${quantity}` : name;
}

function adjustInventoryItemLines(
  lines: string[],
  itemName: string,
  delta: number
) {
  const nextLines = [...lines];
  const index = nextLines.findIndex(
    (line) =>
      parseInventoryItemLine(line).name.toLowerCase() === itemName.toLowerCase()
  );

  if (index < 0) {
    if (delta <= 0) {
      return { lines, changed: false };
    }

    return {
      lines: [...nextLines, formatInventoryItemLine(itemName, delta)],
      changed: true
    };
  }

  const parsed = parseInventoryItemLine(nextLines[index] ?? "");
  const nextQuantity = parsed.quantity + delta;

  if (nextQuantity < 0) {
    return { lines, changed: false };
  }

  if (nextQuantity === 0) {
    nextLines.splice(index, 1);
  } else {
    nextLines[index] = formatInventoryItemLine(parsed.name, nextQuantity);
  }

  return { lines: nextLines.length > 0 ? nextLines : ["None"], changed: true };
}

function inventoryPatchSummary(patch: Record<string, unknown>) {
  const type = eventPayloadString(patch.type).toLowerCase();

  if (type === "currency") {
    const currency = normalizedCurrencyDenomination(patch.currency);
    const delta = numberFromUnknown(patch.delta);

    if (!currency || typeof delta !== "number") {
      return "";
    }

    return `${delta > 0 ? "gained" : "spent"} ${Math.abs(delta)} ${currency}`;
  }

  if (type === "item") {
    const operation = normalizedInventoryOperation(patch.operation);
    const itemName = inventoryItemName(patch.item);
    const quantity = Math.max(1, Math.floor(numberFromUnknown(patch.quantity) ?? 1));

    if (!operation || !itemName) {
      return "";
    }

    const itemText =
      quantity > 1 || /^(?:a|an|the)\s+/i.test(itemName)
        ? `${quantity > 1 ? `${quantity} ` : ""}${itemName}`
        : `a ${itemName}`;
    const verb =
      operation === "add"
        ? "gained"
        : operation === "equip"
          ? "equipped"
          : operation === "unequip"
            ? "unequipped"
            : "dropped";

    return `${verb} ${itemText}`;
  }

  return "";
}

function inventoryUpdateSentence(patches: Record<string, unknown>[]) {
  const summaries = patches.map(inventoryPatchSummary).filter(Boolean);

  if (summaries.length === 0) {
    return "";
  }

  const joined =
    summaries.length === 1
      ? summaries[0]
      : `${summaries.slice(0, -1).join(", ")} and ${summaries.at(-1)}`;

  return `*(Inventory update: you ${joined}.)*`;
}

function narrationWithInventoryUpdate(
  publicNarration: string,
  appliedPatches: Record<string, unknown>[]
) {
  if (!appliedPatches.length || /\binventory update\s*:/i.test(publicNarration)) {
    return publicNarration;
  }

  const sentence = inventoryUpdateSentence(appliedPatches);
  return sentence ? `${publicNarration.trimEnd()}\n\n${sentence}` : publicNarration;
}

function validateInventoryPatches(
  patches: unknown[],
  players: PlayerRow[]
): InventoryPatchValidation {
  return patches.reduce<InventoryPatchValidation>(
    (result, patch) => {
      const reasons: string[] = [];
      const record = eventPayload(patch);
      const type = eventPayloadString(record.type).toLowerCase();
      const actorKey = record.actor_key ?? record.actorKey;

      if (!Object.keys(record).length) {
        reasons.push("patch must be an object");
      }

      if (!players.some((player) => patchActorKeyMatchesPlayer(actorKey, player))) {
        reasons.push("actor_key does not match an active player");
      }

      if (type !== "currency" && type !== "item") {
        reasons.push("type must be currency or item");
      }

      if (type === "currency") {
        const delta = numberFromUnknown(record.delta);

        if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
          reasons.push("currency delta must be a non-zero number");
        }

        const currency =
          reasonCurrencyDenomination(record.reason, delta ?? 0) ??
          normalizedCurrencyDenomination(record.currency);

        if (!currency) {
          reasons.push("currency denomination is invalid");
        }

        if (reasons.length > 0) {
          result.discarded.push({ item: patch, reasons });
        } else {
          result.accepted.push({
            ...record,
            type,
            actor_key: actorKey,
            currency,
            delta
          });
        }

        return result;
      }

      const operation = normalizedInventoryOperation(
        record.operation ?? record.action ?? record.verb
      );
      const itemName = inventoryItemName(record.item ?? record.name);
      const quantity = Math.max(1, Math.floor(numberFromUnknown(record.quantity) ?? 1));

      if (!operation) {
        reasons.push("item operation is invalid");
      }

      if (!itemName) {
        reasons.push("item name is required");
      }

      if (reasons.length > 0) {
        result.discarded.push({ item: patch, reasons });
      } else {
        result.accepted.push({
          ...record,
          type,
          actor_key: actorKey,
          operation,
          item: itemName,
          quantity
        });
      }

      return result;
    },
    { accepted: [], discarded: [] }
  );
}

async function applyAcceptedInventoryPatches(
  db: Queryable,
  players: PlayerRow[],
  patches: Record<string, unknown>[]
) {
  const sheetsByPlayerId = new Map(players.map((player) => [player.id, player.character_sheet]));
  const appliedPatches: Record<string, unknown>[] = [];

  for (const patch of patches) {
    const player = players.find((candidate) =>
      patchActorKeyMatchesPlayer(patch.actor_key ?? patch.actorKey, candidate)
    );

    if (!player) {
      continue;
    }

    if (patch.type === "currency") {
      const currency = normalizedCurrencyDenomination(patch.currency);
      const delta = numberFromUnknown(patch.delta);

      if (!currency || typeof delta !== "number") {
        continue;
      }

      const currentSheet = sheetsByPlayerId.get(player.id) ?? player.character_sheet;
      const currentLines = extractCharacterSheetSectionLines(currentSheet, "Currency");
      const parsed = parseCurrencyLines(currentLines);
      const nextTotal =
        totalCopper(parsed.amounts) + delta * currencyCopperValue[currency];

      if (nextTotal < 0) {
        continue;
      }

      const nextSheet = replaceCharacterSheetSection(
        currentSheet,
        "Currency",
        currencyLinesFromCopper(nextTotal, parsed.passthrough, {
          includeElectrum: parsed.amounts.EP > 0
        })
      );

      if (nextSheet === currentSheet) {
        continue;
      }

      sheetsByPlayerId.set(player.id, nextSheet);
      await db.query(
        `
          update players
          set character_sheet = $2,
            updated_at = now()
          where id = $1
        `,
        [player.id, nextSheet]
      );
      appliedPatches.push(patch);
      continue;
    }

    if (patch.type === "item") {
      const operation = normalizedInventoryOperation(patch.operation);
      const itemName = inventoryItemName(patch.item);
      const quantity = Math.max(1, Math.floor(numberFromUnknown(patch.quantity) ?? 1));

      if (!operation || !itemName) {
        continue;
      }

      const currentSheet = sheetsByPlayerId.get(player.id) ?? player.character_sheet;
      let inventoryLines = extractCharacterSheetSectionLines(currentSheet, "Inventory");
      let equipmentLines = extractCharacterSheetSectionLines(currentSheet, "Equipment");
      let itemChanged = false;

      if (operation === "add") {
        const adjusted = adjustInventoryItemLines(inventoryLines, itemName, quantity);
        inventoryLines = adjusted.lines;
        itemChanged = adjusted.changed;
      } else if (operation === "remove") {
        const adjustedInventory = adjustInventoryItemLines(
          inventoryLines,
          itemName,
          -quantity
        );

        if (adjustedInventory.changed) {
          inventoryLines = adjustedInventory.lines;
          itemChanged = true;
        } else {
          const adjustedEquipment = adjustInventoryItemLines(
            equipmentLines,
            itemName,
            -quantity
          );
          equipmentLines = adjustedEquipment.lines;
          itemChanged = adjustedEquipment.changed;
        }
      } else if (operation === "equip") {
        const removed = adjustInventoryItemLines(inventoryLines, itemName, -quantity);

        if (!removed.changed) {
          continue;
        }

        inventoryLines = removed.lines;
        equipmentLines = adjustInventoryItemLines(
          equipmentLines,
          itemName,
          quantity
        ).lines;
        itemChanged = true;
      } else if (operation === "unequip") {
        const removed = adjustInventoryItemLines(equipmentLines, itemName, -quantity);

        if (!removed.changed) {
          continue;
        }

        equipmentLines = removed.lines;
        inventoryLines = adjustInventoryItemLines(
          inventoryLines,
          itemName,
          quantity
        ).lines;
        itemChanged = true;
      }

      if (!itemChanged) {
        continue;
      }

      const nextSheet = replaceCharacterSheetSection(
        replaceCharacterSheetSection(currentSheet, "Inventory", inventoryLines),
        "Equipment",
        equipmentLines
      );

      if (nextSheet === currentSheet) {
        continue;
      }

      sheetsByPlayerId.set(player.id, nextSheet);
      await db.query(
        `
          update players
          set character_sheet = $2,
            updated_at = now()
          where id = $1
        `,
        [player.id, nextSheet]
      );
      appliedPatches.push(patch);
    }
  }

  return appliedPatches;
}

function campaignWorldName(campaign: Pick<CampaignRow, "metadata" | "title">) {
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
    campaignGenrePresetId: eventPayloadString(genre.presetId),
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
  campaign: CampaignSummaryRow
): CampaignSummary {
  const characterName = campaign.display_character_name?.trim();
  const playerName = campaign.display_username?.trim();
  const joinCode = campaign.join_code?.trim();
  const sessionId = (campaign.session_id ?? campaign.sessionId)?.trim();

  if (!sessionId) {
    throw new Error("Campaign summary row is missing session_id.");
  }

  return {
    id: campaign.id,
    sessionId,
    mode: campaign.mode,
    title: characterName || playerName || campaign.title,
    ...(campaign.owner_client_id ? { ownerClientId: campaign.owner_client_id } : {}),
    ...(campaign.portrait_asset_id
      ? { portraitAssetId: campaign.portrait_asset_id }
      : {}),
    ...(campaign.portrait_public_url
      ? { portraitUrl: campaign.portrait_public_url }
      : {}),
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

export async function getCharacterPortraitTargetForUser(
  db: Queryable,
  input: {
    campaignId: string;
    userId: string;
  }
): Promise<CharacterPortraitTarget> {
  const result = await db.query<
    PlayerRow & {
      campaign_title: string;
      campaign_metadata: unknown;
      campaign_owner_user_id: string | null;
    }
  >(
    `
      select
        players.*,
        campaigns.title as campaign_title,
        campaigns.metadata as campaign_metadata,
        campaigns.owner_user_id as campaign_owner_user_id
      from players
      join campaigns on campaigns.id = players.campaign_id
      where players.campaign_id = $1
        and players.user_id = $2
        and players.status = 'active'
        and campaigns.status = 'active'
      order by players.slot asc nulls last, players.created_at asc
      limit 1
    `,
    [input.campaignId, input.userId]
  );
  const player = requireRow(
    result.rows[0],
    "No active character was found for portrait generation."
  );
  const metadata = eventPayload(player.campaign_metadata);
  const genre = eventPayload(metadata.genre);

  return {
    campaignId: player.campaign_id,
    campaignTitle: player.campaign_title,
    campaignGenre: typeof genre.label === "string" ? genre.label : null,
    customWorldName:
      typeof genre.customWorldName === "string" ? genre.customWorldName : null,
    playerId: player.id,
    ownerUserId: player.campaign_owner_user_id,
    username: player.username,
    characterName: player.character_name,
    characterSheet: player.character_sheet
  };
}

export async function createPendingCharacterPortraitAsset(
  db: Queryable,
  input: {
    ownerUserId: string | null;
    campaignId: string;
    playerId: string;
    storageProvider: MediaStorageProvider;
    prompt: string;
    negativePrompt: string;
    provider: string;
    model: string;
  }
): Promise<MediaAssetRow> {
  const result = await db.query<MediaAssetRow>(
    `
      insert into media_assets (
        owner_user_id,
        campaign_id,
        player_id,
        kind,
        status,
        storage_provider,
        prompt,
        negative_prompt,
        provider,
        model
      )
      values ($1, $2, $3, 'character_portrait', 'pending', $4, $5, $6, $7, $8)
      returning *
    `,
    [
      input.ownerUserId,
      input.campaignId,
      input.playerId,
      input.storageProvider,
      input.prompt,
      input.negativePrompt,
      input.provider,
      input.model
    ]
  );

  return requireRow(result.rows[0], "Failed to create media asset.");
}

export async function markCharacterPortraitAssetReady(
  db: Queryable,
  input: {
    assetId: string;
    playerId: string;
    displayObject: StoredMediaAssetObject;
    providerRequestId: string | null;
    generationMetadata: Record<string, unknown>;
  }
): Promise<MediaAssetRow> {
  const updated = await db.query<MediaAssetRow>(
    `
      update media_assets
      set status = 'ready',
          storage_provider = $2,
          bucket = $3,
          object_key = $4,
          public_url = $5,
          content_type = $6,
          byte_size = $7,
          width = $8,
          height = $9,
          sha256 = $10,
          provider_request_id = $11,
          generation_metadata = $12::jsonb
      where id = $1
      returning *
    `,
    [
      input.assetId,
      input.displayObject.storageProvider,
      input.displayObject.bucket,
      input.displayObject.objectKey,
      input.displayObject.publicUrl,
      input.displayObject.contentType,
      input.displayObject.byteSize,
      input.displayObject.width,
      input.displayObject.height,
      input.displayObject.sha256,
      input.providerRequestId,
      JSON.stringify(input.generationMetadata)
    ]
  );
  const asset = requireRow(
    updated.rows[0],
    "Failed to mark media asset ready."
  );

  await db.query(
    `
      update players
      set portrait_asset_id = $1
      where id = $2
    `,
    [asset.id, input.playerId]
  );

  if (asset.campaign_id) {
    await logCampaignEvent(db, asset.campaign_id, "media_asset_ready", {
      mediaAssetId: asset.id,
      playerId: input.playerId,
      kind: asset.kind,
      status: asset.status
    });
  }

  return asset;
}

export async function markCharacterPortraitAssetFailed(
  db: Queryable,
  input: {
    assetId: string;
    errorMessage: string;
    generationMetadata?: Record<string, unknown> | undefined;
  }
): Promise<void> {
  await db.query(
    `
      update media_assets
      set status = 'failed',
          generation_metadata = $2::jsonb
      where id = $1
    `,
    [
      input.assetId,
      JSON.stringify({
        ...(input.generationMetadata ?? {}),
        error: input.errorMessage
      })
    ]
  );
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
        campaigns.session_id as "sessionId",
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
        campaigns.session_id as "sessionId",
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

export type CampaignNpcCard = {
  id: string;
  title: string;
  markdown: string;
  updatedAt?: string;
};

export async function listPlayerSafeNpcCardsForCampaign(
  db: Queryable,
  campaignId: string
): Promise<CampaignNpcCard[]> {
  try {
    const result = await db.query<Record<string, unknown>>(
      `
        select
          context_key,
          title,
          body_markdown,
          updated_at
        from campaign_context_chunks
        where campaign_id = $1
          and category = 'npc_context'
          and archived_at is null
        order by priority desc, updated_at desc
        limit 120
      `,
      [campaignId]
    );

    return result.rows.map((row) => {
      const updatedAt = row.updated_at
        ? toIso(row.updated_at as Date | string)
        : undefined;

      return {
        id: String(row.context_key ?? ""),
        title: String(row.title ?? row.context_key ?? "NPC"),
        markdown: String(row.body_markdown ?? ""),
        ...(updatedAt ? { updatedAt } : {})
      };
    });
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return [];
  }
}

export async function updatePlayerSafeNpcCardMarkdown(
  db: Queryable,
  input: {
    campaignId: string;
    npcCardId: string;
    markdown: string;
  }
): Promise<CampaignNpcCard> {
  const result = await db.query<Record<string, unknown>>(
    `
      update campaign_context_chunks
      set body_markdown = $3,
          title = $4,
          updated_at = now()
      where campaign_id = $1
        and context_key = $2
        and category = 'npc_context'
        and archived_at is null
      returning context_key, title, body_markdown, updated_at
    `,
    [
      input.campaignId,
      input.npcCardId,
      input.markdown,
      input.markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || input.npcCardId
    ]
  );
  const row = result.rows[0];

  if (!row) {
    throw createStatusError(404, "NPC card not found.");
  }

  const updatedAt = row.updated_at
    ? toIso(row.updated_at as Date | string)
    : undefined;

  return {
    id: String(row.context_key ?? ""),
    title: String(row.title ?? row.context_key ?? "NPC"),
    markdown: String(row.body_markdown ?? ""),
    ...(updatedAt ? { updatedAt } : {})
  };
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
    eldermereStart?: EldermereCampaignStart | undefined;
    userId: string;
    runtime?: DungeonMasterRuntime | undefined;
    openingResolutionMode?: "await" | "background" | undefined;
  }
): Promise<CampaignSummary> {
  const sessionId = `ai-dnd-${randomUUID()}`;
  const eldermereStart = isEldermerePreset(input.campaignGenrePresetId)
    ? input.eldermereStart ?? randomEldermereCampaignStart()
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
      campaignGenrePresetId: input.campaignGenrePresetId,
      campaignGenrePromptBrief: input.campaignGenrePromptBrief,
      customWorldName: input.customWorldName,
      customWorldDescription: input.customWorldDescription
    }
  });

  const resolveOpening = async () => {
    let foundationCompilerPromise:
      | Promise<ContextStorageDebugState | undefined>
      | undefined;
    const opening = hasEldermereWorldProfile(createdState.campaign)
      ? await (async () => {
          const plan = await askEldermereOpeningPlanner(
            db,
            runtime,
            createdState.campaign,
            openingRequest,
            openingTurn.id
          );
          await persistEldermereOpeningPlan(
            db,
            createdState.campaign.id,
            plan.plan
          );
          foundationCompilerPromise = runEldermereCampaignFoundationCompiler(
            db,
            runtime,
            {
              campaign: createdState.campaign,
              openingRequest,
              plan: plan.plan,
              turnId: openingTurn.id
            }
          );

          const opening = await askEldermereOpeningNarrator(
            db,
            runtime,
            createdState.campaign,
            openingRequest,
            openingSceneInstructions("single_player"),
            plan.plan,
            openingTurn.id,
            { allowResolvedCombatWithoutRolls: true }
          );

          return {
            ...opening,
            debug: {
              ...opening.debug,
              eldermereOpeningPlanner: plan.debug
            }
          };
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
      nextInputNeeded: opening.nextInputNeeded,
      resolutionMode: opening.resolutionMode,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    const foundationContextStorageState = await foundationCompilerPromise;

    if (foundationContextStorageState) {
      await attachContextStorageStateToDmEventDebug(db, {
        campaignId: createdState.campaign.id,
        dmEventId: resolvedTurn.dmEventId,
        contextStorageState: foundationContextStorageState
      });

      runtime.emitDmStreamEvent?.({
        type: "room_updated",
        roomId: createdState.campaign.id,
        updatedAt: foundationContextStorageState.capturedAt,
        eventId: resolvedTurn.dmEventId
      });
    }

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
  };

  if (input.openingResolutionMode === "background") {
    void resolveOpening().catch(async (error) => {
      await markTurnFailed(db, openingTurn.id, error);
      await logCampaignEvent(db, createdState.campaign.id, "turn_failed", {
        turnId: openingTurn.id,
        error:
          error instanceof Error ? error.message : "DM provider call failed.",
        reason: "background_opening_failed"
      });
    });

    return createdState.summary;
  }

  try {
    return await resolveOpening();
  } catch (error) {
    await markTurnFailed(db, openingTurn.id, error);
    throw error;
  }
}

function characterSheetWithBackstory(characterSheet: string, backstory: string) {
  const normalizedSheet = characterSheet.replace(/\r\n/g, "\n").trim();
  const trimmedBackstory = compactPromptText(backstory);
  const backstorySection = `Backstory\n${trimmedBackstory}`;
  const labelledBackstoryPattern =
    /(^|\n)(?:#{1,6}\s*)?Backstory\s*\n[\s\S]*?(?=\n(?:#{1,6}\s*)?(?:Backstory Expansion|Core Stats|Ability Scores|Saving Throws|Skills|Proficiencies and Languages|Attacks|Features and Traits|Equipment|Inventory|Currency|Spells|DM Brief|Level Progression|Appearance)\b|$)/i;
  const inlineBackstoryPattern =
    /(^|\n)(?:Backstory|Background)\s*:\s*([^\n]+(?:\n(?![A-Z][A-Za-z ]+:\s).+)*)/i;

  if (labelledBackstoryPattern.test(normalizedSheet)) {
    return normalizedSheet.replace(
      labelledBackstoryPattern,
      (match, prefix: string) => {
        const endsAtDocument = normalizedSheet.endsWith(match);
        return `${prefix}${backstorySection}${endsAtDocument ? "" : "\n"}`;
      }
    );
  }

  if (inlineBackstoryPattern.test(normalizedSheet)) {
    return normalizedSheet.replace(
      inlineBackstoryPattern,
      (_match, prefix: string) => `${prefix}${backstorySection}`
    );
  }

  return [normalizedSheet, "", backstorySection].filter(Boolean).join("\n");
}

export async function restartSinglePlayerCampaignForUser(
  db: pg.Pool,
  input: {
    campaignId: string;
    backstory: string;
    userId: string;
    runtime: DungeonMasterRuntime;
    restartTraceId?: string | undefined;
  }
): Promise<CampaignSummary> {
  const restartTraceId = input.restartTraceId ?? randomUUID();
  const trimmedBackstory = input.backstory.trim();

  if (!trimmedBackstory) {
    throw createStatusError(400, "Write a backstory before restarting.");
  }

  async function logRestartEvent(
    campaignId: string,
    stage: string,
    payload: Record<string, unknown> = {}
  ) {
    try {
      await logCampaignEvent(db, campaignId, "campaign_restart_diagnostic", {
        restartTraceId,
        stage,
        ...payload
      });
    } catch {
      // Diagnostic logging must never be the reason restart fails.
    }
  }

  await logRestartEvent(input.campaignId, "request_received", {
    userId: input.userId,
    backstoryLength: trimmedBackstory.length
  });

  const source = await withTransaction(db, async (client) => {
    const campaign = (
      await client.query<CampaignRow>(
        `
          select *
          from campaigns
          where id = $1 and status = 'active'
          limit 1
          for update
        `,
        [input.campaignId]
      )
    ).rows[0];

    if (!campaign) {
      throw createStatusError(404, "Campaign not found.");
    }

    await logCampaignEvent(client, campaign.id, "campaign_restart_diagnostic", {
      restartTraceId,
      stage: "source_campaign_loaded",
      mode: campaign.mode,
      hasBegun: campaign.has_begun,
      ownerUserMatches: campaign.owner_user_id === input.userId,
      metadataKeys:
        campaign.metadata && typeof campaign.metadata === "object"
          ? Object.keys(campaign.metadata as Record<string, unknown>).sort()
          : []
    });

    await assertCampaignAccessForUser(client, campaign, input.userId);

    await logCampaignEvent(client, campaign.id, "campaign_restart_diagnostic", {
      restartTraceId,
      stage: "access_confirmed",
      userId: input.userId
    });

    if (campaign.mode !== "single_player") {
      await logCampaignEvent(client, campaign.id, "campaign_restart_diagnostic", {
        restartTraceId,
        stage: "rejected_non_singleplayer",
        mode: campaign.mode
      });
      throw createStatusError(
        400,
        "Campaign restart is available for singleplayer adventures."
      );
    }

    const player = (
      await client.query<
        PlayerRow & {
          portrait_public_url?: string | null;
        }
      >(
        `
          select
            players.*,
            media_assets.public_url as portrait_public_url
          from players
          left join media_assets
            on media_assets.id = players.portrait_asset_id
           and media_assets.status = 'ready'
          where players.campaign_id = $1
            and players.user_id = $2
            and players.status = 'active'
          order by players.slot asc nulls last, players.created_at asc
          limit 1
        `,
        [campaign.id, input.userId]
      )
    ).rows[0];

    if (!player || !isProfileComplete(player)) {
      await logCampaignEvent(client, campaign.id, "campaign_restart_diagnostic", {
        restartTraceId,
        stage: "rejected_incomplete_character",
        hasPlayer: Boolean(player),
        hasCharacterName: Boolean(player?.character_name?.trim()),
        hasCharacterSheet: Boolean(player?.character_sheet?.trim()),
        hasUsername: Boolean(player?.username?.trim())
      });
      throw createStatusError(400, "A complete character is required to restart.");
    }

    await logCampaignEvent(client, campaign.id, "campaign_restart_diagnostic", {
      restartTraceId,
      stage: "source_player_loaded",
      playerId: player.id,
      clientId: player.client_id,
      characterName: player.character_name,
      characterSheetLength: player.character_sheet.length,
      hasPortraitAsset: Boolean(player.portrait_asset_id),
      hasPortraitUrl: Boolean(player.portrait_public_url)
    });

    return { campaign, player };
  });

  const style = campaignOpeningStyleFromMetadata(source.campaign);
  const metadata = eventPayload(source.campaign.metadata);
  const genre = eventPayload(metadata.genre);
  const eldermereStart = eldermereCampaignStartFromMetadata(source.campaign);
  const restartedCharacterSheet = characterSheetWithBackstory(
    source.player.character_sheet,
    trimmedBackstory
  );

  await logRestartEvent(source.campaign.id, "create_campaign_started", {
    genreKind: genre.kind === "custom" ? "custom" : "preset",
    campaignGenre: style.campaignGenre ?? null,
    campaignGenrePresetId: style.campaignGenrePresetId ?? null,
    hasCampaignGenrePromptBrief: Boolean(style.campaignGenrePromptBrief),
    customWorldName: style.customWorldName ?? null,
    hasCustomWorldDescription: Boolean(style.customWorldDescription),
    eldermereStartRegion: eldermereStart?.region.name ?? null,
    eldermereStartSettlement: eldermereStart?.settlement.name ?? null,
    sourceCharacterSheetLength: source.player.character_sheet.length,
    restartedCharacterSheetLength: restartedCharacterSheet.length,
    backstoryLength: trimmedBackstory.length
  });

  let restarted: CampaignSummary;

  try {
    restarted = await createCampaignForMode(db, {
      mode: "single_player",
      title: source.campaign.title,
      campaignGenre: style.campaignGenre,
      campaignGenreKind: genre.kind === "custom" ? "custom" : "preset",
      campaignGenrePresetId: style.campaignGenrePresetId,
      campaignGenrePromptBrief: style.campaignGenrePromptBrief,
      customWorldName: style.customWorldName,
      customWorldDescription: style.customWorldDescription,
      ownerClientId: source.player.client_id,
      playerName: source.player.username,
      characterName: source.player.character_name,
      characterSheet: restartedCharacterSheet,
      eldermereStart,
      userId: input.userId,
      runtime: input.runtime,
      openingResolutionMode: "background"
    });
  } catch (error) {
    await logRestartEvent(source.campaign.id, "create_campaign_failed", {
      error: errorSummary(error)
    });
    throw error;
  }

  await logRestartEvent(source.campaign.id, "create_campaign_completed", {
    restartedCampaignId: restarted.id,
    restartedSessionId: restarted.sessionId,
    restartedTitle: restarted.title,
    openingResolutionMode: "background"
  });
  await logRestartEvent(restarted.id, "created_from_restart", {
    sourceCampaignId: source.campaign.id,
    sourcePlayerId: source.player.id,
    sourcePortraitAssetId: source.player.portrait_asset_id ?? null
  });

  if (source.player.portrait_asset_id) {
    await logRestartEvent(restarted.id, "portrait_copy_started", {
      sourceCampaignId: source.campaign.id,
      portraitAssetId: source.player.portrait_asset_id
    });
    await db.query(
      `
        update players
        set portrait_asset_id = $2
        where campaign_id = $1
          and user_id = $3
          and status = 'active'
      `,
      [restarted.id, source.player.portrait_asset_id, input.userId]
    );
    await logRestartEvent(restarted.id, "portrait_copy_completed", {
      sourceCampaignId: source.campaign.id,
      portraitAssetId: source.player.portrait_asset_id,
      hasPortraitUrl: Boolean(source.player.portrait_public_url)
    });

    return {
      ...restarted,
      portraitAssetId: source.player.portrait_asset_id,
      ...(source.player.portrait_public_url
        ? { portraitUrl: source.player.portrait_public_url }
        : {})
    };
  }

  await logRestartEvent(restarted.id, "completed_without_portrait", {
    sourceCampaignId: source.campaign.id
  });

  return restarted;
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

  if (campaign.has_begun) {
    throw createStatusError(409, "That adventure has already begun.");
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

    if (campaignRow.has_begun) {
      throw createStatusError(409, "That adventure has already begun.");
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

export async function createCampaignInvite(
  db: pg.Pool,
  input: {
    campaignId: string;
    userId: string;
    maxUses?: number | null | undefined;
    expiresAt?: string | null | undefined;
  }
) {
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw createStatusError(400, "Invite expiration is invalid.");
  }

  if (expiresAt && expiresAt <= new Date()) {
    throw createStatusError(400, "Invite expiration must be in the future.");
  }

  if (input.maxUses !== undefined && input.maxUses !== null && input.maxUses <= 0) {
    throw createStatusError(400, "Invite max uses must be greater than zero.");
  }

  const { invite, token } = await withTransaction(db, async (client) => {
    const campaignResult = await client.query<CampaignRow>(
      `
        select *
        from campaigns
        where id = $1 and status = 'active'
        limit 1
        for update
      `,
      [input.campaignId]
    );
    const campaign = campaignResult.rows[0];

    if (!campaign) {
      throw createStatusError(404, "Campaign not found.");
    }

    if (campaign.owner_user_id !== input.userId) {
      throw createStatusError(403, "Only the campaign owner can manage invites.");
    }

    if (campaign.mode !== "multiplayer") {
      throw createStatusError(400, "Only multiplayer campaigns can invite players.");
    }

    if (campaign.has_begun) {
      throw createStatusError(409, "That adventure has already begun.");
    }

    const token = generateInviteToken();
    const inserted = await client.query<CampaignInviteRow>(
      `
        insert into campaign_invites (
          campaign_id,
          token_hash,
          max_uses,
          expires_at,
          created_by_user_id
        )
        values ($1, $2, $3, $4, $5)
        returning *
      `,
      [
        input.campaignId,
        hashInviteToken(token),
        input.maxUses ?? null,
        expiresAt,
        input.userId
      ]
    );
    const invite = requireRow(inserted.rows[0], "Failed to create invite.");

    await logCampaignEvent(client, input.campaignId, "invite_created", {
      inviteId: invite.id,
      maxUses: invite.max_uses,
      expiresAt: invite.expires_at ? toIso(invite.expires_at) : null
    });

    return { invite, token };
  });

  return {
    invite: {
      ...mapCampaignInviteRow(invite),
      token
    }
  };
}

export async function listCampaignInvitesForOwner(
  db: Queryable,
  input: {
    campaignId: string;
    userId: string;
  }
): Promise<CampaignInvite[]> {
  const campaignResult = await db.query<CampaignRow>(
    `
      select *
      from campaigns
      where id = $1 and status <> 'deleted'
      limit 1
    `,
    [input.campaignId]
  );
  const campaign = campaignResult.rows[0];

  if (!campaign) {
    throw createStatusError(404, "Campaign not found.");
  }

  if (campaign.owner_user_id !== input.userId) {
    throw createStatusError(403, "Only the campaign owner can manage invites.");
  }

  const result = await db.query<CampaignInviteRow>(
    `
      select *
      from campaign_invites
      where campaign_id = $1
      order by created_at desc
      limit 20
    `,
    [input.campaignId]
  );

  return result.rows.map(mapCampaignInviteRow);
}

export async function disableCampaignInvite(
  db: pg.Pool,
  input: {
    campaignId: string;
    inviteId: string;
    userId: string;
  }
): Promise<CampaignInvite> {
  return withTransaction(db, async (client) => {
    const campaignResult = await client.query<CampaignRow>(
      `
        select *
        from campaigns
        where id = $1 and status <> 'deleted'
        limit 1
        for update
      `,
      [input.campaignId]
    );
    const campaign = campaignResult.rows[0];

    if (!campaign) {
      throw createStatusError(404, "Campaign not found.");
    }

    if (campaign.owner_user_id !== input.userId) {
      throw createStatusError(403, "Only the campaign owner can manage invites.");
    }

    const result = await client.query<CampaignInviteRow>(
      `
        update campaign_invites
        set enabled = false,
            disabled_at = coalesce(disabled_at, now()),
            disabled_by_user_id = $3
        where id = $1 and campaign_id = $2
        returning *
      `,
      [input.inviteId, input.campaignId, input.userId]
    );
    const invite = result.rows[0];

    if (!invite) {
      throw createStatusError(404, "Invite not found.");
    }

    await logCampaignEvent(client, input.campaignId, "invite_disabled", {
      inviteId: input.inviteId
    });

    return mapCampaignInviteRow(invite);
  });
}

function assertInviteCanJoin(invite: CampaignInvitePreviewRow) {
  if (
    !invite.enabled ||
    invite.campaign_status !== "active" ||
    invite.campaign_mode !== "multiplayer"
  ) {
    throw createStatusError(404, "That invite was not found.");
  }

  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    throw createStatusError(410, "That invite has expired.");
  }

  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    throw createStatusError(409, "That invite has already been used.");
  }

  if (invite.campaign_has_begun) {
    throw createStatusError(409, "That adventure has already begun.");
  }

  const activePlayers = Number(invite.active_players);

  if (activePlayers >= maxPlayers) {
    throw createStatusError(409, "That game is already full.");
  }
}

async function findLobbyInviteForToken(
  db: Queryable,
  token: string,
  lockCampaign = false
) {
  const normalizedToken = normalizeInviteToken(token);

  if (!normalizedToken) {
    throw createStatusError(404, "That invite was not found.");
  }

  const result = await db.query<CampaignInvitePreviewRow>(
    `
      select
        campaign_invites.*,
        campaigns.title as campaign_title,
        campaigns.status as campaign_status,
        campaigns.mode as campaign_mode,
        campaigns.has_begun as campaign_has_begun,
        0 as active_players
      from campaign_invites
      join campaigns on campaigns.id = campaign_invites.campaign_id
      where campaign_invites.token_hash = $1
        and campaign_invites.enabled = true
      limit 1
      ${lockCampaign ? "for update of campaigns, campaign_invites" : ""}
    `,
    [hashInviteToken(normalizedToken)]
  );
  const invite = result.rows[0];

  if (!invite) {
    throw createStatusError(404, "That invite was not found.");
  }

  assertInviteCanJoin(invite);

  const activePlayers = await db.query<{ active_players: string | number }>(
    `
      select count(*) as active_players
      from players
      where campaign_id = $1 and status = 'active'
    `,
    [invite.campaign_id]
  );

  invite.active_players = activePlayers.rows[0]?.active_players ?? 0;
  assertInviteCanJoin(invite);

  return invite;
}

export async function previewLobbyInvite(db: Queryable, token: string) {
  const invite = await findLobbyInviteForToken(db, token);
  const activePlayers = Number(invite.active_players);

  return {
    campaignTitle: invite.campaign_title,
    availableSlots: Math.max(0, maxPlayers - activePlayers),
    expiresAt: invite.expires_at ? toIso(invite.expires_at) : null
  };
}

export async function joinCampaignByInvite(
  db: pg.Pool,
  input: {
    token: string;
    clientId: string;
    username: string;
    characterName: string;
    characterSheet: string;
    mechanicsSeed?: MechanicsSeed | undefined;
    userId: string;
  }
): Promise<CampaignSummary> {
  const clientId = input.clientId.trim();
  const username = input.username.trim();
  const characterName = input.characterName.trim();
  const characterSheet = input.characterSheet.trim();

  if (!clientId || !username || !characterName || !characterSheet) {
    throw createStatusError(400, "Complete your player profile before joining.");
  }

  const { campaign, player } = await withTransaction(db, async (client) => {
    const invite = await findLobbyInviteForToken(client, input.token, true);
    const campaignResult = await client.query<CampaignRow>(
      `
        select *
        from campaigns
        where id = $1 and status = 'active' and mode = 'multiplayer'
        limit 1
      `,
      [invite.campaign_id]
    );
    const campaignRow = requireRow(
      campaignResult.rows[0],
      "Campaign not found."
    );

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
      await addOrReplacePlayerMechanicsActor(client, {
        campaign: campaignRow,
        playerId: userPlayer.id,
        characterName,
        characterSheet,
        seed: input.mechanicsSeed
      });
      await logCampaignEvent(
        client,
        campaignRow.id,
        "player_profile_updated_by_invite",
        {
          inviteId: invite.id,
          clientId,
          username,
          characterName,
          slot
        }
      );

      return { campaign: campaignRow, player: userPlayer };
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
        returning *
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
    const joinedPlayer = requireRow(
      insertedPlayer.rows[0],
      "Failed to join campaign."
    );

    await addOrReplacePlayerMechanicsActor(client, {
      campaign: campaignRow,
      playerId: joinedPlayer.id,
      characterName,
      characterSheet,
      seed: input.mechanicsSeed
    });
    await client.query(
      `
        update campaign_invites
        set use_count = use_count + 1
        where id = $1
      `,
      [invite.id]
    );
    await client.query(
      `
        insert into campaign_invite_uses (
          invite_id,
          campaign_id,
          joined_user_id,
          player_id
        )
        values ($1, $2, $3, $4)
      `,
      [invite.id, campaignRow.id, input.userId, joinedPlayer.id]
    );
    await logCampaignEvent(client, campaignRow.id, "player_joined_by_invite", {
      inviteId: invite.id,
      clientId,
      username,
      characterName,
      slot
    });

    return { campaign: campaignRow, player: joinedPlayer };
  });

  return mapCampaignSummaryRow({
    ...campaign,
    display_character_name: player.character_name,
    display_username: player.username,
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

function titleCaseIdentifier(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferredRollRequestPlayer(label: string, id = "") {
  const initiativeMatch = label.match(/^initiative\s*\(([^)]+)\)$/i);
  const initiativeTarget = initiativeMatch?.[1]?.trim();

  if (initiativeTarget) {
    return initiativeTarget;
  }

  const rollIdTargetMatch = id.match(
    /^([a-z][a-z0-9_-]*?)-(?:strength|dexterity|constitution|intelligence|wisdom|charisma|athletics|acrobatics|sleight|stealth|arcana|history|investigation|nature|religion|animal|insight|medicine|perception|survival|deception|intimidation|performance|persuasion|initiative|death|concentration|saving|save|check)\b/i
  );
  const rollIdTarget = rollIdTargetMatch?.[1]?.trim();

  return rollIdTarget ? titleCaseIdentifier(rollIdTarget) : "";
}

function normalizeDiceAndModifier(dice: string, modifier: number | undefined) {
  const match = dice.trim().match(/^(\d*d(?:4|6|8|10|12|20))\s*([+-])\s*(\d+)$/i);

  if (!match) {
    return { dice, modifier };
  }

  const diceModifier =
    (match[2] === "-" ? -1 : 1) * Number.parseInt(match[3] ?? "0", 10);
  const combinedModifier = (modifier ?? 0) + diceModifier;

  return {
    dice: match[1]?.toLowerCase() ?? dice,
    modifier: combinedModifier === 0 ? undefined : combinedModifier
  };
}

function normalizeRollRequest(value: unknown): DiceRollRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const rawDice = typeof candidate.dice === "string" ? candidate.dice.trim() : "";
  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";

  if (!rawDice || !label) {
    return null;
  }

  const rawModifier = Number(candidate.modifier);
  const { dice, modifier } = normalizeDiceAndModifier(
    rawDice,
    Number.isFinite(rawModifier) ? rawModifier : undefined
  );
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

  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : randomUUID();

  return {
    id,
    player:
      typeof candidate.player === "string" && candidate.player.trim()
        ? candidate.player.trim()
        : inferredRollRequestPlayer(label, id) || undefined,
    dice,
    modifier,
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

function nextInputNeededFromCampaign(campaign: CampaignRow): DmNextInputNeeded {
  const metadata = eventPayload(campaign.metadata);
  const value = metadata.nextInputNeeded;

  if (
    value === "player_actions" ||
    value === "dice_results" ||
    value === "clarification"
  ) {
    return value;
  }

  return pendingRollRequestsFromCampaign(campaign).length > 0
    ? "dice_results"
    : "player_actions";
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
  player?: PlayerRow,
  inputControl?: {
    inputTargets: string[];
    inputPolicy: "all_players" | "only_targeted_players";
    isExplicitBroadInput: boolean;
  }
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

  const isBroadSingleRoll =
    pendingRollRequests.length === 1 &&
    submittedRolls.length === 1 &&
    inputControl?.isExplicitBroadInput === true &&
    inputControl?.inputPolicy !== "only_targeted_players" &&
    inputControl?.inputTargets.length === 0;

  const content = submittedRolls
    .map((submission, index) => {
      const pendingRollRequest = pendingRollRequests[index];

      if (!submission.rollRequestId) {
        throw createStatusError(400, "A roll request id is required.");
      }

      if (!pendingRollRequest || submission.rollRequestId !== pendingRollRequest.id) {
        throw createStatusError(409, "The DM is waiting for the required roll.");
      }

      if (
        player &&
        !isBroadSingleRoll &&
        !rollRequestTargetsPlayer(pendingRollRequest, player)
      ) {
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
  const portraitStatus =
    player.portrait_status === "pending" ||
    player.portrait_status === "ready" ||
    player.portrait_status === "failed"
      ? player.portrait_status
      : undefined;

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
    lastSeenAt: toIso(player.last_seen_at),
    ...(player.portrait_asset_id
      ? { portraitAssetId: player.portrait_asset_id }
      : {}),
    ...(player.portrait_public_url
      ? { portraitUrl: player.portrait_public_url }
      : {}),
    ...(portraitStatus ? { portraitStatus } : {})
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
      select
        players.*,
        media_assets.id as portrait_asset_id,
        media_assets.public_url as portrait_public_url,
        coalesce(media_assets.status, latest_portrait.status) as portrait_status
      from players
      left join media_assets
        on media_assets.id = players.portrait_asset_id
       and media_assets.status = 'ready'
      left join lateral (
        select status
        from media_assets
        where media_assets.player_id = players.id
          and media_assets.kind = 'character_portrait'
          and media_assets.status in ('pending', 'failed')
        order by media_assets.created_at desc
        limit 1
      ) latest_portrait on true
      where players.campaign_id = $1 and players.status = 'active'
      order by players.slot asc nulls last, players.created_at asc
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
    nextInputNeeded: nextInputNeededFromCampaign(campaign),
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
  options: { includeRawResponse?: boolean; includeRequestMessages?: boolean } = {}
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
    ...(options.includeRequestMessages
      ? { rawRequestMessages: debug.requestMessages }
      : {}),
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
    phase:
      | "router"
      | "main"
      | "memory_updater"
      | "campaign_foundation_compiler"
      | "living_world_pressure_engine";
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

async function getActiveCampaignPlayers(db: Queryable, campaignId: string) {
  const result = await db.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1
        and status = 'active'
      order by slot asc nulls last, created_at asc
    `,
    [campaignId]
  );

  return result.rows;
}

function routerStateForCampaign(
  campaign: Pick<CampaignRow, "metadata" | "mode">,
  players: PlayerRow[]
) {
  const mechanicsState = resolveMechanicsState(campaign, players);
  const pendingRollRequests = pendingRollRequestsFromCampaign(campaign as CampaignRow);
  const inputTargets = inputTargetsFromCampaign(campaign as CampaignRow);
  const inputPolicy = inputPolicyFromCampaign(campaign as CampaignRow);
  const combat = roomCombatSnapshot(mechanicsState, players);

  return {
    campaign_mode: campaign.mode,
    combat_active: combat.active,
    combat,
    input_policy: inputPolicy,
    input_targets: inputTargets,
    pending_roll_requests: pendingRollRequests.map((request) => ({
      id: request.id,
      label: request.label,
      dice: request.dice,
      player: request.player,
      modifier: request.modifier
    })),
    active_players: players.map((player) => ({
      actorKey: actorKeyForPlayer(player.id),
      clientId: player.client_id,
      username: player.username,
      characterName: player.character_name,
      slot: player.slot
    }))
  };
}

function buildRouterMessage(input: {
  currentAction: string;
  routerState: Record<string, unknown>;
  availableContextChunks: ContextChunkIndex;
}) {
  return [
    "Routing state JSON:",
    JSON.stringify(input.routerState, null, 2),
    "",
    "Available context chunk keys JSON:",
    formatContextChunkIndexForRouter(input.availableContextChunks),
    "",
    formatRouterCurrentTurnInput(input.currentAction)
  ].join("\n");
}

function routerFallbackJob(routerState: Record<string, unknown>): DmJobName {
  return routerState.combat_active === true ? "combat" : "scene_director";
}

function routerDebugFromPromptContext(
  promptContext:
    | DmPromptContext
    | {
        instructions: string;
        message: string;
        sections: unknown[];
        budget: Record<string, unknown>;
      }
    | null
) {
  return promptContext &&
    "routerDebug" in promptContext &&
    promptContext.routerDebug
    ? promptContext.routerDebug
    : undefined;
}

type ContextChunkIndexEntry = {
  key: string;
  title: string;
  visibility: "player_safe" | "dm_only";
  priority: number;
  updatedAt: string;
};

type ContextChunkIndex = Record<ContextCategory, ContextChunkIndexEntry[]>;

function emptyContextChunkIndex(): ContextChunkIndex {
  return contextCategories.reduce(
    (index, category) => ({ ...index, [category]: [] }),
    {} as ContextChunkIndex
  );
}

function emptyContextKeys(): RouterContextKeys {
  return contextCategories.reduce(
    (keys, category) => ({ ...keys, [category]: [] }),
    {} as RouterContextKeys
  );
}

async function listCampaignContextChunkIndex(
  db: Queryable,
  campaignId: string,
  limit = 200
): Promise<ContextChunkIndex> {
  const index = emptyContextChunkIndex();

  try {
    const result = await db.query<Record<string, unknown>>(
      `
        select
          context_key,
          category,
          title,
          visibility,
          priority,
          updated_at
        from campaign_context_chunks
        where campaign_id = $1
          and archived_at is null
        order by category asc, priority desc, updated_at desc
        limit $2
      `,
      [campaignId, limit]
    );

    for (const row of result.rows) {
      const category = String(row.category ?? "") as ContextCategory;

      if (!contextCategories.includes(category)) {
        continue;
      }

      index[category].push({
        key: String(row.context_key ?? ""),
        title: String(row.title ?? row.context_key ?? ""),
        visibility:
          row.visibility === "player_safe" || row.visibility === "dm_only"
            ? row.visibility
            : "dm_only",
        priority: typeof row.priority === "number" ? row.priority : 0,
        updatedAt: row.updated_at ? toIso(row.updated_at as Date | string) : ""
      });
    }
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }
  }

  return index;
}

function formatContextChunkIndexForRouter(index: ContextChunkIndex) {
  return JSON.stringify(index, null, 2);
}

function formatContextChunkIndexForMemoryUpdater(index: ContextChunkIndex) {
  const entries = contextCategories.flatMap((category) =>
    index[category].map((entry) => ({
      context_id: entry.key,
      context_type: category,
      title: entry.title,
      visibility: entry.visibility,
      updated_at: entry.updatedAt
    }))
  );

  if (entries.length === 0) {
    return "No existing context chunks.";
  }

  return JSON.stringify(entries, null, 2);
}

type CampaignDmGuidance = {
  currentDirection: string;
  pressureToSurface: string[];
  softMoves: string[];
  hardMovesIfEarned: string[];
  avoid: string[];
  updatedAt?: string;
};

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ]
    : [];
}

function formatDmGuidance(guidance: CampaignDmGuidance | null) {
  if (!guidance) {
    return "No current DM guidance.";
  }

  return JSON.stringify(
    {
      current_direction: guidance.currentDirection,
      pressure_to_surface: guidance.pressureToSurface,
      soft_moves: guidance.softMoves,
      hard_moves_if_earned: guidance.hardMovesIfEarned,
      avoid: guidance.avoid,
      updated_at: guidance.updatedAt ?? null
    },
    null,
    2
  );
}

async function getCurrentCampaignDmGuidance(
  db: Queryable,
  campaignId: string
): Promise<CampaignDmGuidance | null> {
  try {
    const result = await db.query<Record<string, unknown>>(
      `
        select guidance, updated_at
        from campaign_dm_guidance
        where campaign_id = $1
        limit 1
      `,
      [campaignId]
    );
    const row = result.rows[0];
    const guidance = isRecord(row?.guidance) ? row.guidance : null;

    if (!guidance) {
      return null;
    }

    return {
      currentDirection: String(guidance.current_direction ?? ""),
      pressureToSurface: normalizeStringList(guidance.pressure_to_surface),
      softMoves: normalizeStringList(guidance.soft_moves),
      hardMovesIfEarned: normalizeStringList(guidance.hard_moves_if_earned),
      avoid: normalizeStringList(guidance.avoid),
      ...(row?.updated_at ? { updatedAt: toIso(row.updated_at as Date | string) } : {})
    };
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return null;
  }
}

async function upsertCampaignDmGuidance(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    coveredMessageCount: number;
    guidance: CampaignDmGuidance;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into campaign_dm_guidance (
        campaign_id,
        trace_id,
        covered_message_count,
        guidance
      )
      values ($1, $2, $3, $4::jsonb)
      on conflict (campaign_id) do update
      set trace_id = excluded.trace_id,
          covered_message_count = excluded.covered_message_count,
          guidance = excluded.guidance,
          updated_at = now()
    `,
    [
      input.campaignId,
      input.traceId,
      input.coveredMessageCount,
      JSON.stringify({
        current_direction: input.guidance.currentDirection,
        pressure_to_surface: input.guidance.pressureToSurface,
        soft_moves: input.guidance.softMoves,
        hard_moves_if_earned: input.guidance.hardMovesIfEarned,
        avoid: input.guidance.avoid
      })
    ]
  );
}

async function buildModularDmPromptContext(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: Pick<CampaignRow, "id" | "metadata" | "mode">,
  input: {
    traceId: string;
    turnId?: string | undefined;
    currentAction: string;
    baseInstructions: string;
    history: GameMessage[];
    model?: AiModelId;
  }
): Promise<DmPromptContext> {
  const players = await getActiveCampaignPlayers(db, campaign.id);
  const availableContextChunks = await listCampaignContextChunkIndex(
    db,
    campaign.id
  );
  const dmGuidance = await getCurrentCampaignDmGuidance(db, campaign.id);
  const routerState = routerStateForCampaign(campaign, players);
  const routerInstructions = buildRouterPrompt();
  const routerMessage = buildRouterMessage({
    currentAction: input.currentAction,
    routerState,
    availableContextChunks
  });
  const routerStartedAt = Date.now();
  const routerData = await runtime.askProvider({
    instructions: routerInstructions,
    message: routerMessage,
    history: input.history,
    ...(input.model ? { model: input.model } : {})
  });
  const router = validateRouterOutput(
    routerData.content,
    routerFallbackJob(routerState)
  );

  await logDmModelCall(db, {
    campaignId: campaign.id,
    traceId: input.traceId,
    turnId: input.turnId,
    phase: "router",
    providerData: routerData,
    durationMs: Date.now() - routerStartedAt
  });

  await logTurnDebugTrace(db, {
    campaignId: campaign.id,
    traceId: input.traceId,
    phase: "router_response_received",
    turnId: input.turnId,
    elapsedMs: Date.now() - routerStartedAt,
    payload: {
      routerState,
      availableContextChunks,
      router: {
        jobNeeded: router.jobNeeded,
        contextKeys: router.contextKeys,
        fallbackUsed: router.fallbackUsed,
        errors: router.errors,
        reason: router.reason
      },
      provider: providerDebugSummary(routerData.debug, {
        includeRawResponse: true,
        includeRequestMessages: true
      })
    }
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
      jobPrompt(router.jobNeeded, campaign.mode, {
        routerReason:
          router.jobNeeded === "clarification" ? router.reason : undefined
      }),
      "",
      "Current campaign DM guidance:",
      "Use this as short-lived direction for surfacing pressures when it fits the current scene. It is not canon by itself; validated campaign context chunks and campaign events remain the source of truth. Preserve player agency and do not reveal DM-only secrets directly.",
      formatDmGuidance(dmGuidance)
    ].join("\n"),
    jobNeeded: router.jobNeeded,
    message: [
      "Selected context chunks:",
      renderContextChunks(context.chunks),
      "",
      "Current campaign DM guidance:",
      formatDmGuidance(dmGuidance),
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
        errors: router.errors,
        reason: router.reason,
        routerState,
        availableContextChunks
      },
      {
        kind: "context_snapshot",
        includedContextKeys: context.chunks.map((chunk) => chunk.id),
        omittedContextKeys: context.omitted
      },
      {
        kind: "dm_guidance",
        guidance: dmGuidance
      }
    ],
    budget: {
      maxContextChars: 24000,
      includedContextChars: context.chunks.reduce(
        (total, chunk) => total + chunk.bodyMarkdown.length,
        0
      )
    },
    routerDebug: {
      requestMessages: routerData.debug.requestMessages,
      rawResponse: routerData.debug.rawResponse,
      parsedOutput: {
        jobNeeded: router.jobNeeded,
        contextKeys: router.contextKeys,
        fallbackUsed: router.fallbackUsed,
        errors: router.errors,
        reason: router.reason
      },
      ...(routerData.debug.model ? { model: routerData.debug.model } : {}),
      ...(routerData.debug.temperature !== undefined
        ? { temperature: routerData.debug.temperature }
        : {}),
      ...(routerData.debug.providerResponseId
        ? { providerResponseId: routerData.debug.providerResponseId }
        : {})
    }
  };
}

type NpcContextIndexEntry = {
  contextKey: string;
  title: string;
  visibility: "player_safe" | "dm_only";
  priority: number;
  updatedAt: string;
};

async function retrieveCampaignContextStorageState(
  db: Queryable,
  campaignId: string
) {
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
          archived_at,
          created_at,
          updated_at
        from campaign_context_chunks
        where campaign_id = $1
        order by archived_at nulls first,
          category asc,
          priority desc,
          updated_at desc
      `,
      [campaignId]
    );

    return result.rows.map((row) => ({
      context_id: String(row.context_key ?? ""),
      category: String(row.category ?? ""),
      title: String(row.title ?? row.context_key ?? ""),
      visibility:
        row.visibility === "player_safe" || row.visibility === "dm_only"
          ? row.visibility
          : "dm_only",
      priority: typeof row.priority === "number" ? row.priority : 0,
      body_markdown: String(row.body_markdown ?? ""),
      archived_at: row.archived_at
        ? toIso(row.archived_at as Date | string)
        : null,
      created_at: row.created_at ? toIso(row.created_at as Date | string) : null,
      updated_at: row.updated_at ? toIso(row.updated_at as Date | string) : null
    }));
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return [];
  }
}

type ContextStorageDebugState = {
  capturedAt: string;
  contextChunkCount: number;
  contextChunks: Awaited<ReturnType<typeof retrieveCampaignContextStorageState>>;
};

function campaignContextStorageDebugState(
  contextStorageState: Awaited<ReturnType<typeof retrieveCampaignContextStorageState>>
): ContextStorageDebugState {
  return {
    capturedAt: nowIso(),
    contextChunkCount: contextStorageState.length,
    contextChunks: contextStorageState
  };
}

async function listCampaignNpcContextIndex(
  db: Queryable,
  campaignId: string,
  limit = 80
): Promise<NpcContextIndexEntry[]> {
  try {
    const result = await db.query<Record<string, unknown>>(
      `
        select
          context_key,
          title,
          visibility,
          priority,
          updated_at
        from campaign_context_chunks
        where campaign_id = $1
          and category = 'npc_context'
          and archived_at is null
        order by priority desc, updated_at desc
        limit $2
      `,
      [campaignId, limit]
    );

    return result.rows.map((row) => ({
      contextKey: String(row.context_key ?? ""),
      title: String(row.title ?? row.context_key ?? ""),
      visibility:
        row.visibility === "player_safe" || row.visibility === "dm_only"
          ? row.visibility
          : "dm_only",
      priority: typeof row.priority === "number" ? row.priority : 0,
      updatedAt: row.updated_at ? toIso(row.updated_at as Date | string) : ""
    }));
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return [];
  }
}

function npcContextSearchText(input: {
  currentAction: string;
  dmResponse: string;
  history: GameMessage[];
}) {
  return [
    input.currentAction,
    input.dmResponse,
    ...input.history.map((message) => message.content)
  ]
    .join("\n")
    .toLowerCase();
}

function npcTitleTokens(entry: NpcContextIndexEntry) {
  return entry.title
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function npcEntryMatchesText(entry: NpcContextIndexEntry, searchText: string) {
  const title = entry.title.toLowerCase().trim();
  const contextSlug = entry.contextKey
    .replace(/^npc:/, "")
    .toLowerCase()
    .replace(/-/g, " ");

  if (title && searchText.includes(title)) {
    return true;
  }

  if (contextSlug && searchText.includes(contextSlug)) {
    return true;
  }

  const tokens = npcTitleTokens(entry);

  return tokens.length >= 2 && tokens.every((token) => searchText.includes(token));
}

function selectRelevantNpcContextKeys(
  index: NpcContextIndexEntry[],
  input: {
    currentAction: string;
    dmResponse: string;
    history: GameMessage[];
  },
  limit = 20
) {
  const searchText = npcContextSearchText(input);
  const keys = new Set<string>();

  for (const entry of index) {
    if (npcEntryMatchesText(entry, searchText)) {
      keys.add(entry.contextKey);
    }
  }

  for (const entry of index) {
    if (keys.size >= limit) {
      break;
    }

    keys.add(entry.contextKey);
  }

  return [...keys].slice(0, limit);
}

function contextEntryMatchesText(
  entry: ContextChunkIndexEntry,
  searchText: string
) {
  const title = entry.title.toLowerCase().trim();
  const contextSlug = entry.key
    .replace(/^[^:]+:/, "")
    .toLowerCase()
    .replace(/-/g, " ");

  if (title && searchText.includes(title)) {
    return true;
  }

  if (contextSlug && searchText.includes(contextSlug)) {
    return true;
  }

  const tokens = title
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);

  return tokens.length >= 2 && tokens.every((token) => searchText.includes(token));
}

function selectRelevantContextKeys(
  index: ContextChunkIndex,
  input: {
    currentAction: string;
    dmResponse: string;
    history: GameMessage[];
  },
  limit = 30
) {
  const searchText = npcContextSearchText(input);
  const keys = emptyContextKeys();
  let selectedCount = 0;

  for (const category of contextCategories) {
    for (const entry of index[category]) {
      if (selectedCount >= limit) {
        return keys;
      }

      if (contextEntryMatchesText(entry, searchText)) {
        keys[category].push(entry.key);
        selectedCount += 1;
      }
    }
  }

  for (const category of contextCategories) {
    for (const entry of index[category]) {
      if (selectedCount >= limit) {
        return keys;
      }

      if (!keys[category].includes(entry.key)) {
        keys[category].push(entry.key);
        selectedCount += 1;
      }
    }
  }

  return keys;
}

async function retrieveRelevantContextChunks(
  db: Queryable,
  campaignId: string,
  contextKeys: RouterContextKeys,
  maxChars = 18000
) {
  const hasKeys = contextCategories.some(
    (category) => contextKeys[category].length > 0
  );

  if (!hasKeys) {
    return [] as ContextChunk[];
  }

  const router: ValidatedRouterOutput = {
    jobNeeded: "scene_director",
    contextKeys,
    fallbackUsed: false,
    errors: []
  };
  const context = await retrieveSelectedContextChunks(
    db,
    campaignId,
    router,
    maxChars
  );

  return context.chunks;
}

async function retrieveRelevantNpcContextChunks(
  db: Queryable,
  campaignId: string,
  keys: string[],
  maxChars = 12000
) {
  if (keys.length === 0) {
    return [] as ContextChunk[];
  }

  const router: ValidatedRouterOutput = {
    jobNeeded: "scene_director",
    contextKeys: {
      npc_context: keys,
      player_character_context: [],
      combat_context: [],
      relevant_world_context: [],
      quests_open_threads: [],
      overarching_big_plot_secrets: []
    },
    fallbackUsed: false,
    errors: []
  };
  const context = await retrieveSelectedContextChunks(
    db,
    campaignId,
    router,
    maxChars
  );

  return context.chunks;
}

function formatNpcContextIndex(index: NpcContextIndexEntry[]) {
  if (index.length === 0) {
    return "No existing NPC cards.";
  }

  return JSON.stringify(
    index.map((entry) => ({
      context_id: entry.contextKey,
      title: entry.title,
      updated_at: entry.updatedAt
    })),
    null,
    2
  );
}

function normalizeNewContextChunkPatch(chunk: unknown) {
  const payload = eventPayload(chunk);
  const rawContextId = String(
    payload.context_id ?? payload.contextId ?? payload.chunk_id ?? payload.chunkId ?? ""
  );
  const title = String(payload.title ?? rawContextId);
  const contextType = payload.context_type ?? payload.contextType ?? "npc_context";
  const contextId =
    contextType === "npc_context"
      ? normalizeNpcContextId(rawContextId, title)
      : rawContextId;
  const visibility = payload.visibility === "dm_only" ? "dm_only" : "player_safe";
  const markdown =
    typeof payload.markdown === "string"
      ? payload.markdown
      : isRecord(payload.content)
        ? jsonObjectToMarkdown(title, payload.content)
        : typeof payload.content === "string"
          ? payload.content
          : "";

  return eventPayload({
    ...payload,
    operation: "create_chunk",
    context_id: contextId,
    context_type: contextType,
    title,
    visibility,
    markdown
  });
}

function sanitizeCampaignFoundationCompilerChunks(
  chunks: Record<string, unknown>[]
) {
  const dmOnlyNpcNames = chunks
    .filter(
      (chunk) =>
        chunk.visibility === "dm_only" &&
        typeof chunk.context_id === "string" &&
        chunk.context_id.startsWith("npc:")
    )
    .map((chunk) =>
      String(chunk.title ?? "")
        .replace(/^NPC:\s*/i, "")
        .trim()
    )
    .filter(Boolean);

  return chunks.map((chunk) => {
    const markdown =
      typeof chunk.markdown === "string" ? chunk.markdown : "";
    let visibility = chunk.visibility;

    if (
      visibility === "player_safe" &&
      typeof chunk.context_id === "string" &&
      chunk.context_id.startsWith("npc:") &&
      /not yet met|private buyer|secret employer|hidden patron|antagonist/i.test(
        `${chunk.title ?? ""}\n${markdown}`
      )
    ) {
      visibility = "dm_only";
    }

    if (visibility !== "player_safe" || !markdown.trim()) {
      return { ...chunk, visibility };
    }

    const sanitizedMarkdown = markdown
      .split("\n")
      .filter((line) => !isCampaignFoundationHiddenLine(line, dmOnlyNpcNames))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      ...chunk,
      visibility,
      markdown: sanitizedMarkdown || markdown
    };
  });
}

function isCampaignFoundationHiddenLine(line: string, dmOnlyNpcNames: string[]) {
  const hiddenPattern =
    /duplicate ledger|hidden under|half-burned map|time-loop|Second Dominion|Ashen Scholar|buyer'?s agent|secret agent|second team|paid in Wellglass|Fara .*Garrick|Garrick .*buyer|alive.*trapped/i;

  return (
    hiddenPattern.test(line) ||
    dmOnlyNpcNames.some((name) => name && line.includes(name))
  );
}

function normalizeNpcContextId(contextId: string, title: string) {
  if (!contextId.startsWith("npc:")) {
    return contextId;
  }

  const slug = contextId.slice("npc:".length);
  const titleSlug = kebabCaseContextSlug(title.replace(/^NPC:\s*/i, ""));

  if (!titleSlug || slug.includes("-") || slug === titleSlug) {
    return contextId;
  }

  if (slug.replace(/-/g, "") === titleSlug.replace(/-/g, "")) {
    return `npc:${titleSlug}`;
  }

  return contextId;
}

function kebabCaseContextSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headingFromObjectKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function markdownValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return ["Unknown."];
    }

    return value.flatMap((item) => {
      if (typeof item === "string") {
        return [`- ${item}`];
      }

      if (isRecord(item)) {
        return [
          "-",
          ...Object.entries(item).flatMap(([key, child]) =>
            markdownValue(child).map((line) => `  ${headingFromObjectKey(key)}: ${line.replace(/^- /, "")}`)
          )
        ];
      }

      return [`- ${String(item)}`];
    });
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) => [
      `### ${headingFromObjectKey(key)}`,
      ...markdownValue(child),
      ""
    ]);
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : ["Unknown."];
  }

  return [String(value)];
}

function jsonObjectToMarkdown(title: string, content: Record<string, unknown>) {
  const heading = title.trim() || "Campaign Context";

  return [
    `# ${heading}`,
    "",
    ...Object.entries(content).flatMap(([key, value]) => [
      `## ${headingFromObjectKey(key)}`,
      ...markdownValue(value),
      ""
    ])
  ]
    .join("\n")
    .trim();
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
  const visibility =
    patch.visibility === "player_safe" || patch.visibility === "dm_only"
      ? patch.visibility
      : undefined;

  if (operation === "append") {
    await bestEffortRuntimeInsert(
      db,
      `
        update campaign_context_chunks
        set body_markdown = concat_ws(E'\n', body_markdown, $3::text),
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
        set body_markdown = $3::text,
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
        visibility ?? "player_safe",
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

async function getCampaignLivingWorldMessageCount(
  db: Queryable,
  campaignId: string
) {
  try {
    const result = await db.query<{ count: string | number }>(
      `
        select count(*) as count
        from campaign_events
        where campaign_id = $1
          and type in (
            'turn_submitted',
            'turn_resolved',
            'adventure_begun',
            'dm_question',
            'dm_answer'
          )
          and coalesce(payload->>'content', '') <> ''
      `,
      [campaignId]
    );

    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return 0;
  }
}

async function getLatestLivingWorldCoveredMessageCount(
  db: Queryable,
  campaignId: string
) {
  try {
    const result = await db.query<{ covered_message_count: number }>(
      `
        select covered_message_count
        from living_world_engine_runs
        where campaign_id = $1
          and coalesce(payload->>'failed', 'false') <> 'true'
          and coalesce(payload->>'status', '') <> 'started'
        order by covered_message_count desc, created_at desc
        limit 1
      `,
      [campaignId]
    );

    return Number(result.rows[0]?.covered_message_count ?? 0);
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return 0;
  }
}

async function retrieveLivingWorldContextChunks(
  db: Queryable,
  campaignId: string,
  maxChars = 36000
) {
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
          and archived_at is null
        order by priority desc, updated_at desc
        limit 120
      `,
      [campaignId]
    );
    rows = result.rows;
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }
  }

  const chunks: ContextChunk[] = [];
  let usedChars = 0;

  for (const row of rows) {
    const chunk = mapContextChunkRow(row);
    const nextChars = usedChars + chunk.bodyMarkdown.length;

    if (nextChars > maxChars) {
      continue;
    }

    usedChars = nextChars;
    chunks.push(chunk);
  }

  return chunks;
}

function formatLivingWorldPressureEngineRequest(input: {
  campaign: CampaignRow;
  currentGuidance: CampaignDmGuidance | null;
  contextChunkIndex: ContextChunkIndex;
  contextChunks: ContextChunk[];
  recentMessages: GameMessage[];
  currentMessageCount: number;
  lastCoveredMessageCount: number;
}) {
  return [
    "Campaign ID:",
    input.campaign.id,
    "",
    "Campaign mode:",
    input.campaign.mode,
    "",
    "Canonical Eldermere context relevant to this campaign:",
    formatEldermereOpeningPromptContext(
      eldermereCampaignStartFromMetadata(input.campaign)
    ),
    "",
    "Current DM guidance:",
    formatDmGuidance(input.currentGuidance),
    "",
    "Existing context chunk index:",
    formatContextChunkIndexForMemoryUpdater(input.contextChunkIndex),
    "",
    "Current campaign context chunks:",
    renderContextChunks(input.contextChunks),
    "",
    "Recent uncovered-ish message window:",
    JSON.stringify(input.recentMessages, null, 2),
    "",
    "Cadence state:",
    JSON.stringify(
      {
        current_message_count: input.currentMessageCount,
        last_covered_message_count: input.lastCoveredMessageCount,
        cadence_messages: 20
      },
      null,
      2
    ),
    "",
    "Output reminder:",
    "Return JSON with world_clock_updates, patches, new_context_chunks, remove_context_chunks, dm_guidance, possible_intrusions, and contradiction_warnings only."
  ].join("\n");
}

async function logLivingWorldEngineRun(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    coveredMessageCount: number;
    providerData?: DungeonMasterProviderResponse | undefined;
    acceptedPatchCount: number;
    discardedPatchCount: number;
    guidance: CampaignDmGuidance | null;
    payload: Record<string, unknown>;
  }
) {
  await bestEffortRuntimeInsert(
    db,
    `
      insert into living_world_engine_runs (
        campaign_id,
        trace_id,
        turn_id,
        covered_message_count,
        provider,
        model,
        raw_response,
        accepted_patch_count,
        discarded_patch_count,
        guidance,
        payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      on conflict (campaign_id, covered_message_count) do update
      set trace_id = excluded.trace_id,
          turn_id = excluded.turn_id,
          provider = excluded.provider,
          model = excluded.model,
          raw_response = excluded.raw_response,
          accepted_patch_count = excluded.accepted_patch_count,
          discarded_patch_count = excluded.discarded_patch_count,
          guidance = excluded.guidance,
          payload = excluded.payload
    `,
    [
      input.campaignId,
      input.traceId,
      input.turnId ?? null,
      input.coveredMessageCount,
      input.providerData ? "deepseek" : null,
      input.providerData?.debug.model ?? null,
      input.providerData?.content ?? null,
      input.acceptedPatchCount,
      input.discardedPatchCount,
      input.guidance
        ? JSON.stringify({
            current_direction: input.guidance.currentDirection,
            pressure_to_surface: input.guidance.pressureToSurface,
            soft_moves: input.guidance.softMoves,
            hard_moves_if_earned: input.guidance.hardMovesIfEarned,
            avoid: input.guidance.avoid
          })
        : JSON.stringify(null),
      JSON.stringify(input.payload)
    ]
  );
}

async function claimLivingWorldEngineWindow(
  db: Queryable,
  input: {
    campaignId: string;
    traceId: string;
    turnId?: string | undefined;
    coveredMessageCount: number;
  }
) {
  try {
    const result = await db.query<{ id: string }>(
      `
        insert into living_world_engine_runs (
          campaign_id,
          trace_id,
          turn_id,
          covered_message_count,
          accepted_patch_count,
          discarded_patch_count,
          guidance,
          payload
        )
        values ($1, $2, $3, $4, 0, 0, null, $5::jsonb)
        on conflict (campaign_id, covered_message_count) do nothing
        returning id
      `,
      [
        input.campaignId,
        input.traceId,
        input.turnId ?? null,
        input.coveredMessageCount,
        JSON.stringify({
          source: "living_world_pressure_engine",
          status: "started"
        })
      ]
    );

    return Boolean(result.rows[0]);
  } catch (error) {
    if (!isMissingRuntimeTableError(error)) {
      throw error;
    }

    return false;
  }
}

async function runLivingWorldPressureEngineIfDue(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    turnId: string;
    dmEventId?: string | undefined;
  }
) {
  const currentMessageCount = await getCampaignLivingWorldMessageCount(
    db,
    input.campaignId
  );
  const lastCoveredMessageCount = await getLatestLivingWorldCoveredMessageCount(
    db,
    input.campaignId
  );

  if (currentMessageCount - lastCoveredMessageCount < 20) {
    return;
  }

  const traceId = randomUUID();
  const startedAt = Date.now();
  const claimed = await claimLivingWorldEngineWindow(db, {
    campaignId: input.campaignId,
    traceId,
    turnId: input.turnId,
    coveredMessageCount: currentMessageCount
  });

  if (!claimed) {
    return;
  }

  let pressureProviderDebug: AiDebugInfo | undefined;

  try {
    const campaign = requireRow(
      (
        await db.query<CampaignRow>(
          "select * from campaigns where id = $1 limit 1",
          [input.campaignId]
        )
      ).rows[0],
      "Campaign not found."
    );
    const contextChunkIndex = await listCampaignContextChunkIndex(
      db,
      input.campaignId
    );
    const contextChunks = await retrieveLivingWorldContextChunks(
      db,
      input.campaignId
    );
    const currentGuidance = await getCurrentCampaignDmGuidance(
      db,
      input.campaignId
    );
    const recentMessages = await getCampaignEventMessages(db, input.campaignId, 20);
    const instructions = buildLivingWorldPressureEnginePrompt();
    const message = formatLivingWorldPressureEngineRequest({
      campaign,
      currentGuidance,
      contextChunkIndex,
      contextChunks,
      recentMessages,
      currentMessageCount,
      lastCoveredMessageCount
    });

    await logDmTurnTrace(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      phase: "living_world_pressure_engine_started",
      payload: {
        currentMessageCount,
        lastCoveredMessageCount,
        message: textStats(message),
        instructions: textStats(instructions)
      }
    });

    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      instructions,
      message,
      history: []
    });
    pressureProviderDebug = providerData.debug;

    await logDmModelCall(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      phase: "living_world_pressure_engine",
      providerData,
      durationMs: Date.now() - providerStartedAt
    });

    const parsed = validateLivingWorldOutput(providerData.content);
    const proposedPatches = [
      ...parsed.patches,
      ...parsed.newContextChunks.map((chunk) =>
        normalizeNewContextChunkPatch(chunk)
      ),
      ...parsed.removeContextChunks.map((chunk) => ({
        operation: "archive_chunk",
        context_id:
          typeof chunk === "string" ? chunk : eventPayload(chunk).context_id
      }))
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

    await upsertCampaignDmGuidance(db, {
      campaignId: input.campaignId,
      traceId,
      coveredMessageCount: currentMessageCount,
      guidance: parsed.dmGuidance
    });

    const livingWorldDebugState = {
      traceId,
      coveredMessageCount: currentMessageCount,
      requestMessages: providerData.debug.requestMessages,
      rawResponse: providerData.debug.rawResponse,
      parsedOutput: {
        worldClockUpdates: parsed.worldClockUpdates,
        patches: parsed.patches,
        newContextChunks: parsed.newContextChunks,
        removeContextChunks: parsed.removeContextChunks,
        dmGuidance: parsed.dmGuidance,
        possibleIntrusions: parsed.possibleIntrusions,
        contradictionWarnings: parsed.contradictionWarnings
      },
      proposedPatches,
      acceptedPatches: validation.accepted,
      discardedPatches: validation.discarded,
      durationMs: Date.now() - startedAt,
      ...(providerData.debug.model
        ? { model: providerData.debug.model }
        : {}),
      ...(typeof providerData.debug.temperature === "number"
        ? { temperature: providerData.debug.temperature }
        : {}),
      ...(providerData.debug.providerResponseId
        ? { providerResponseId: providerData.debug.providerResponseId }
        : {}),
      ...(providerData.debug.providerTimings
        ? { providerTimings: providerData.debug.providerTimings }
        : {})
    };

    await attachLivingWorldPressureEngineToDmEventDebug(db, {
      campaignId: input.campaignId,
      dmEventId: input.dmEventId,
      livingWorldPressureEngine: livingWorldDebugState
    });

    await logLivingWorldEngineRun(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      coveredMessageCount: currentMessageCount,
      providerData,
      acceptedPatchCount: validation.accepted.length,
      discardedPatchCount: validation.discarded.length,
      guidance: parsed.dmGuidance,
      payload: {
        source: "living_world_pressure_engine",
        worldClockUpdates: parsed.worldClockUpdates,
        possibleIntrusions: parsed.possibleIntrusions,
        contradictionWarnings: parsed.contradictionWarnings,
        proposedPatches,
        acceptedPatches: validation.accepted,
        discardedPatches: validation.discarded,
        durationMs: Date.now() - startedAt
      }
    });

    await logDmMemoryPatchLog(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "living_world_pressure_engine",
        worldClockUpdates: parsed.worldClockUpdates,
        possibleIntrusions: parsed.possibleIntrusions,
        contradictionWarnings: parsed.contradictionWarnings,
        proposedPatches,
        acceptedPatches: validation.accepted,
        discardedPatches: validation.discarded,
        dmGuidance: parsed.dmGuidance,
        durationMs: Date.now() - startedAt
      }
    });

    runtime.emitDmStreamEvent?.({
      type: "room_updated",
      roomId: input.campaignId,
      updatedAt: nowIso(),
      ...(input.dmEventId ? { eventId: input.dmEventId } : {})
    });
  } catch (error) {
    const debugFromError = pressureProviderDebug ?? providerDebugFromError(error);

    await attachLivingWorldPressureEngineToDmEventDebug(db, {
      campaignId: input.campaignId,
      dmEventId: input.dmEventId,
      livingWorldPressureEngine: {
        traceId,
        coveredMessageCount: currentMessageCount,
        failed: true,
        error: errorSummary(error),
        durationMs: Date.now() - startedAt,
        ...(debugFromError
          ? {
              requestMessages: debugFromError.requestMessages,
              rawResponse: debugFromError.rawResponse,
              ...(debugFromError.model ? { model: debugFromError.model } : {}),
              ...(typeof debugFromError.temperature === "number"
                ? { temperature: debugFromError.temperature }
                : {}),
              ...(debugFromError.providerResponseId
                ? { providerResponseId: debugFromError.providerResponseId }
                : {}),
              ...(debugFromError.providerTimings
                ? { providerTimings: debugFromError.providerTimings }
                : {})
            }
          : {})
      }
    });

    runtime.emitDmStreamEvent?.({
      type: "room_updated",
      roomId: input.campaignId,
      updatedAt: nowIso(),
      ...(input.dmEventId ? { eventId: input.dmEventId } : {})
    });

    await logLivingWorldEngineRun(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      coveredMessageCount: currentMessageCount,
      acceptedPatchCount: 0,
      discardedPatchCount: 0,
      guidance: null,
      payload: {
        source: "living_world_pressure_engine",
        failed: true,
        error: errorSummary(error),
        durationMs: Date.now() - startedAt
      }
    });

    await logDmMemoryPatchLog(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "living_world_pressure_engine",
        failed: true,
        error: errorSummary(error),
        durationMs: Date.now() - startedAt
      }
    });
  }
}

async function attachContextStorageStateToDmEventDebug(
  db: Queryable,
  input: {
    campaignId: string;
    dmEventId?: string | undefined;
    contextStorageState: unknown;
  }
) {
  if (!input.dmEventId) {
    return;
  }

  await bestEffortRuntimeInsert(
    db,
    `
      update campaign_events
      set payload = jsonb_set(
        jsonb_set(
          payload,
          '{aiDebug}',
          coalesce(payload->'aiDebug', '{}'::jsonb),
          true
        ),
        '{aiDebug,contextStorageState}',
        $3::jsonb,
        true
      )
      where campaign_id = $1 and id = $2
    `,
    [
      input.campaignId,
      input.dmEventId,
      JSON.stringify(input.contextStorageState)
    ]
  );
}

async function attachLivingWorldPressureEngineToDmEventDebug(
  db: Queryable,
  input: {
    campaignId: string;
    dmEventId?: string | undefined;
    livingWorldPressureEngine: unknown;
  }
) {
  if (!input.dmEventId) {
    return;
  }

  await bestEffortRuntimeInsert(
    db,
    `
      update campaign_events
      set payload = jsonb_set(
        jsonb_set(
          payload,
          '{aiDebug}',
          coalesce(payload->'aiDebug', '{}'::jsonb),
          true
        ),
        '{aiDebug,livingWorldPressureEngine}',
        $3::jsonb,
        true
      )
      where campaign_id = $1 and id = $2
    `,
    [
      input.campaignId,
      input.dmEventId,
      JSON.stringify(input.livingWorldPressureEngine)
    ]
  );
}

export async function runModularPostTurnContextJobs(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  input: {
    campaignId: string;
    turnId: string;
    currentAction: string;
    dmResponse: string;
    dmEventId?: string | undefined;
    rollRequests?: DiceRollRequest[] | undefined;
  }
) {
  const traceId = randomUUID();
  const startedAt = Date.now();
  const history = await getCampaignEventMessages(db, input.campaignId, 8);
  const contextChunkIndex = await listCampaignContextChunkIndex(
    db,
    input.campaignId
  );
  const relevantContextKeys = selectRelevantContextKeys(contextChunkIndex, {
    currentAction: input.currentAction,
    dmResponse: input.dmResponse,
    history
  });
  const relevantContextChunks = await retrieveRelevantContextChunks(
    db,
    input.campaignId,
    relevantContextKeys
  );
  const npcContextIndex = await listCampaignNpcContextIndex(db, input.campaignId);
  const relevantNpcContextKeys = selectRelevantNpcContextKeys(npcContextIndex, {
    currentAction: input.currentAction,
    dmResponse: input.dmResponse,
    history
  });
  const relevantNpcContextChunks = await retrieveRelevantNpcContextChunks(
    db,
    input.campaignId,
    relevantNpcContextKeys
  );
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
    "Existing context chunk index:",
    formatContextChunkIndexForMemoryUpdater(contextChunkIndex),
    "",
    "Relevant existing context chunks:",
    renderContextChunks(relevantContextChunks),
    "",
    "Existing NPC context index:",
    formatNpcContextIndex(npcContextIndex),
    "",
    "Relevant existing NPC cards:",
    renderContextChunks(relevantNpcContextChunks),
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
        contextChunkIndexCount: contextCategories.reduce(
          (total, category) => total + contextChunkIndex[category].length,
          0
        ),
        relevantContextKeys,
        npcContextIndexCount: npcContextIndex.length,
        relevantNpcContextKeys,
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
            normalizeNewContextChunkPatch(chunk)
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

    const contextStorageState = await retrieveCampaignContextStorageState(
      db,
      input.campaignId
    );
    const contextStorageDebugState =
      campaignContextStorageDebugState(contextStorageState);

    await logDmTurnTrace(db, {
      campaignId: input.campaignId,
      traceId,
      turnId: input.turnId,
      phase: "context_storage_state_snapshot",
      payload: contextStorageDebugState
    });

    await attachContextStorageStateToDmEventDebug(db, {
      campaignId: input.campaignId,
      dmEventId: input.dmEventId,
      contextStorageState: contextStorageDebugState
    });

    runtime.emitDmStreamEvent?.({
      type: "room_updated",
      roomId: input.campaignId,
      updatedAt: contextStorageDebugState.capturedAt,
      ...(input.dmEventId ? { eventId: input.dmEventId } : {})
    });

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

  await runLivingWorldPressureEngineIfDue(db, runtime, {
    campaignId: input.campaignId,
    turnId: input.turnId,
    dmEventId: input.dmEventId
  });
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

function compactPromptText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCharacterBackstory(characterSheet: string) {
  const normalized = characterSheet.replace(/\r\n/g, "\n");
  const labelledBackstory = normalized.match(
    /(?:^|\n)(?:#{1,6}\s*)?Backstory\s*\n([\s\S]*?)(?=\n(?:#{1,6}\s*)?(?:Backstory Expansion|Core Stats|Ability Scores|Saving Throws|Skills|Proficiencies and Languages|Attacks|Features and Traits|Equipment|Inventory|Currency|Spells|DM Brief|Level Progression|Appearance)\b|$)/i
  );

  if (labelledBackstory?.[1]) {
    return compactPromptText(labelledBackstory[1]);
  }

  const inlineBackstory = normalized.match(
    /(?:^|\n)(?:Backstory|Background)\s*:\s*([^\n]+(?:\n(?![A-Z][A-Za-z ]+:\s).+)*)/i
  );

  return inlineBackstory?.[1] ? compactPromptText(inlineBackstory[1]) : "";
}

function formatOpeningBackstoryAnchors(players: PlayerRow[]) {
  const anchors = players
    .filter(isProfileComplete)
    .map((player) => {
      const backstory = extractCharacterBackstory(player.character_sheet);

      if (!backstory) {
        return "";
      }

      return `- ${player.character_name}: ${previewText(backstory, 900)}`;
    })
    .filter(Boolean);

  if (anchors.length === 0) {
    return "";
  }

  return [
    "Player backstory anchors for the opening scene:",
    "Treat these as authoritative personal story ingredients. The opener must connect at least one immediate clue, NPC demand, debt, danger, opportunity, or emotional pressure to these anchors while staying in the selected starting place. Do not rewrite, resolve, or contradict the backstory.",
    ...anchors
  ].join("\n");
}

function formatMechanicsPromptContext(mechanicsState: MechanicsState) {
  return [
    "Authoritative mechanics state:",
    "If mechanicsState conflicts with transcript history, generated character-sheet text, or model memory, mechanicsState wins.",
    JSON.stringify(mechanicsState)
  ].join("\n");
}

function normalizeCombatInputControl(
  state: MechanicsState,
  input: {
    mode: CampaignMode;
    nextInputNeeded: DmNextInputNeeded;
    rollRequests: DiceRollRequest[];
    inputTargets: string[];
    inputPolicy: InputPolicy;
  }
): {
  mechanicsState: MechanicsState;
  inputTargets: string[];
  inputPolicy: InputPolicy;
} {
  if (!state.combat.active || input.nextInputNeeded !== "player_actions") {
    return {
      mechanicsState: state,
      inputTargets: input.inputTargets,
      inputPolicy: input.inputPolicy
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
      const mechanicsState = {
        ...state,
        combat: {
          ...state.combat,
          turnOwner: livingPlayerActorKeys[0] ?? null
        }
      };
      return {
        mechanicsState,
        inputTargets: input.inputTargets,
        inputPolicy: input.inputPolicy
      };
    }
  }

  if (
    input.rollRequests.length === 0 &&
    state.combat.turnOwner?.startsWith("player:")
  ) {
    return {
      mechanicsState: state,
      inputTargets: [state.combat.turnOwner],
      inputPolicy: "only_targeted_players"
    };
  }

  return {
    mechanicsState: state,
    inputTargets: input.inputTargets,
    inputPolicy: input.inputPolicy
  };
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
      "Only treat concrete declared actions as actions. Quoted speech, questions, promises, plans, and corrections are dialogue or intent unless the player also says they move, travel, enter, search, attack, take something, cast a spell, or otherwise change the scene. Treat claims like taking, drawing, pulling, or producing an item from a bag as attempted inventory actions, not proof of possession; validate the claimed item against the canonical character sheet before narrating it.",
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
      mechanicsState.combat.active
        ? "Resolve active combat by canonical initiative order. The current mechanicsState.combat.turnOwner acts first. Submitted actions from non-turn owners are pending intent only unless their turn is reached."
        : "Resolve the submitted player actions together. Account for timing, positioning, cooperation, conflict, and consequences before asking what happens next.",
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
  const nameBank = formatCampaignOpeningNameBank({
    campaign: input.campaign,
    players: input.players,
    style: input.style
  });

  return [
    formatCanonicalCharacterContext(input.players, mechanicsState),
    "",
    formatOpeningBackstoryAnchors(input.players),
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
    nameBank,
    "",
    "Campaign opener requirements:",
    "Write a true campaign opener, not only a room description, road encounter, or local hazard.",
    "Establish a named starting place and a named larger region, realm, frontier, city, or world. If the setup does not provide names, invent strong fantasy names.",
    "When the setup provides a selected canonical region and settlement, use those exact places as the opener's primary region and starting location instead of picking or inventing replacements.",
    "When inventing new NPCs, places, taverns, factions, objects, or threats for the opener, prefer the validated name bank above. Do not force every candidate into the scene, and do not rename player characters or established names.",
    "Establish why the character or party is here now and what set them on this path.",
    "For completed character backstories, make the opening premise visibly grow out of at least one unresolved relationship, obligation, fear, promise, loss, secret, or ambition from the player backstory.",
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
    "You are the campaign-opening planner and campaign foundation planner for AI Taverns, a D&D-style fantasy campaign app.",
    "Your job is not to write player-facing narration.",
    "Create a structured campaign foundation that a separate narrator will turn into only the opening scene, and that a background compiler can turn into durable DM context chunks.",
    "The narrator will not receive the full world lore, so separate player-safe facts, private DM context, allowed opening terms, and forbidden opening terms.",
    "Use the selected Eldermere region and settlement when provided. Do not choose a different primary region or starting settlement.",
    "Use the player backstory anchors from the opening request as core premise material: the opener must make at least one unresolved backstory relationship, obligation, loss, secret, fear, promise, or ambition immediately relevant.",
    "Make the campaign foundation feel like a living part of Eldermere: include what has been happening locally, what factions or NPCs are doing if unopposed, what secrets can be discovered over time, and how the player could eventually leave a mark on the region or world.",
    "Give the campaign long-term direction without railroading: create reveal ladders, escalation clocks, NPC agendas, and possible consequences, not a fixed plot that ignores player choice.",
    "Make the first scene specific, playable, and mysterious. Let the narrator start with a human-scale scene, not a history lecture.",
    "The player-facing opening should use at most 3 Eldermere-specific setting proper nouns total, not counting ordinary NPC names. The chosen region and starting location count toward this limit.",
    "Prefer plain descriptions over official names: use concrete meaning before setting terminology.",
    "Treat canonical Eldermere facts as source-grounded world truth. Treat any new links, NPC motives, faction plans, or secret ladders you invent as campaign-local premises until established through play.",
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
        campaign_foundation: {
          campaign_thesis: {
            core_question: "the campaign-scale dramatic question",
            player_personal_stake: "how the player backstory connects to the world conflict",
            world_stake: "what changes in Eldermere if no one intervenes",
            possible_mark_on_eldermere: "how the player could eventually change a place, faction, secret, or power structure"
          },
          living_local_context: {
            recent_events: [
              "what has been happening around the starting place before the player arrives"
            ],
            local_pressures: [
              "arguments, shortages, fears, opportunities, or social tensions locals are living with"
            ],
            visible_signs: [
              "observable details that imply deeper trouble without explaining everything"
            ],
            rumors_half_true: [
              "rumors that are useful, incomplete, or distorted"
            ]
          },
          npc_web: [
            {
              name: "important or recurring NPC name",
              public_role: "what players can understand early",
              private_agenda: "DM-only motive, pressure, secret, or plan",
              relationship_to_player_hook: "how they touch a player backstory, ambition, debt, fear, promise, or capability",
              if_unopposed: "what this NPC will do if the player ignores them"
            }
          ],
          faction_and_event_clocks: [
            {
              name: "clock or pressure name",
              current_stage: "what is true now",
              next_escalation: "what happens next if no one changes it",
              what_advances_it: "events or player choices that make it worse",
              what_slows_or_changes_it: "actions that can bend or stop it"
            }
          ],
          secret_ladder: {
            opening_secrets: [
              "small secrets that can be discovered in the first few scenes"
            ],
            early_arc_revelations: [
              "truths for the first local arc"
            ],
            mid_campaign_revelations: [
              "truths that connect local events to major regional/world forces"
            ],
            late_campaign_truths: [
              "truths that should only become clear after earned discovery"
            ],
            do_not_resolve_too_soon: [
              "mysteries, relationships, or stakes that need a long runway"
            ]
          },
          arc_direction: {
            act_1: "local survival, trust, first mysteries, and immediate choices",
            act_2: "regional power, faction pressure, deeper costs, and player agency",
            act_3: "world secrets, irreversible choices, and the player's mark on Eldermere"
          }
        },
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
    "Keep the first scene anchored in the planned region and starting location; do not relocate the opener to another settlement, region, road, tavern, faction hall, or invented landmark unless the plan explicitly places it inside the starting location.",
    "Make at least one player backstory anchor visible in the first scene through a clue, NPC demand, debt, danger, opportunity, sensory trigger, or emotional pressure. Do not retell the whole backstory.",
    "If a useful idea appears in dm_private_context, imply it only through concrete visible facts or pressure; do not reveal it as confirmed exposition.",
    "Forbidden opening terms must not appear in public_narration.",
    "Allowed player-facing terms must be explained plainly on first use.",
    "",
    "Opening structure:",
    "Treat the opener as an arrival runway into the first live scene, not only a cold open.",
    "Paragraph 1 must explain why this specific character or party has come here now, using player-facing backstory context. Assume the player has not recently read the backstory. Connect the arrival to at least one unresolved dream, loss, secret, promise, obligation, fear, ambition, or relationship. Do not begin with scenery, weather, crowds, dialogue, combat, or the name of the starting location.",
    "The first sentence must be about the character's reason for coming, not where they are standing. Do not start with phrases like 'You stand at', 'You arrive at', 'The town', 'The road', or any location-first camera direction.",
    "Paragraph 2 must describe what the character or party has been doing over the last few days and then the last few hours to reach this place. Explain how they entered the region or settlement, where exactly they have landed, what kind of area it is, what locals say about it, and what the character plausibly knows before the immediate scene begins. Keep this player-facing and concrete. Do not reveal DM-private secrets.",
    "Paragraph 3 and after may describe the live scene: the physical location, sensory details, visible NPC tension, immediate complication, and interactable choices.",
    "Before the final question, include one short personal urgency beat that connects the immediate clue, demand, threat, or opportunity back to the character's backstory reason for being here. Do not explain why the player should care abstractly. Show the character noticing, reacting, or connecting it to their unresolved backstory.",
    "",
    "Opening style:",
    "Write in grounded, direct fantasy prose. Keep the narration detailed and atmospheric, but avoid ornate, poetic, elevated, or mythic phrasing. Do not solve this by making the narration shorter; keep the same amount of detail and make the details more concrete.",
    "Use physical, observable wording for magical or emotional details. Prefer direct wording like 'vibrates', 'shakes', 'burns', 'goes cold', 'draws attention', 'people argue', 'the road was hard', and 'someone here knows something' over lyrical abstractions like 'pulls at you like a thread', 'the dream is here', or 'every instinct says'.",
    "The tone should feel serious, grounded, and specific, like a DM clearly describing a dangerous place to the player. It should not sound like a bard, prophecy, epic poem, or fantasy trailer.",
    "Do not rewrite, soften, or alter the character backstory. If the backstory says someone died, do not say they disappeared. If the narrator mentions a backstory event, preserve the cause and relationship exactly.",
    "Do not invent new circumstances for how a keepsake, clue, wound, relationship, promise, or obligation entered the character's life. If the exact handoff is not specified, use neutral wording like 'the scroll case you carry from her' instead of inventing a scene where someone gave it to the character.",
    "Useful personal urgency beats look like: 'The handwriting looks enough like your mother's that your hand goes to the scroll case before you decide to move.', 'The same name from your dream is written on the board in front of you. Someone in this town knows something.', or 'The shard vibrates at your side at the same moment you read the note.'",
    'Set setting.world_name to "Eldermere".',
    `Set setting.starting_location and setting.display_location to "${input.plan.startingLocation.name}".`
  ].join("\n");
}

function eldermereOpeningPlannerDebug(input: {
  instructions: string;
  message: string;
  providerData: DungeonMasterProviderResponse;
  plan: EldermereOpeningPlan;
}): EldermereOpeningPlannerDebug {
  const requestMessages =
    input.providerData.debug.requestMessages.length > 0
      ? input.providerData.debug.requestMessages
      : [
          { role: "system" as const, content: input.instructions },
          { role: "user" as const, content: input.message }
        ];

  return {
    requestMessages,
    rawResponse: input.providerData.content,
    parsedOutput: openingPlanToJson(input.plan),
    ...(input.providerData.debug.providerResponseId
      ? { providerResponseId: input.providerData.debug.providerResponseId }
      : {}),
    ...(input.providerData.debug.model
      ? { model: input.providerData.debug.model }
      : {}),
    ...(typeof input.providerData.debug.temperature === "number"
      ? { temperature: input.providerData.debug.temperature }
      : {}),
    ...(input.providerData.debug.providerTimings
      ? { providerTimings: input.providerData.debug.providerTimings }
      : {})
  };
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
    ...(isRecord(parsed?.campaign_foundation)
      ? { campaignFoundation: parsed.campaign_foundation }
      : {}),
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
    ...(plan.campaignFoundation
      ? { campaign_foundation: plan.campaignFoundation }
      : {}),
    forbidden_opening_terms: plan.forbiddenOpeningTerms,
    narrator_instructions: plan.narratorInstructions,
    opening_quality_checks: plan.openingQualityChecks
  };
}

function formatCampaignOpeningNameBank(input: {
  campaign: CampaignRow;
  players: PlayerRow[];
  style: CampaignOpeningStyle;
}) {
  const eldermereStart = isEldermerePreset(input.style.campaignGenrePresetId)
    ? eldermereCampaignStartFromMetadata(input.campaign)
    : undefined;
  const world =
    input.style.customWorldName ??
    input.style.campaignGenre ??
    (eldermereStart ? "Eldermere" : undefined);

  return formatNameDirectorPromptContext({
    world,
    region: eldermereStart?.region.name,
    seed: [
      "campaign-opening",
      input.campaign.id,
      input.style.campaignGenrePresetId ?? "",
      world ?? "",
      eldermereStart?.region.name ?? "",
      input.players.map((player) => player.character_name).join("|")
    ].join("|"),
    targets: [
      "person",
      "settlement",
      "district",
      "tavern",
      "faction",
      "artifact",
      "monster"
    ],
    perTargetCount: 8,
    existingNames: extractExistingPromptNames(
      ...input.players.flatMap((player) => [
        player.character_name,
        player.character_sheet
      ])
    ),
    heading: "Validated name bank for this campaign opener:"
  });
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
  "Required top-level keys: public_narration, resolution_mode, roll_requests, next_input_needed, input_targets, input_policy, mechanics_state_update, inventory_state_update.",
  "Always include inventory_state_update. Use {\"patches\": []} when no inventory, equipment, or currency change is clearly resolved this turn.",
  "Treat canonical character sheet Inventory, Equipment, and Currency sections as current inventory state.",
  "Inventory possession gate: before writing any public_narration, inspect current player submissions for any item, weapon, tool, spell component, currency, carried object, or spell the character claims to produce, draw, pull from a bag, show, offer, sell, appraise, give, use, equip, throw, consume, spend, cast, or otherwise rely on.",
  "For each claimed object, compare it against that character's canonical character sheet Equipment, Inventory, Currency, and Spells sections before narrating the object into the scene.",
  "Player wording is not authoritative for possession. A player saying \"I take X from my bag\", \"I pull out X\", \"I draw X\", \"I show X\", or \"I offer X\" does not make X exist.",
  "Weapon proficiency, class, background, and backstory do not imply the character owns a weapon or item. Only listed Equipment, Inventory, Currency, and Spells establish possession.",
  "If a claimed item, currency, or spell is absent, stop resolving that attempted action. In public_narration, state in prose that the character does not have it available. Do not narrate the item appearing, being held, being inspected, being offered, being used, being cast, or being reacted to by an NPC.",
  "If a player character attempts to produce, present, show, appraise, sell, use, consume, equip, spend, give, trade, throw, load, unlock with, activate, or otherwise rely on an item or weapon, first check the canonical character sheet Inventory, Equipment, and Currency sections.",
  "If the character does not have the presented, shown, appraised, sold, used, or required item, weapon, or currency, reject the attempt in public_narration and clearly state that they do not have it. Do not narrate the missing item appearing in the scene.",
  "Do not include an inventory patch for a failed inventory attempt.",
  "If public_narration says a player character gained, lost, spent, consumed, equipped, unequipped, or transferred an item/currency, inventory_state_update must include the matching patch.",
  "Inventory patch schema: currency patches use {actor_key,type:\"currency\",currency:\"CP\"|\"SP\"|\"EP\"|\"GP\"|\"PP\",delta,reason}; item patches use {actor_key,type:\"item\",operation:\"add\"|\"remove\"|\"equip\"|\"unequip\",item,quantity,reason}.",
  "Use the exact coin denomination that changed. Copper is CP, silver is SP, electrum is EP, gold is GP, platinum is PP; never label copper as GP.",
  "If inventory_state_update.patches is non-empty, public_narration must include a concise player-visible Inventory update sentence naming what changed, such as 'Inventory update: you gained a brass key' or 'Inventory update: you dropped the torch.'",
  "Only include patches for changes that are explicit and resolved.",
  "If the action is attempted but uncertain, request the needed roll, choice, or payment and leave patches empty.",
  "input_policy must be all_players or only_targeted_players; never use acting_player.",
  "Set resolution_mode to needs_dice whenever roll_requests is non-empty or next_input_needed is dice_results; otherwise set it to resolved_without_dice.",
  "When resolution_mode is needs_dice, public_narration must not resolve the rolled outcome.",
  "In roll_requests, dice must be bare dice notation only, such as 1d20, 3d4, or 8d6. Do not include + or - modifiers in dice; put static bonuses or penalties in modifier. Example: Magic Missile uses dice \"3d4\" and modifier 3, not dice \"3d4+3\".",
  "If hostilities start while combat is inactive and enemies are ready or aware, ask player-controlled combatants for initiative in public_narration and roll_requests before resolving the attack or damage.",
  "If the acting player clearly surprises unaware enemies, resolve the opening action's required rolls first, then ask player-controlled combatants for initiative before enemy counteraction.",
  "Only request player-controlled initiative rolls in roll_requests.",
  "Roll NPC and enemy initiative yourself every time, reveal each NPC/enemy initiative roll and total in public_narration, and encode the resulting order in mechanics_state_update or combat_events.",
  "Never ask players to roll initiative, saving throws, attacks, damage, checks, or any other dice for NPCs or enemies; NPC and enemy dice are DM-side rolls that must still be visible to the players.",
  "Also include non-empty mechanics_state_update.combat with active, round, turnOwner, and provisional initiativeOrder as actor-key strings when initiative roll_requests pauses resolution.",
  "If combat turnOwner is or becomes npc:*, resolve NPC turns before returning control to players.",
  "During active combat, if next control belongs to a player turnOwner and no roll_requests are pending, set input_policy only_targeted_players and input_targets to that player actor key only; do not use all_players for ordinary turn-based combat.",
  "Off-turn player combat declarations are only stated intent, not actions already in motion; never say they are mid-swing, following immediately, or resolving before the next initiative actor.",
  "When multiple player submissions arrive in active combat, resolve the current turn owner's valid action first, keep other submissions as pending intent, and if the next actor is an enemy resolve that enemy turn before later player intent.",
  "If the stored turnOwner is an NPC key or NPC character name, do not let submitted player attacks or spells preempt that NPC turn.",
  "If a declared action needs a concrete tactical choice before dice can be interpreted, such as target, targets, spell area, Magic Missile dart distribution, weapon target, movement destination, or affected creatures, do not request dice yet.",
  "For missing tactical choices, return next_input_needed player_actions, roll_requests [], input_policy only_targeted_players, input_targets set to the acting player, and ask only for the missing choice.",
  "When a player action, spell, feature, or weapon would deal damage and that damage roll was not already submitted, do not roll damage yourself. Request the player's damage roll with next_input_needed dice_results and a structured roll_requests entry. This includes automatic-hit effects such as Magic Missile. Do not update target HP until damage is submitted.",
  "Resolve NPC attacks fully using explicit wording: 'attack roll: X vs AC Y - hit/miss'; on a hit, immediately state 'damage roll: dice = total damage', update player HP, then return control.",
  "For NPC hits, public_narration must include the words attack roll, vs AC, and damage roll before injury narration.",
  "When a player spell or feature forces an NPC or enemy saving throw, roll that save yourself before narrating success or failure, reveal the save roll and total, compare it to the player's known spell save DC when available, and do not put the NPC/enemy save in roll_requests.",
  "Never narrate a spell or feature as failing, succeeding, taking hold, being resisted, or being shaken off because of an NPC/enemy save unless public_narration first includes the visible save math line: '<Target> <Ability> save: X vs DC Y - success/failure'.",
  "Do not end an NPC turn with only a wind-up like lunges, swings, aims, starts casting, or bears down unless a player-facing roll or reaction is required first.",
  "When the final active enemy is defeated, set combat active false, turnOwner null, and initiativeOrder empty; do not say a specific combatant is up next after combat ends.",
  "Build combat actor names and keys only from the current scene and character sheets; never copy example NPC names into initiativeOrder.",
  "initiativeOrder should include active combatants only; exclude captives, bystanders, and noncombatants unless they can act in the fight."
];

const gameplayTurnModeReminder: Record<CampaignMode, string[]> = {
  single_player: [
    "Singleplayer combat reminder:",
    "Do not end with next_input_needed player_actions while turnOwner is npc:*; set turnOwner to the solo player actor key unless combat has ended.",
    "In singleplayer active combat, return control with turnOwner set to the player actor key, not null."
  ],
  multiplayer: [
    "Multiplayer combat reminder:",
    "In active initiative combat, do not end with next_input_needed player_actions while turnOwner is npc:*; resolve NPC turns until control reaches a player actor or combat ends.",
    "In active initiative combat, when control reaches a player actor and no roll_requests are pending, set turnOwner to that player actor, input_policy only_targeted_players, and input_targets to that actor key.",
    "Use turnOwner null with an all-player prompt only when combat is inactive or the scene is explicitly outside strict initiative.",
    "For multiplayer player-controlled initiative, saving throws, checks, attacks, and other targeted player rolls, set each roll_requests item's player field to the targeted character's actor key or character name."
  ]
};

function appendGameplayTurnOutputContractReminder(
  message: string,
  mode: CampaignMode
) {
  return [
    message,
    "",
    ...gameplayTurnOutputContractReminder,
    ...gameplayTurnModeReminder[mode]
  ].join("\n");
}

async function askEldermereOpeningPlanner(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  campaign: CampaignRow,
  openingRequest: string,
  turnId?: string
): Promise<EldermereOpeningPlannerResult> {
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

    return {
      plan,
      debug: eldermereOpeningPlannerDebug({
        instructions,
        message,
        providerData: initialData,
        plan
      })
    };
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

      const repairMessage = [
        "The previous Eldermere opening planner response failed validation.",
        "Return a corrected response using exactly the required JSON shape.",
        "Do not include Markdown or commentary.",
        "",
        "Original planner request:",
        message
      ].join("\n");

      return {
        plan,
        debug: eldermereOpeningPlannerDebug({
          instructions,
          message: repairMessage,
          providerData: repairData,
          plan
        })
      };
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

function buildCampaignFoundationCompilerPrompt() {
  return [
    "You are the AI Taverns campaign foundation compiler.",
    "You run after an Eldermere campaign opening planner and before long-term play has accumulated.",
    "Your job is to transform the planner's campaign foundation into durable campaign_context_chunks for future AI DM retrieval.",
    "You are not the narrator. Do not write player-facing prose. Do not continue the scene.",
    "Return strict JSON with patches, new_context_chunks, and remove_context_chunks.",
    "Use the same context patch contract as the memory/context updater.",
    "Allowed operations: append, replace_section, create_chunk, archive_chunk.",
    "Prefer create_chunk for new campaign foundation material. Prefer append only when updating an existing matching chunk from the provided index.",
    "Create rich aggregate chunks around durable retrieval anchors, usually 8-12 chunks total for a campaign opener. Do not create a separate chunk for every clue, rumor, scene detail, subtask, or minor prop.",
    "Small granular details belong inside the best parent chunk: a major NPC, player character, place, faction, active cross-cutting thread, or campaign-scale secret.",
    "Create a separate chunk only when future turns may need to retrieve that anchor independently without pulling a broader parent chunk.",
    "Do not create many near-duplicate chunks for the same anchor. Prefer one rich chunk with sections for Embedded Threads, Leads, Clues, Rumors, Related NPCs, Escalation, and Open Questions.",
    "Use these categories only: npc_context, player_character_context, combat_context, relevant_world_context, quests_open_threads, overarching_big_plot_secrets.",
    "Set visibility intentionally: player_safe only for facts, leads, pressures, or NPC details that can safely guide player-facing continuity; dm_only for hidden motives, reveal ladders, antagonist plans, true causes, secret clocks, and future twists.",
    "Visibility applies to the entire markdown string. If any bullet, parenthetical, section, clue answer, private motive, true cause, future reveal, or DM-only fact appears in the chunk, the chunk must be dm_only.",
    "Player-safe chunks must not include hidden answers in parentheses, private agendas, true culprit identities, not-yet-discovered locations, future betrayals, secret relationships, time-loop truths, divine fragments, fabricated-debt confirmations, or the actual answer to an open question.",
    "Player-safe chunks must not include parenthetical corrections that reveal the truth of a rumor, such as '(false - ...)' or '(actually ...)'. Keep rumor truth values in dm_only secret chunks.",
    "Player-safe chunks must not name not-yet-discovered hidden actors, employers, buyers, locations, ledgers, agents, or culprits. Use 'an unknown buyer', 'an undiscovered lead', or 'a hidden record' until the player discovers the name or object.",
    "Do not launder hidden facts into player_safe chunks by marking them 'rumored', 'unconfirmed', 'possible', or as a question. If the detail is a hidden ledger, secret agent, true culprit, exact hidden location, private employer, or true motive from the planner, it belongs in dm_only.",
    "Player-safe thread chunks may list immediate playable choices and unconfirmed rumors, but their Escalation sections must not name hidden antagonists, hidden destinations, or future secret events. Either make the thread dm_only or describe escalation generically, such as 'the unknown buyer acts first' or 'the trail grows colder'.",
    "Never put a section labeled DM Eyes Only, Hidden Truth, Future Reveal Paths, true cause, private motive, or secret clock inside a player_safe chunk. If that section is needed, move it to a secret:* dm_only chunk or make the entire chunk dm_only.",
    "For an anchor with both public continuity and hidden truth, split it into a player_safe parent chunk and a dm_only secret chunk. Only make the parent chunk dm_only when there is no player-safe rumor, lead, place-name, symbol, or local pressure to preserve yet.",
    "Player-safe chunks may include mysteries as mysteries: use 'Unknown', 'rumored', 'unconfirmed', or 'not yet discovered' instead of revealing the true answer.",
    "Treat Pageden/canonical Eldermere material as source-grounded world truth. Treat planner-created links, motives, clocks, and secrets as campaign-local premises until established through play.",
    "Every chunk should label its epistemic status with sections or bullets such as Canonical Grounding, Campaign-Local Premise, Established Facts, Strong Inferences, DM Seeds, Hidden Truth, Future Reveal Paths, Constraints, or Open Questions.",
    "When an anchor has both player-safe continuity and hidden truth, create a public/world or NPC chunk plus a DM-only secret chunk only when both need independent retrieval. Example: world:sunder-kiln for known leads, rumors, local pressures, and playable context, plus secret:sunder-kiln for the time-loop truth and reveal ladder.",
    "Do not resolve long-term secrets immediately. Preserve a long runway for discovery, player choice, and the player leaving a mark on Eldermere.",
    "Use stable ids with prefixes: npc:kebab-case-name, world:kebab-case-name, faction:kebab-case-name, thread:kebab-case-name, secret:kebab-case-name, or pc:kebab-case-name.",
    "Do not create secret companion chunks with npc:* or thread:* ids such as npc:name-secrets or thread:name-secrets. If the chunk is mainly hidden truth, private motive, or reveal ladder, its context_id must start with secret: and its context_type must be overarching_big_plot_secrets.",
    "NPC chunks must use context_type npc_context and the NPC card section structure from the memory updater where possible.",
    "Every campaign-important named NPC from the planner must receive an npc:* chunk, including missing mentors, off-screen patrons, not-yet-met antagonists, and dead or endangered anchors. Do not replace an important NPC chunk with only a thread, faction, world, or secret chunk.",
    "NPC id slugs must preserve word boundaries with hyphens, especially personal names: use npc:lysa-marvelbridge, not npc:lysamarvelbridge.",
    "For a missing NPC, create a player_safe npc:* chunk with what is known, rumors, relationships, and open questions. Put their true fate, secret location, private discoveries, or reveal ladder in a paired secret:* chunk if needed.",
    "For a not-yet-met antagonist, private buyer, secret employer, or hidden patron whose name has not been discovered in play, create the npc:* chunk as dm_only. Do not make a player_safe NPC chunk that names the hidden antagonist as a rumor or open question.",
    "World chunks should cover living local context, locations, factions, hazards, artifacts, or recurring symbols.",
    "Major hidden places, artifacts, or institutions named by the planner should usually receive a relevant_world_context chunk. If player-facing rumors, leads, symbols, missing-person clues, or local pressures point toward that anchor, make the world chunk player_safe and keep it mystery-forward.",
    "A world:* chunk for a hidden place must not contain the true nature, private location, reveal ladder, bound entities, antagonist plan, or final answer. Put those in the paired secret:* chunk.",
    "If the planner names a major hidden ruin, dungeon, artifact, chamber, or location as a destination or long-term anchor, create a world:<anchor> chunk with context_type relevant_world_context. If that anchor has hidden truth or a reveal ladder, also create secret:<same-anchor> with context_type overarching_big_plot_secrets, using the exact same kebab-case slug after the prefix. Do not add suffixes like -truth, -secrets, -mystery, or -reveal to the paired secret id.",
    "Do not satisfy a named major anchor with only a broader region, faction, or thread chunk. If the planner names the Sunder Kiln, create world:sunder-kiln and secret:sunder-kiln specifically.",
    "Thread chunks should cover active objectives, mysteries, obligations, faction pressures, or choice points only when the thread cuts across multiple anchors. Otherwise embed the thread inside the relevant parent chunk.",
    "Secret chunks should cover reveal ladders, hidden truths, long-term antagonistic plans, or campaign-scale mysteries.",
    "Required invariant: if a player_safe world:<anchor> chunk exists for a major hidden place with campaign-scale truth, a dm_only secret:<same-anchor> chunk must also exist. For Sunder Kiln specifically, world:sunder-kiln and secret:sunder-kiln must both exist.",
    "Do not use a catch-all secret such as secret:campaign-core, secret:hidden-agendas, or secret:revelation-ladder as a substitute for a required named secret anchor. Catch-all secret chunks are allowed only after all required named secret anchors have been created.",
    "Before returning, audit every player_safe chunk and remove or move any of these examples to dm_only: 'duplicate ledger hidden in his room', 'half-burned map in her room', 'the buyer's agent will retrieve notes', 'Garrick is the buyer', 'Fara works for Garrick', 'Lysa is alive/trapped', 'the ruin is a time-loop chamber', or any equivalent hidden-answer wording.",
    "Safe public rewrites are acceptable: 'a missing record may exist', 'Lysa's lodging may contain a lead', 'an unknown buyer may act first', 'someone is destroying evidence', 'the ruin may hold old imperial machinery', 'the sinkhole may be connected'.",
    "If you cannot make a player_safe chunk useful without those hidden facts, set that chunk visibility to dm_only instead.",
    "For Eldermere campaign foundations, ensure the output covers the player character, every important NPC including missing or not-yet-met anchors, the starting place, major local institutions or factions, major hidden places or artifacts, the primary active thread, and the major DM-only secrets.",
    "If the planner names a missing mentor, patron, antagonist, key faction, major ruin, or collapse clock, that anchor should appear either as its own chunk or as a clearly labeled section inside a richer parent chunk.",
    "Return new_context_chunks as an array. Each item must use exactly these fields: context_id, context_type, title, visibility, markdown.",
    "Never use chunk_id, chunkId, content, body, body_markdown, or nested JSON for a new_context_chunks item. The markdown field must be a single Markdown string.",
    "Return patches as an array, even when empty. Return remove_context_chunks as an array, even when empty.",
    "Exact output shape example:",
    JSON.stringify(
      {
        patches: [],
        new_context_chunks: [
          {
            context_id: "world:major-anchor",
            context_type: "relevant_world_context",
            title: "Major Anchor",
            visibility: "player_safe",
            markdown:
              "# Major Anchor\n\n## Canonical Grounding\n- Source-grounded world truth.\n\n## Campaign-Local Premise\n- Campaign-specific material from the planner.\n\n## Embedded Threads\n- Related clue, rumor, and objective details that do not need separate chunks yet.\n\n## Related NPCs\n- Names and relationships.\n\n## Open Questions\n- Questions for future play."
          },
          {
            context_id: "secret:major-anchor",
            context_type: "overarching_big_plot_secrets",
            title: "Major Anchor Secret",
            visibility: "dm_only",
            markdown:
              "# Major Anchor Secret\n\n## Hidden Truth\n- True cause or secret state.\n\n## Evidence Planted\n- Clues that can surface later.\n\n## Future Reveal Paths\n- How the truth can be discovered over time.\n\n## Constraints\n- Do not resolve too soon."
          }
        ],
        remove_context_chunks: []
      },
      null,
      2
    ),
    "Never invent player decisions that have not happened. Do not say the player trusts, accepts, refuses, discovers, defeats, or resolves anything unless established in the opening input.",
    "Return exactly one JSON object and no Markdown outside JSON."
  ].join("\n");
}

function formatCampaignFoundationCompilerRequest(input: {
  campaign: CampaignRow;
  openingRequest: string;
  plan: EldermereOpeningPlan;
  contextChunkIndex: ContextChunkIndex;
}) {
  return [
    "Campaign ID:",
    input.campaign.id,
    "",
    "Canonical Eldermere context for this selected start:",
    formatEldermereOpeningPromptContext(
      eldermereCampaignStartFromMetadata(input.campaign)
    ),
    "",
    "Opening request and canonical character/backstory context:",
    input.openingRequest,
    "",
    "Eldermere opening planner output JSON:",
    JSON.stringify(openingPlanToJson(input.plan), null, 2),
    "",
    "Existing context chunk index:",
    formatContextChunkIndexForMemoryUpdater(input.contextChunkIndex),
    "",
    "Output reminder:",
    "Return JSON with patches, new_context_chunks, and remove_context_chunks only."
  ].join("\n");
}

async function runEldermereCampaignFoundationCompiler(
  db: Queryable,
  runtime: DungeonMasterRuntime,
  input: {
    campaign: CampaignRow;
    openingRequest: string;
    plan: EldermereOpeningPlan;
    turnId?: string | undefined;
  }
): Promise<ContextStorageDebugState | undefined> {
  const traceId = randomUUID();
  const startedAt = Date.now();

  try {
    const contextChunkIndex = await listCampaignContextChunkIndex(
      db,
      input.campaign.id
    );
    const instructions = buildCampaignFoundationCompilerPrompt();
    const message = formatCampaignFoundationCompilerRequest({
      campaign: input.campaign,
      openingRequest: input.openingRequest,
      plan: input.plan,
      contextChunkIndex
    });

    await logDmTurnTrace(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      phase: "campaign_foundation_compiler_started",
      payload: {
        message: textStats(message),
        instructions: textStats(instructions),
        campaignTitle: input.plan.campaignTitle,
        region: input.plan.region.name,
        startingLocation: input.plan.startingLocation.name
      }
    });

    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      instructions,
      message,
      history: []
    });

    await logDmModelCall(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      phase: "campaign_foundation_compiler",
      providerData,
      durationMs: Date.now() - providerStartedAt
    });

    const parsed = parseJsonRecord(providerData.content);
    const foundationChunkPatches = Array.isArray(parsed?.new_context_chunks)
      ? sanitizeCampaignFoundationCompilerChunks(
          parsed.new_context_chunks.map((chunk) =>
            normalizeNewContextChunkPatch(chunk)
          )
        )
      : [];
    const proposedPatches = [
      ...(Array.isArray(parsed?.patches) ? parsed.patches : []),
      ...foundationChunkPatches,
      ...(Array.isArray(parsed?.remove_context_chunks)
        ? parsed.remove_context_chunks.map((chunk) => ({
            operation: "archive_chunk",
            context_id:
              typeof chunk === "string" ? chunk : eventPayload(chunk).context_id
          }))
        : [])
    ];
    const existingContextIds = await listCampaignContextIds(
      db,
      input.campaign.id
    );
    const validation = validateMemoryPatches(
      proposedPatches,
      existingContextIds
    );

    await applyAcceptedMemoryPatches(
      db,
      input.campaign.id,
      validation.accepted
    );

    const contextStorageState = await retrieveCampaignContextStorageState(
      db,
      input.campaign.id
    );
    const contextStorageDebugState =
      campaignContextStorageDebugState(contextStorageState);

    await logDmTurnTrace(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      phase: "campaign_foundation_compiler_completed",
      payload: {
        proposedPatchCount: proposedPatches.length,
        acceptedPatchCount: validation.accepted.length,
        discardedPatchCount: validation.discarded.length,
        contextChunkCount: contextStorageDebugState.contextChunkCount,
        durationMs: Date.now() - startedAt
      }
    });

    await logDmTurnTrace(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      phase: "context_storage_state_snapshot",
      payload: contextStorageDebugState
    });

    await logDmMemoryPatchLog(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "campaign_foundation_compiler",
        proposedPatches,
        acceptedPatches: validation.accepted,
        discardedPatches: validation.discarded,
        durationMs: Date.now() - startedAt
      }
    });

    runtime.emitDmStreamEvent?.({
      type: "room_updated",
      roomId: input.campaign.id,
      updatedAt: contextStorageDebugState.capturedAt
    });

    return contextStorageDebugState;
  } catch (error) {
    await logDmMemoryPatchLog(db, {
      campaignId: input.campaign.id,
      traceId,
      turnId: input.turnId,
      payload: {
        source: "campaign_foundation_compiler",
        failed: true,
        error: errorSummary(error),
        durationMs: Date.now() - startedAt
      }
    });

    return undefined;
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
    model?: AiModelId;
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
            baseInstructions: instructionsWithWorldContext,
            ...(options?.model ? { model: options.model } : {})
          })
        : await buildModularDmPromptContext(db, runtime, campaign, {
            traceId,
            turnId,
            currentAction: message,
            baseInstructions: instructionsWithWorldContext,
            history,
            ...(options?.model ? { model: options.model } : {})
          })
      : null;
    const providerMessage = appendGameplayTurnOutputContractReminder(
      promptContext?.message ?? message,
      campaign.mode
    );
    const providerStartedAt = Date.now();
    const providerData = await runtime.askProvider({
      message: providerMessage,
      instructions: promptContext?.instructions ?? instructionsWithWorldContext,
      history,
      ...(currentPlayerAction ? { currentPlayerAction } : {}),
      ...(promptContext?.jobNeeded ? { dmJob: promptContext.jobNeeded } : {}),
      ...(options?.model ? { model: options.model } : {}),
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
    let contractParseRecovery:
      | ReturnType<typeof recoverDmContractAfterParseFailure>
      | undefined;

    try {
      outputEnvelope = validateMainDmOutput(providerData.content);
    } catch (error) {
      outputEnvelopeError = error;
    }

    const contractParseOptions = {
        ...contractOptions,
        currentAction: message,
        ...(currentPlayerAction ? { currentPlayerAction } : {})
      };
    let contract: DmContractResponse;

    try {
      contract = parseDmContract(providerData.content, contractParseOptions);
    } catch (error) {
      const recovery = recoverDmContractAfterParseFailure(providerData.content);

      if (!recovery) {
        throw error;
      }

      contractParseRecovery = recovery;
      contract = recovery.contract;

      await logTurnDebugTrace(db, {
        campaignId: campaign.id,
        traceId,
        phase: "dm_contract_parse_recovered",
        turnId,
        elapsedMs: Date.now() - startedAt,
        payload: {
          error: errorSummary(error),
          recovery: recovery.report,
          contractFailure: debugDmContractFailure(
            providerData.content,
            contractParseOptions
          )
        }
      });
    }

    const rollRequests = normalizeRollRequests(contract.rollRequests);
    const rollRequestDiagnosticsReport = rollRequestDiagnostics(rollRequests);
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
    const inventoryPlayers = contract.inventoryStateUpdate?.patches.length
      ? await getActiveCampaignPlayers(db, campaign.id)
      : [];
    const inventoryValidation = validateInventoryPatches(
      contract.inventoryStateUpdate?.patches ?? [],
      inventoryPlayers
    );
    const mechanicsState = resolveMechanicsState(campaign, []);
    const normalizedInputControl = normalizeCombatInputControl(
      applyMechanicsStateUpdate(mechanicsState, contract.mechanicsStateUpdate, nowIso()),
      {
        mode: campaign.mode,
        nextInputNeeded: contract.nextInputNeeded,
        rollRequests,
        inputTargets: contract.inputTargets,
        inputPolicy: contract.inputPolicy
      }
    );
    const nextMechanicsState = normalizedInputControl.mechanicsState;

    if (nextMechanicsState !== mechanicsState) {
      await writeMechanicsStateForLockedCampaign(
        db,
        campaign.id,
        nextMechanicsState
      );
    }
    const appliedInventoryPatches =
      inventoryValidation.accepted.length > 0
        ? await applyAcceptedInventoryPatches(
            db,
            inventoryPlayers,
            inventoryValidation.accepted
          )
        : [];
    const reply = narrationWithInventoryUpdate(
      contract.publicNarration,
      appliedInventoryPatches
    );
    const routerDebug = routerDebugFromPromptContext(promptContext);
    const debugWithCombatState: AiDebugInfo = {
      ...providerData.debug,
      combatState: {
        combat: nextMechanicsState.combat,
        actors: nextMechanicsState.actors
      },
      ...(contract.inventoryStateUpdate || inventoryValidation.discarded.length > 0
        ? {
            inventoryState: {
              proposedPatches: contract.inventoryStateUpdate?.patches ?? [],
              acceptedPatches: inventoryValidation.accepted,
              appliedPatches: appliedInventoryPatches,
              discardedPatches: inventoryValidation.discarded
            }
          }
        : {}),
      ...(routerDebug ? { router: routerDebug } : {})
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
        rollRequestDiagnostics: rollRequestDiagnosticsReport,
        nextInputNeeded: contract.nextInputNeeded,
        contractParseRecovered: Boolean(contractParseRecovery),
        contractParseRecovery: contractParseRecovery?.report,
        inputPolicy: normalizedInputControl.inputPolicy,
        inputTargets: normalizedInputControl.inputTargets,
        originalInputPolicy: contract.inputPolicy,
        originalInputTargets: contract.inputTargets,
        resolutionMode: contract.resolutionMode
      }
    });

    if (rollRequestDiagnosticsReport.length > 0) {
      await logTurnDebugTrace(db, {
        campaignId: campaign.id,
        traceId,
        phase: "dm_roll_request_diagnostics",
        turnId,
        elapsedMs: Date.now() - startedAt,
        payload: {
          diagnostics: rollRequestDiagnosticsReport,
          rollRequests
        }
      });
    }

    await logDmOutputReport(db, {
      campaignId: campaign.id,
      traceId,
      turnId,
      payload: {
        outputEnvelopeValidated: Boolean(outputEnvelope),
        outputEnvelopeError: outputEnvelopeError
          ? errorSummary(outputEnvelopeError)
          : undefined,
        contractParseRecovered: Boolean(contractParseRecovery),
        contractParseRecovery: contractParseRecovery?.report,
        rollRequestsCount: rollRequests.length,
        rollRequestDiagnostics: rollRequestDiagnosticsReport,
        acceptedCombatEventsCount: combatValidation.accepted.length,
        discardedCombatEvents: combatValidation.discarded,
        acceptedImmediateContextUpdatesCount: memoryValidation.accepted.length,
        discardedImmediateContextUpdates: memoryValidation.discarded,
        acceptedInventoryPatchesCount: inventoryValidation.accepted.length,
        discardedInventoryPatches: inventoryValidation.discarded
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
      inputTargets: normalizedInputControl.inputTargets,
      inputPolicy: normalizedInputControl.inputPolicy,
      nextInputNeeded: contract.nextInputNeeded,
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
  inputPolicy: InputPolicy,
  nextInputNeeded: DmNextInputNeeded
) {
  const shouldTargetPlayers =
    inputPolicy === "only_targeted_players" && inputTargets.length > 0;

  await db.query(
    `
      update campaigns
      set metadata = case
        when $2::jsonb = '[]'::jsonb and $4::text = 'player_actions'
          then metadata - 'inputTargets' - 'inputPolicy' - 'nextInputNeeded'
        else jsonb_set(
          jsonb_set(
            jsonb_set(metadata, '{inputTargets}', $2::jsonb, true),
            '{inputPolicy}',
            $3::jsonb,
            true
          ),
          '{nextInputNeeded}',
          to_jsonb($4::text),
          true
        )
      end
      where id = $1
    `,
    [
      campaignId,
      JSON.stringify(shouldTargetPlayers ? inputTargets : []),
      JSON.stringify(shouldTargetPlayers ? inputPolicy : "all_players"),
      nextInputNeeded
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
    nextInputNeeded?: DmNextInputNeeded;
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
      nextInputNeeded:
        input.nextInputNeeded ??
        (pendingRollRequests.length > 0 ? "dice_results" : "player_actions"),
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
      input.inputPolicy ?? "all_players",
      input.nextInputNeeded ??
        (pendingRollRequests.length > 0 ? "dice_results" : "player_actions")
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
    let foundationCompilerPromise:
      | Promise<ContextStorageDebugState | undefined>
      | undefined;
    const opening = hasEldermereWorldProfile(beginState.campaign)
      ? await (async () => {
          const plan = await askEldermereOpeningPlanner(
            db,
            runtime,
            beginState.campaign,
            openingRequest,
            openingTurn.id
          );
          await persistEldermereOpeningPlan(
            db,
            beginState.campaign.id,
            plan.plan
          );
          foundationCompilerPromise = runEldermereCampaignFoundationCompiler(
            db,
            runtime,
            {
              campaign: beginState.campaign,
              openingRequest,
              plan: plan.plan,
              turnId: openingTurn.id
            }
          );

          const opening = await askEldermereOpeningNarrator(
            db,
            runtime,
            beginState.campaign,
            openingRequest,
            openingSceneInstructions("multiplayer"),
            plan.plan,
            openingTurn.id,
            { allowResolvedCombatWithoutRolls: true }
          );

          return {
            ...opening,
            debug: {
              ...opening.debug,
              eldermereOpeningPlanner: plan.debug
            }
          };
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
      nextInputNeeded: opening.nextInputNeeded,
      resolutionMode: opening.resolutionMode,
      setting: opening.setting,
      aiDebug: opening.debug
    });

    const foundationContextStorageState = await foundationCompilerPromise;

    if (foundationContextStorageState) {
      await attachContextStorageStateToDmEventDebug(db, {
        campaignId: beginState.campaign.id,
        dmEventId: resolvedTurn.dmEventId,
        contextStorageState: foundationContextStorageState
      });

      runtime.emitDmStreamEvent?.({
        type: "room_updated",
        roomId: beginState.campaign.id,
        updatedAt: foundationContextStorageState.capturedAt,
        eventId: resolvedTurn.dmEventId
      });
    }

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
    model?: AiModelId;
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
    const campaignMetadata = eventPayload(campaignRow.metadata);
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
      player,
      {
        inputTargets,
        inputPolicy,
        isExplicitBroadInput:
          campaignMetadata.inputPolicy === "all_players" && inputTargets.length === 0
      }
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
        submitState.turn.id,
        undefined,
        undefined,
        input.model ? { model: input.model } : undefined
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
        nextInputNeeded: reply.nextInputNeeded,
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
    model?: AiModelId;
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
          baseInstructions: instructions,
          ...(input.model ? { model: input.model } : {})
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
      ...(input.model ? { model: input.model } : {}),
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
    model?: AiModelId;
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
    const inputTargets = inputTargetsFromCampaign(campaign);
    const inputPolicy = inputPolicyFromCampaign(campaign);
    const campaignMetadata = eventPayload(campaign.metadata);
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
      player,
      {
        inputTargets,
        inputPolicy,
        isExplicitBroadInput:
          campaignMetadata.inputPolicy === "all_players" && inputTargets.length === 0
      }
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
      soloState.content,
      undefined,
      input.model ? { model: input.model } : undefined
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
      nextInputNeeded: reply.nextInputNeeded,
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
    await setPendingInputTargets(
      client,
      campaign.id,
      [],
      "all_players",
      "player_actions"
    );

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
      nextInputNeeded: reply.nextInputNeeded,
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

export const __dbTestInternals = {
  applyAcceptedInventoryPatches,
  applyAcceptedMemoryPatch,
  campaignContextStorageDebugState,
  formatDmGuidance,
  formatLivingWorldPressureEngineRequest,
  getLatestLivingWorldCoveredMessageCount,
  inventoryUpdateSentence,
  narrationWithInventoryUpdate,
  normalizeNewContextChunkPatch,
  validateInventoryPatches
};
