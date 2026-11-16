import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { AuthPasswordlessStartResponseSchema } from "@ai-dnd/contracts";
import type { DungeonMasterRuntime } from "@ai-dnd/db";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

export let app: FastifyInstance;
export let database: FakeDatabase;
let providerInputs: {
  message: string;
  instructions: string;
  currentPlayerAction?: string;
  dmJob?: string;
  model?: string;
  temperature?: number;
  history: { role: string; content: string }[];
}[] = [];
type AskProvider = DungeonMasterRuntime["askProvider"];
let providerOverride: AskProvider | undefined;

type QueryResult<T> = {
  rows: T[];
};

type QueryFn = <T = unknown>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

export type DebugFields = {
  model?: unknown;
  providerResponseId?: unknown;
  rawResponse?: unknown;
  temperature?: unknown;
  combatState?: unknown;
  inventoryState?: unknown;
  contextStorageState?: unknown;
  livingWorldPressureEngine?: unknown;
  combatAdjudication?: unknown;
  eldermereOpeningPlanner?: unknown;
  router?: unknown;
  askDmContextSelector?: unknown;
};

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
  onboarding_completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  subscription_tier_id?: number;
};

type AuthIdentityRecord = {
  id: string;
  user_id: string;
  provider: "email" | "google";
  provider_subject: string;
  email: string;
  created_at: Date;
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
  session_id: string;
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
  combat_cheat_sheet?: string | null;
  combat_cheat_sheet_updated_at?: Date | null;
  combat_cheat_sheet_source_hash?: string | null;
  slot: number | null;
  status: "active" | "left" | "kicked";
  last_seen_at: Date;
  kicked_at: Date | null;
  created_at: Date;
  updated_at: Date;
  portrait_asset_id: string | null;
  portrait_public_url?: string | null;
};

type MediaAssetRecord = {
  id: string;
  owner_user_id: string | null;
  campaign_id: string | null;
  player_id: string | null;
  kind: "character_portrait" | "campaign_cover" | "npc_portrait";
  status: "pending" | "ready" | "failed" | "deleted";
  storage_provider: "local" | "digitalocean_spaces" | "s3";
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

type CampaignInviteRecord = {
  id: string;
  campaign_id: string;
  token_hash: string;
  enabled: boolean;
  max_uses: number | null;
  use_count: number;
  expires_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  disabled_at: Date | null;
  disabled_by_user_id: string | null;
};

type CampaignInviteUseRecord = {
  id: string;
  invite_id: string;
  campaign_id: string;
  joined_user_id: string;
  player_id: string;
  used_at: Date;
};

type TurnRecord = {
  id: string;
  campaign_id: string;
  status: "collecting" | "resolving" | "resolved" | "failed" | "cancelled";
  error?: string | null;
  created_at: Date;
  updated_at: Date;
};

type SubmissionRecord = {
  campaign_id: string;
  turn_id: string;
  player_id: string;
  content: string;
  status: "submitted" | "included_in_turn" | "cancelled";
  created_at: Date;
};

type CampaignEventRecord = {
  id: string;
  campaign_id: string;
  type: string;
  payload: unknown;
  created_at: Date;
};

function recentRoomEventRank(type: string) {
  switch (type) {
    case "dm_answer":
      return 0;
    case "turn_resolved":
    case "adventure_begun":
      return 1;
    case "dm_question":
      return 2;
    case "turn_submitted":
      return 3;
    default:
      return 4;
  }
}

function chronologicalRoomEventRank(type: string) {
  switch (type) {
    case "turn_submitted":
    case "dm_question":
      return 0;
    case "turn_resolved":
    case "adventure_begun":
    case "dm_answer":
      return 1;
    default:
      return 2;
  }
}

function compareEventIdAsc(left: CampaignEventRecord, right: CampaignEventRecord) {
  return left.id.localeCompare(right.id);
}

function compareEventIdDesc(left: CampaignEventRecord, right: CampaignEventRecord) {
  return right.id.localeCompare(left.id);
}

type CombatEventRecord = {
  id: string;
  campaign_id: string;
  active_combat_id: string | null;
  turn_id: string | null;
  event_type: string;
  payload: unknown;
  created_at: Date;
};

type ContextChunkRecord = {
  campaign_id: string;
  context_key: string;
  category: string;
  title: string;
  visibility: "player_safe" | "dm_only";
  priority: number;
  body_markdown: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type CampaignTurnSummaryRecord = {
  campaign_id: string;
  turn_id: string;
  event_id: string | null;
  summary: string;
  completed_beats: unknown;
  entity_keys: unknown;
  open_thread_keys: unknown;
  certainty_notes: unknown;
  token_estimate: number;
  source_checksum: string;
  created_at: Date;
};

type DmTurnTraceRecord = {
  id: string;
  campaign_id: string;
  trace_id: string;
  turn_id: string | null;
  phase: string;
  elapsed_ms: number | null;
  payload: unknown;
  created_at: Date;
};

type DmModelCallRecord = {
  id: string;
  campaign_id: string;
  trace_id: string;
  turn_id: string | null;
  phase: string;
  provider: string | null;
  model: string | null;
  raw_response: string | null;
  metadata: unknown;
  created_at: Date;
};

type CampaignDmGuidanceRecord = {
  campaign_id: string;
  trace_id: string;
  covered_message_count: number;
  guidance: Record<string, unknown>;
  updated_at: Date;
};

type LivingWorldEngineRunRecord = {
  id: string;
  campaign_id: string;
  trace_id: string;
  turn_id: string | null;
  covered_message_count: number;
  accepted_patch_count: number;
  discarded_patch_count: number;
  guidance: unknown;
  payload: unknown;
  created_at: Date;
};

class FakeDatabase {
  loginTokens: LoginTokenRecord[] = [];
  users: UserRecord[] = [];
  authIdentities: AuthIdentityRecord[] = [];
  sessions: SessionRecord[] = [];
  campaigns: CampaignRecord[] = [];
  players: PlayerRecord[] = [];
  joinCodes: JoinCodeRecord[] = [];
  campaignInvites: CampaignInviteRecord[] = [];
  campaignInviteUses: CampaignInviteUseRecord[] = [];
  campaignEvents: CampaignEventRecord[] = [];
  combatEvents: CombatEventRecord[] = [];
  mediaAssets: MediaAssetRecord[] = [];
  contextChunks: ContextChunkRecord[] = [];
  campaignTurnSummaries: CampaignTurnSummaryRecord[] = [];
  dmTurnTraces: DmTurnTraceRecord[] = [];
  dmModelCalls: DmModelCallRecord[] = [];
  campaignDmGuidance: CampaignDmGuidanceRecord[] = [];
  livingWorldEngineRuns: LivingWorldEngineRunRecord[] = [];
  turns: TurnRecord[] = [];
  submissions: SubmissionRecord[] = [];
  nextId = 1;

  query: QueryFn = async <T>(sql: string, values: unknown[] = []) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (
      normalizedSql === "begin" ||
      normalizedSql === "commit" ||
      normalizedSql.startsWith("savepoint ") ||
      normalizedSql.startsWith("rollback to savepoint ") ||
      normalizedSql.startsWith("release savepoint ")
    ) {
      return { rows: [] as T[] };
    }

    if (normalizedSql === "rollback") {
      return { rows: [] as T[] };
    }

    if (normalizedSql === "select pg_notify($1, $2)") {
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

    if (
      normalizedSql.startsWith(
        "select id, email, display_name, onboarding_completed_at, created_at, updated_at, subscription_tier_id from users where email = $1"
      )
    ) {
      const user = this.users.find((candidate) => candidate.email === values[0]);
      return { rows: user ? [user as T] : ([] as T[]) };
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
          onboarding_completed_at: null,
          created_at: new Date(),
          updated_at: new Date()
          ,subscription_tier_id: (values[2] as number | undefined) ?? 4
        };
        this.users.push(user);
      } else if (displayName) {
        user.display_name = displayName;
        user.updated_at = new Date();
      }

      return { rows: [user as T] };
    }

    if (normalizedSql.startsWith("update users set onboarding_completed_at")) {
      const user = this.users.find((candidate) => candidate.id === values[0]);

      if (user && user.onboarding_completed_at === null) {
        user.onboarding_completed_at = new Date();
        user.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql === "select subscription_tier_id from users where id = $1") {
      const user = this.users.find((candidate) => candidate.id === values[0]);
      return { rows: user ? ([{ subscription_tier_id: user.subscription_tier_id ?? 4 } as T]) : ([] as T[]) };
    }

    if (normalizedSql.startsWith("select resource_type, used from user_usage_counters")) return { rows: [] as T[] };
    if (normalizedSql.startsWith("select count(*)::int as count from campaigns where owner_user_id")) {
      const count = this.campaigns.filter((campaign) => campaign.owner_user_id === values[0] && campaign.status === "active").length;
      return { rows: [{ count } as T] };
    }
    if (normalizedSql.startsWith("select count(*) filter (where status in ('ready', 'deleted'))::int as used")) return { rows: [{ used: 0, in_flight: 0 } as T] };
    if (normalizedSql.startsWith("select 1 from user_usage_events")) return { rows: [] as T[] };
    if (normalizedSql.startsWith("insert into user_usage_counters")) return { rows: [{ used: 1 } as T] };
    if (normalizedSql.startsWith("insert into user_usage_events")) return { rows: [] as T[] };
    if (normalizedSql.startsWith("select id from media_assets where campaign_id=$1 and player_id=$2")) return { rows: [] as T[] };

    if (normalizedSql.startsWith("insert into auth_identities")) {
      const provider = normalizedSql.includes("values ($1, 'google'")
        ? "google"
        : "email";
      const record: AuthIdentityRecord = {
        id: `auth-identity-${this.nextId++}`,
        user_id: values[0] as string,
        provider,
        provider_subject: values[1] as string,
        email: (provider === "google" ? values[2] : values[1]) as string,
        created_at: new Date()
      };
      const existing = this.authIdentities.find(
        (identity) =>
          identity.provider === record.provider &&
          identity.provider_subject === record.provider_subject
      );

      if (existing) {
        existing.email = record.email;
      } else {
        this.authIdentities.push(record);
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "select users.id, users.email, users.display_name"
      ) &&
      normalizedSql.includes("from auth_identities")
    ) {
      const provider = values[0] as "email" | "google";
      const providerSubject = values[1] as string;
      const identity = this.authIdentities.find(
        (candidate) =>
          candidate.provider === provider &&
          candidate.provider_subject === providerSubject
      );

      if (!identity) {
        return { rows: [] as T[] };
      }

      const user = this.users.find(
        (candidate) => candidate.id === identity.user_id
      );

      return { rows: user ? [user as T] : [] };
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
            onboarding_completed_at: user.onboarding_completed_at,
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

    if (normalizedSql.startsWith("select * from campaigns where (id = $1")) {
      const roomId = values[0] as string;
      const sessionId = values[1] as string;
      const campaign = this.campaigns.find(
        (candidate) =>
          (candidate.id === roomId || candidate.session_id === sessionId) &&
          candidate.status !== "deleted"
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql.startsWith(
        "select * from campaigns where (session_id = $1"
      )
    ) {
      const roomId = values[0] as string;
      const sessionId = values[1] as string;
      const campaign = this.campaigns.find(
        (candidate) =>
          (candidate.session_id === roomId ||
            candidate.session_id === sessionId) &&
          candidate.status !== "deleted"
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (normalizedSql === "select * from campaigns where id = $1 for update") {
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === values[0]
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (normalizedSql === "select * from campaigns where id = $1 limit 1") {
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === values[0]
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql ===
      "select * from campaigns where id = $1 and status = 'active' limit 1"
      || normalizedSql ===
      "select * from campaigns where id = $1 and status = 'active' limit 1 for update"
      || normalizedSql ===
      "select * from campaigns where id = $1 and status = 'active' and mode = 'multiplayer' limit 1"
    ) {
      const campaign = this.campaigns.find(
        (candidate) =>
          candidate.id === values[0] &&
          candidate.status === "active" &&
          (!normalizedSql.includes("mode = 'multiplayer'") ||
            candidate.mode === "multiplayer")
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql.startsWith(
        "select campaigns.metadata, campaigns.mode, players.character_sheet from campaigns join players"
      )
    ) {
      const campaignId = values[0] as string;
      const userId = values[1] as string;
      const campaign = this.campaigns.find(
        (candidate) =>
          candidate.id === campaignId && candidate.status === "active"
      );
      const player = campaign
        ? this.players.find(
            (candidate) =>
              candidate.campaign_id === campaign.id &&
              candidate.user_id === userId &&
              candidate.status === "active"
          )
        : undefined;

      return {
        rows:
          campaign && player
            ? ([
                {
                  metadata: campaign.metadata,
                  mode: campaign.mode,
                  character_sheet: player.character_sheet
                }
              ] as T[])
            : ([] as T[])
      };
    }

    if (
      normalizedSql ===
      "select * from campaigns where id = $1 and status <> 'deleted' limit 1"
      || normalizedSql ===
      "select * from campaigns where id = $1 and status <> 'deleted' limit 1 for update"
    ) {
      const campaign = this.campaigns.find(
        (candidate) =>
          candidate.id === values[0] && candidate.status !== "deleted"
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (normalizedSql.startsWith("update campaigns set has_begun = true")) {
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === values[0]
      );

      if (!campaign || campaign.has_begun) {
        return { rows: [] as T[] };
      }

      campaign.has_begun = true;
      campaign.updated_at = new Date();
      return { rows: [campaign as T] };
    }

    if (normalizedSql.startsWith("update players set last_seen_at = now()")) {
      if (normalizedSql.includes("where campaign_id = $1")) {
        const campaignId = values[0] as string;
        const userId = values[1] as string;
        const updated = this.players.filter(
          (player) =>
            player.campaign_id === campaignId &&
            player.user_id === userId &&
            player.status === "active"
        );

        for (const player of updated) {
          player.last_seen_at = new Date();
        }

        return { rows: updated as T[] };
      }

      const player = this.players.find((candidate) => candidate.id === values[0]);

      if (player) {
        player.last_seen_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith("select campaigns.*,") &&
      normalizedSql.includes("display_player.character_name")
    ) {
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
        const currentPlayer = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaign.id &&
            candidate.status === "active" &&
            candidate.user_id === userId
        ) ??
          this.players.find(
            (candidate) =>
              campaign.owner_user_id === userId &&
              campaign.owner_client_id &&
              candidate.campaign_id === campaign.id &&
              candidate.status === "active" &&
              candidate.client_id === campaign.owner_client_id
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
              current_user_player_id: currentPlayer?.client_id ?? null,
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
          const currentPlayer = this.players.find(
            (candidate) =>
              candidate.campaign_id === campaign.id &&
              candidate.status === "active" &&
              candidate.user_id === userId
          ) ??
            this.players.find(
              (candidate) =>
                campaign.owner_user_id === userId &&
                campaign.owner_client_id &&
                candidate.campaign_id === campaign.id &&
                candidate.status === "active" &&
                candidate.client_id === campaign.owner_client_id
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
            current_user_player_id: currentPlayer?.client_id ?? null,
            join_code: joinCode?.code ?? null
          };
        });

      return { rows: accessible as T[] };
    }

    if (normalizedSql.startsWith("select players.client_id from players")) {
      const campaignId = values[0] as string;
      const userId = values[1] as string;
      const ownerUserId = values[2] as string | null;
      const ownerClientId = values[3] as string | null;
      const player =
        this.players.find(
          (candidate) =>
            candidate.campaign_id === campaignId &&
            candidate.status === "active" &&
            candidate.user_id === userId
        ) ??
        this.players.find(
          (candidate) =>
            ownerUserId === userId &&
            ownerClientId &&
            candidate.campaign_id === campaignId &&
            candidate.status === "active" &&
            candidate.client_id === ownerClientId
        );

      return {
        rows: player ? ([{ client_id: player.client_id }] as T[]) : ([] as T[])
      };
    }

    if (normalizedSql.startsWith("insert into campaigns")) {
      const now = new Date();
      const isLegacySessionInsert = !normalizedSql.includes("metadata");
      const record: CampaignRecord = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        session_id: values[0] as string,
        title: values[1] as string,
        mode: (isLegacySessionInsert ? values[4] : values[2]) as
          | "single_player"
          | "multiplayer",
        status: "active",
        has_begun: false,
        owner_client_id: (isLegacySessionInsert ? values[2] : values[3]) as
          | string
          | null,
        owner_user_id: (isLegacySessionInsert ? values[3] : values[4]) as
          | string
          | null,
        metadata: isLegacySessionInsert
          ? {}
          : (JSON.parse(values[5] as string) as unknown),
        created_at: now,
        updated_at: now
      };
      this.campaigns.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("insert into players")) {
      const now = new Date();
      const profileFirst =
        normalizedSql.includes("username, character_name, character_sheet, user_id") ||
        normalizedSql.includes("client_id, username, character_name");
      const userId = profileFirst
        ? (values[5] as string | null)
        : (values[2] as string | null);
      const username = profileFirst ? (values[2] as string) : (values[3] as string);
      const characterName = profileFirst
        ? (values[3] as string)
        : (values[4] as string);
      const characterSheet = profileFirst
        ? (values[4] as string)
        : (values[5] as string);
      const slot = values[6] as number;
      const existing = this.players.find(
        (player) =>
          player.campaign_id === values[0] && player.client_id === values[1]
      );

      if (existing) {
        existing.user_id = userId;
        existing.username = username;
        existing.character_name = characterName;
        existing.character_sheet = characterSheet;
        existing.slot = slot;
        existing.status = "active";
        existing.kicked_at = null;
        existing.last_seen_at = now;
        return { rows: [existing as T] };
      }

      const record: PlayerRecord = {
        id: `player-${this.nextId++}`,
        campaign_id: values[0] as string,
        client_id: values[1] as string,
        user_id: userId,
        username,
        character_name: characterName,
        character_sheet: characterSheet,
        slot,
        status: "active",
        last_seen_at: now,
        kicked_at: null,
        created_at: now,
        updated_at: now,
        portrait_asset_id: null
      };
      this.players.push(record);
      return { rows: [record as T] };
    }

    if (
      normalizedSql.startsWith("select players.*, campaigns.title as campaign_title")
    ) {
      const campaignId = values[0] as string;
      const userId = values[1] as string;
      const player = this.players.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.user_id === userId &&
          candidate.status === "active"
      );
      const campaign = player
        ? this.campaigns.find(
            (candidate) =>
              candidate.id === player.campaign_id &&
              candidate.status === "active"
          )
        : undefined;

      return {
        rows:
          player && campaign
            ? ([
                {
                  ...player,
                  campaign_title: campaign.title,
                  campaign_metadata: campaign.metadata,
                  campaign_owner_user_id: campaign.owner_user_id
                }
              ] as T[])
            : ([] as T[])
      };
    }

    if (normalizedSql.startsWith("insert into media_assets")) {
      const now = new Date();
      const record: MediaAssetRecord = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        owner_user_id: values[0] as string | null,
        campaign_id: values[1] as string,
        player_id: values[2] as string,
        kind: "character_portrait",
        status: "pending",
        storage_provider: values[3] as "local" | "digitalocean_spaces" | "s3",
        bucket: null,
        object_key: null,
        public_url: null,
        content_type: "image/webp",
        byte_size: null,
        width: null,
        height: null,
        sha256: null,
        prompt: values[4] as string,
        negative_prompt: values[5] as string,
        provider: values[6] as string,
        model: values[7] as string,
        provider_request_id: null,
        generation_metadata: {},
        created_at: now,
        updated_at: now
      };
      this.mediaAssets.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("update media_assets set status = 'ready'")) {
      const asset = this.mediaAssets.find(
        (candidate) => candidate.id === values[0]
      );

      if (!asset) {
        return { rows: [] as T[] };
      }

      asset.status = "ready";
      asset.storage_provider = values[1] as "local" | "digitalocean_spaces" | "s3";
      asset.bucket = values[2] as string | null;
      asset.object_key = values[3] as string;
      asset.public_url = values[4] as string;
      asset.content_type = values[5] as string;
      asset.byte_size = values[6] as number;
      asset.width = values[7] as number | null;
      asset.height = values[8] as number | null;
      asset.sha256 = values[9] as string;
      asset.provider_request_id = values[10] as string | null;
      asset.generation_metadata = JSON.parse(values[11] as string) as unknown;
      asset.updated_at = new Date();

      return { rows: [asset as T] };
    }

    if (normalizedSql.startsWith("update media_assets set status = 'failed'")) {
      const asset = this.mediaAssets.find(
        (candidate) => candidate.id === values[0]
      );

      if (asset) {
        asset.status = "failed";
        asset.generation_metadata = JSON.parse(values[1] as string) as unknown;
        asset.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("select * from turns")) {
      const campaignId = values[0] as string;
      const rows = this.turns.filter(
        (turn) =>
          turn.campaign_id === campaignId &&
          (turn.status === "collecting" || turn.status === "resolving")
      );

      return { rows: rows as T[] };
    }

    if (normalizedSql.startsWith("update turns set status = 'resolving'")) {
      const turnId = values[0] as string;
      const turn = this.turns.find(
        (candidate) =>
          candidate.id === turnId &&
          (normalizedSql.includes("status in ('resolved', 'failed')")
            ? candidate.campaign_id === values[1] &&
              (candidate.status === "resolved" || candidate.status === "failed")
            : candidate.status === "collecting")
      );

      if (!turn) {
        return { rows: [] as T[] };
      }

      turn.status = "resolving";
      turn.updated_at = new Date();
      return { rows: [turn as T] };
    }

    if (normalizedSql.startsWith("update turns set status = 'cancelled'")) {
      const campaignId = values[0] as string;
      const turnId = values[1] as string;
      const createdAt = values[2] as Date;

      for (const turn of this.turns) {
        if (
          turn.campaign_id === campaignId &&
          turn.id !== turnId &&
          turn.created_at > createdAt &&
          (turn.status === "collecting" ||
            turn.status === "resolving" ||
            turn.status === "resolved" ||
            turn.status === "failed")
        ) {
          turn.status = "cancelled";
          turn.updated_at = new Date();
        }
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update turns set status = 'resolved'")) {
      const turnId = values[0] as string;
      const turn = this.turns.find((candidate) => candidate.id === turnId);

      if (turn) {
        turn.status = "resolved";
        turn.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update turns set status = 'failed'")) {
      const turnId = values[0] as string;
      const error = values[1] as string;
      const turn = this.turns.find((candidate) => candidate.id === turnId);

      if (turn) {
        turn.status = "failed";
        turn.error = error;
        turn.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into turns")) {
      const now = new Date();
      const record = {
        id: `turn-${this.nextId++}`,
        campaign_id: values[0] as string,
        status: "collecting",
        created_at: now,
        updated_at: now
      } satisfies TurnRecord;
      this.turns.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("insert into campaign_events")) {
      const record = {
        id: `event-${this.nextId++}`,
        campaign_id: values[0] as string,
        type: values[1] as string,
        payload:
          typeof values[2] === "string"
            ? (JSON.parse(values[2] as string) as unknown)
            : values[2],
        created_at: new Date()
      } satisfies CampaignEventRecord;
      this.campaignEvents.push(record);
      return { rows: [{ id: record.id } as T] };
    }

    if (normalizedSql.startsWith("insert into combat_events")) {
      const hasActiveCombatId = normalizedSql.includes("active_combat_id");
      const payloadIndex = hasActiveCombatId ? 4 : 3;
      const record = {
        id: `combat-event-${this.nextId++}`,
        campaign_id: values[0] as string,
        active_combat_id: hasActiveCombatId
          ? ((values[1] as string | null) ?? null)
          : null,
        turn_id: hasActiveCombatId
          ? ((values[2] as string | null) ?? null)
          : ((values[1] as string | null) ?? null),
        event_type: hasActiveCombatId
          ? (values[3] as string)
          : (values[2] as string),
        payload:
          typeof values[payloadIndex] === "string"
            ? (JSON.parse(values[payloadIndex] as string) as unknown)
            : values[payloadIndex],
        created_at: new Date()
      } satisfies CombatEventRecord;
      this.combatEvents.push(record);
      return { rows: [{ id: record.id } as T] };
    }

    if (normalizedSql.startsWith("select count(*) as count from campaign_events")) {
      const campaignId = values[0] as string;

      return {
        rows: [
          {
            count: this.campaignEvents.filter((event) => {
              const payload =
                event.payload && typeof event.payload === "object"
                  ? (event.payload as Record<string, unknown>)
                  : {};

              return (
                event.campaign_id === campaignId &&
                [
                  "turn_submitted",
                  "turn_resolved",
                  "adventure_begun",
                  "dm_question",
                  "dm_answer"
                ].includes(event.type) &&
                typeof payload.content === "string" &&
                payload.content.trim().length > 0
              );
            }).length
          } as T
        ]
      };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_events set payload = jsonb_set"
      )
    ) {
      const campaignId = values[0] as string;
      const eventId = values[1] as string;
      const debugValue =
        typeof values[2] === "string"
          ? (JSON.parse(values[2] as string) as unknown)
          : values[2];
      const debugKey = normalizedSql.includes(
        "{aiDebug,livingWorldPressureEngine}"
      )
        ? "livingWorldPressureEngine"
        : "contextStorageState";
      const event = this.campaignEvents.find(
        (candidate) =>
          candidate.campaign_id === campaignId && candidate.id === eventId
      );

      if (event) {
        const payload = event.payload && typeof event.payload === "object"
          ? (event.payload as Record<string, unknown>)
          : {};
        const aiDebug = payload.aiDebug && typeof payload.aiDebug === "object"
          ? (payload.aiDebug as Record<string, unknown>)
          : {};

        event.payload = {
          ...payload,
          aiDebug: {
            ...aiDebug,
            [debugKey]: debugValue
          }
        };
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("select campaign_turn_summaries.turn_id")) {
      const campaignId = values[0] as string;
      const excludedTurnIds = new Set(values[1] as string[]);
      const limit = values[2] as number;

      return {
        rows: this.campaignTurnSummaries
          .filter(
            (record) =>
              record.campaign_id === campaignId &&
              !excludedTurnIds.has(record.turn_id)
          )
          .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
          .slice(0, limit)
          .map((record) => ({
            ...record,
            narration_payload: this.campaignEvents.find(
              (event) => event.id === record.event_id && event.type === "turn_resolved"
            )?.payload ?? null
          }) as T)
      };
    }

    if (normalizedSql.startsWith("insert into campaign_turn_summaries")) {
      const turnId = values[1] as string;
      const existing = this.campaignTurnSummaries.find(
        (record) => record.turn_id === turnId
      );
      const parseJson = (value: unknown) =>
        typeof value === "string" ? JSON.parse(value) : value;
      const next = {
        campaign_id: values[0] as string,
        turn_id: turnId,
        event_id: (values[2] as string | null) ?? null,
        summary: values[3] as string,
        completed_beats: parseJson(values[4]),
        entity_keys: parseJson(values[5]),
        open_thread_keys: parseJson(values[6]),
        certainty_notes: parseJson(values[7]),
        token_estimate: values[8] as number,
        source_checksum: values[9] as string,
        created_at: existing?.created_at ?? new Date()
      } satisfies CampaignTurnSummaryRecord;

      if (existing) {
        Object.assign(existing, next);
      } else {
        this.campaignTurnSummaries.push(next);
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("select context_key from campaign_context_chunks")) {
      const campaignId = values[0] as string;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId && chunk.archived_at === null
          )
          .map((chunk) => ({ context_key: chunk.context_key }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, title, body_markdown, updated_at from campaign_context_chunks"
      )
    ) {
      const campaignId = values[0] as string;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId &&
              chunk.category === "npc_context" &&
              chunk.archived_at === null
          )
          .sort((left, right) => {
            const priorityDelta = right.priority - left.priority;

            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return right.updated_at.getTime() - left.updated_at.getTime();
          })
          .slice(0, 120)
          .map((chunk) => ({
            context_key: chunk.context_key,
            title: chunk.title,
            body_markdown: chunk.body_markdown,
            updated_at: chunk.updated_at
          }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, title, visibility, priority, updated_at from campaign_context_chunks"
      )
    ) {
      const campaignId = values[0] as string;
      const limit = values[1] as number;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId &&
              chunk.category === "npc_context" &&
              chunk.archived_at === null
          )
          .sort((left, right) => {
            const priorityDelta = right.priority - left.priority;

            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return right.updated_at.getTime() - left.updated_at.getTime();
          })
          .slice(0, limit)
          .map((chunk) => ({
            context_key: chunk.context_key,
            title: chunk.title,
            visibility: chunk.visibility,
            priority: chunk.priority,
            updated_at: chunk.updated_at
          }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, category, title, visibility, priority, body_markdown, updated_at from campaign_context_chunks"
      ) &&
      normalizedSql.includes("context_key = any")
    ) {
      const campaignId = values[0] as string;
      const requestedKeys = new Set(values[1] as string[]);
      const requestedCategories = new Set(values[2] as string[]);

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId &&
              requestedKeys.has(chunk.context_key) &&
              requestedCategories.has(chunk.category) &&
              chunk.archived_at === null
          )
          .sort((left, right) => right.priority - left.priority)
          .map((chunk) => ({ ...chunk }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, category, title, visibility, priority, body_markdown, archived_at, created_at, updated_at from campaign_context_chunks"
      )
    ) {
      const campaignId = values[0] as string;

      return {
        rows: this.contextChunks
          .filter((chunk) => chunk.campaign_id === campaignId)
          .sort((left, right) => {
            const leftArchived = left.archived_at ? 1 : 0;
            const rightArchived = right.archived_at ? 1 : 0;
            const archivedDelta = leftArchived - rightArchived;

            if (archivedDelta !== 0) {
              return archivedDelta;
            }

            const categoryDelta = left.category.localeCompare(right.category);

            if (categoryDelta !== 0) {
              return categoryDelta;
            }

            const priorityDelta = right.priority - left.priority;

            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return right.updated_at.getTime() - left.updated_at.getTime();
          })
          .map((chunk) => ({
            context_key: chunk.context_key,
            category: chunk.category,
            title: chunk.title,
            visibility: chunk.visibility,
            priority: chunk.priority,
            body_markdown: chunk.body_markdown,
            archived_at: chunk.archived_at,
            created_at: chunk.created_at,
            updated_at: chunk.updated_at
          }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, category, title, visibility, priority, body_markdown, updated_at from campaign_context_chunks"
      ) &&
      normalizedSql.includes("limit 120")
    ) {
      const campaignId = values[0] as string;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId && chunk.archived_at === null
          )
          .sort((left, right) => {
            const priorityDelta = right.priority - left.priority;

            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return right.updated_at.getTime() - left.updated_at.getTime();
          })
          .slice(0, 120)
          .map((chunk) => ({ ...chunk }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, category, title, body_markdown from campaign_context_chunks"
      )
    ) {
      const campaignId = values[0] as string;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId && chunk.archived_at === null
          )
          .map((chunk) => ({
            context_key: chunk.context_key,
            category: chunk.category,
            title: chunk.title,
            body_markdown: chunk.body_markdown
          }) as T)
      };
    }

    if (
      normalizedSql.startsWith(
        "select context_key, category, title, visibility, priority, body_markdown, updated_at from campaign_context_chunks"
      )
    ) {
      const campaignId = values[0] as string;
      const limit = values[1] as number;

      return {
        rows: this.contextChunks
          .filter(
            (chunk) =>
              chunk.campaign_id === campaignId && chunk.archived_at === null
          )
          .sort((left, right) => {
            const categoryDelta = left.category.localeCompare(right.category);

            if (categoryDelta !== 0) {
              return categoryDelta;
            }

            const priorityDelta = right.priority - left.priority;

            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return right.updated_at.getTime() - left.updated_at.getTime();
          })
          .slice(0, limit)
          .map((chunk) => ({
            context_key: chunk.context_key,
            category: chunk.category,
            title: chunk.title,
            visibility: chunk.visibility,
            priority: chunk.priority,
            body_markdown: chunk.body_markdown,
            updated_at: chunk.updated_at
          }) as T)
      };
    }

    if (normalizedSql.startsWith("insert into dm_turn_traces")) {
      const payloadIndex = normalizedSql.includes("elapsed_ms") ? 5 : 4;
      const record: DmTurnTraceRecord = {
        id: `dm-trace-${this.nextId++}`,
        campaign_id: values[0] as string,
        trace_id: values[1] as string,
        turn_id: (values[2] as string | null) ?? null,
        phase: values[3] as string,
        elapsed_ms: normalizedSql.includes("elapsed_ms")
          ? ((values[4] as number | null) ?? null)
          : null,
        payload:
          typeof values[payloadIndex] === "string"
            ? JSON.parse(values[payloadIndex] as string)
            : values[payloadIndex],
        created_at: new Date()
      };
      this.dmTurnTraces.push(record);
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into dm_context_snapshots")) {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into dm_model_calls")) {
      this.dmModelCalls.push({
        id: `dm-model-call-${this.nextId++}`,
        campaign_id: values[0] as string,
        trace_id: values[1] as string,
        turn_id: (values[2] as string | null) ?? null,
        phase: values[3] as string,
        provider: (values[4] as string | null) ?? null,
        model: (values[5] as string | null) ?? null,
        raw_response: (values[6] as string | null) ?? null,
        metadata:
          typeof values[7] === "string"
            ? JSON.parse(values[7] as string)
            : values[7],
        created_at: new Date()
      });
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into dm_output_reports")) {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into dm_memory_patch_logs")) {
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("select guidance, updated_at from campaign_dm_guidance")) {
      const campaignId = values[0] as string;
      const record = this.campaignDmGuidance.find(
        (candidate) => candidate.campaign_id === campaignId
      );

      return { rows: record ? ([record] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql.startsWith(
        "insert into campaign_dm_guidance"
      )
    ) {
      const campaignId = values[0] as string;
      const existing = this.campaignDmGuidance.find(
        (candidate) => candidate.campaign_id === campaignId
      );
      const guidance =
        typeof values[3] === "string"
          ? (JSON.parse(values[3] as string) as Record<string, unknown>)
          : (values[3] as Record<string, unknown>);

      if (existing) {
        existing.trace_id = values[1] as string;
        existing.covered_message_count = values[2] as number;
        existing.guidance = guidance;
        existing.updated_at = new Date();
      } else {
        this.campaignDmGuidance.push({
          campaign_id: campaignId,
          trace_id: values[1] as string,
          covered_message_count: values[2] as number,
          guidance,
          updated_at: new Date()
        });
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "select covered_message_count from living_world_engine_runs"
      )
    ) {
      const campaignId = values[0] as string;
      const record = this.livingWorldEngineRuns
        .filter((candidate) => candidate.campaign_id === campaignId)
        .sort((left, right) => {
          const coveredDelta =
            right.covered_message_count - left.covered_message_count;

          if (coveredDelta !== 0) {
            return coveredDelta;
          }

          return right.created_at.getTime() - left.created_at.getTime();
        })[0];

      return {
        rows: record
          ? ([{ covered_message_count: record.covered_message_count }] as T[])
          : ([] as T[])
      };
    }

    if (normalizedSql.startsWith("insert into living_world_engine_runs")) {
      const campaignId = values[0] as string;
      const coveredMessageCount = values[3] as number;
      const existing = this.livingWorldEngineRuns.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.covered_message_count === coveredMessageCount
      );

      if (normalizedSql.includes("returning id")) {
        if (existing) {
          return { rows: [] as T[] };
        }

        const record = {
          id: `living-world-run-${this.nextId++}`,
          campaign_id: campaignId,
          trace_id: values[1] as string,
          turn_id: (values[2] as string | null) ?? null,
          covered_message_count: coveredMessageCount,
          accepted_patch_count: 0,
          discarded_patch_count: 0,
          guidance: null,
          payload:
            typeof values[4] === "string"
              ? JSON.parse(values[4] as string)
              : values[4],
          created_at: new Date()
        } satisfies LivingWorldEngineRunRecord;

        this.livingWorldEngineRuns.push(record);

        return { rows: [{ id: record.id } as T] };
      }

      const record =
        existing ??
        ({
          id: `living-world-run-${this.nextId++}`,
          campaign_id: campaignId,
          trace_id: values[1] as string,
          turn_id: (values[2] as string | null) ?? null,
          covered_message_count: coveredMessageCount,
          accepted_patch_count: 0,
          discarded_patch_count: 0,
          guidance: null,
          payload: {},
          created_at: new Date()
        } satisfies LivingWorldEngineRunRecord);

      record.trace_id = values[1] as string;
      record.turn_id = (values[2] as string | null) ?? null;
      record.accepted_patch_count = values[7] as number;
      record.discarded_patch_count = values[8] as number;
      record.guidance =
        typeof values[9] === "string"
          ? JSON.parse(values[9] as string)
          : values[9];
      record.payload =
        typeof values[10] === "string"
          ? JSON.parse(values[10] as string)
          : values[10];

      if (!existing) {
        this.livingWorldEngineRuns.push(record);
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set body_markdown = concat_ws"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const markdown = values[2] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey
      );

      if (chunk) {
        chunk.body_markdown = [chunk.body_markdown, markdown]
          .filter(Boolean)
          .join("\n");
        chunk.visibility = "player_safe";
        chunk.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set body_markdown = $3, title = $4"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const markdown = values[2] as string;
      const title = values[3] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey &&
          candidate.category === "npc_context" &&
          candidate.archived_at === null
      );

      if (!chunk) {
        return { rows: [] as T[] };
      }

      chunk.body_markdown = markdown;
      chunk.title = title;
      chunk.updated_at = new Date("2026-07-20T11:00:00.000Z");

      return {
        rows: [
          {
            context_key: chunk.context_key,
            title: chunk.title,
            body_markdown: chunk.body_markdown,
            updated_at: chunk.updated_at
          } as T
        ]
      };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set body_markdown = $3"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const markdown = values[2] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey
      );

      if (chunk) {
        chunk.body_markdown = markdown;
        chunk.visibility = "player_safe";
        chunk.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set title = coalesce"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const title = values[2] as string;
      const markdown = values[3] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey &&
          candidate.archived_at === null
      );

      if (chunk) {
        if (title) {
          chunk.title = title;
        }
        chunk.body_markdown = markdown;
        chunk.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set visibility = 'player_safe'"
      )
    ) {
      const campaignId = values[0] as string;

      for (const chunk of this.contextChunks) {
        if (chunk.campaign_id === campaignId && chunk.archived_at === null) {
          chunk.visibility = "player_safe";
          chunk.updated_at = new Date();
        }
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set context_key = $3"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const newContextKey = values[2] as string;
      const title = values[3] as string;
      const markdown = values[4] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey &&
          candidate.archived_at === null
      );

      if (chunk) {
        chunk.context_key = newContextKey;
        if (title) {
          chunk.title = title;
        }
        if (markdown) {
          chunk.body_markdown = markdown;
        }
        chunk.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaign_context_chunks set archived_at = now()"
      )
    ) {
      const campaignId = values[0] as string;
      const contextKey = values[1] as string;
      const chunk = this.contextChunks.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.context_key === contextKey
      );

      if (chunk) {
        chunk.archived_at = new Date();
        chunk.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "delete from campaign_context_chunks where campaign_id = $1"
      )
    ) {
      const campaignId = values[0] as string;
      this.contextChunks = this.contextChunks.filter(
        (chunk) => chunk.campaign_id !== campaignId
      );

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into campaign_context_chunks")) {
      const now = new Date();
      const archivedAt = values[7] instanceof Date
        ? values[7]
        : values[7]
          ? new Date(values[7] as string)
          : null;
      const createdAt = values[8] instanceof Date
        ? values[8]
        : values[8]
          ? new Date(values[8] as string)
          : now;
      const updatedAt = values[9] instanceof Date
        ? values[9]
        : values[9]
          ? new Date(values[9] as string)
          : now;

      this.contextChunks.push({
        campaign_id: values[0] as string,
        context_key: values[1] as string,
        category: values[2] as string,
        title: values[3] as string,
        visibility:
          values[4] === "player_safe" || values[4] === "dm_only"
            ? values[4]
            : "dm_only",
        priority: typeof values[5] === "number" ? values[5] : 0,
        body_markdown: (values[6] ?? values[5]) as string,
        archived_at: archivedAt,
        created_at: createdAt,
        updated_at: updatedAt
      });

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update submissions set status = 'included_in_turn'")) {
      const turnId = values[0] as string;

      for (const submission of this.submissions) {
        if (submission.turn_id === turnId && submission.status === "submitted") {
          submission.status = "included_in_turn";
        }
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update submissions set status = 'submitted'")) {
      const turnId = values[0] as string;

      for (const submission of this.submissions) {
        if (
          submission.turn_id === turnId &&
          submission.status === "included_in_turn"
        ) {
          submission.status = "submitted";
        }
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update submissions set status = 'cancelled'")) {
      const campaignId = values[0] as string;
      const turnId = values[1] as string;
      const createdAt = values[2] as Date;

      for (const submission of this.submissions) {
        if (
          submission.campaign_id === campaignId &&
          submission.turn_id !== turnId &&
          submission.created_at > createdAt &&
          (submission.status === "submitted" ||
            submission.status === "included_in_turn")
        ) {
          submission.status = "cancelled";
        }
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("delete from campaign_events where id = $1")) {
      const eventId = values[0] as string;
      this.campaignEvents = this.campaignEvents.filter(
        (event) => event.id !== eventId
      );
      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "select payload from campaign_events where campaign_id = $1 and type in ('turn_resolved', 'adventure_begun')"
      )
    ) {
      const campaignId = values[0] as string;
      return {
        rows: this.campaignEvents
          .filter(
            (event) =>
              event.campaign_id === campaignId &&
              (event.type === "turn_resolved" || event.type === "adventure_begun")
          )
          .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
          .slice(0, 100)
          .map((event) => ({ payload: event.payload })) as T[]
      };
    }

    if (normalizedSql.startsWith("delete from campaign_events where campaign_id = $1")) {
      const campaignId = values[0] as string;
      const createdAt = values[1] as Date;
      this.campaignEvents = this.campaignEvents.filter(
        (event) => event.campaign_id !== campaignId || event.created_at <= createdAt
      );
      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update campaigns set metadata = metadata")) {
      const campaignId = values[0] as string;
      const patch = JSON.parse(values[1] as string) as Record<string, unknown>;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        campaign.metadata = {
          ...(campaign.metadata as Record<string, unknown>),
          ...patch
        };
        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith(
        "update campaigns set metadata = jsonb_set(metadata, '{mechanicsState}'"
      )
    ) {
      const campaignId = values[0] as string;
      const mechanicsState = JSON.parse(values[1] as string) as Record<
        string,
        unknown
      >;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        campaign.metadata = {
          ...(campaign.metadata as Record<string, unknown>),
          mechanicsState
        };
        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith("update campaigns set metadata = case") &&
      normalizedSql.includes("pendingRollRequest")
    ) {
      const campaignId = values[0] as string;
      const pendingRollRequests = JSON.parse(values[1] as string) as unknown[];
      const pendingRollRequest = JSON.parse(values[2] as string) as unknown;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        const metadata = campaign.metadata as Record<string, unknown>;

        if (pendingRollRequests.length === 0) {
          const {
            pendingRollRequest: _pendingRollRequest,
            pendingRollRequests: _pendingRollRequests,
            ...nextMetadata
          } = metadata;
          void _pendingRollRequest;
          void _pendingRollRequests;
          campaign.metadata = nextMetadata;
        } else {
          campaign.metadata = {
            ...metadata,
            pendingRollRequest,
            pendingRollRequests
          };
        }

        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (
      normalizedSql.startsWith("update campaigns set metadata = case") &&
      normalizedSql.includes("inputTargets")
    ) {
      const campaignId = values[0] as string;
      const inputTargets = JSON.parse(values[1] as string) as unknown[];
      const inputPolicy = JSON.parse(values[2] as string) as unknown;
      const nextInputNeeded = values[3] as unknown;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        const metadata = campaign.metadata as Record<string, unknown>;

        if (inputTargets.length === 0 && nextInputNeeded === "player_actions") {
          const {
            inputTargets: _inputTargets,
            inputPolicy: _inputPolicy,
            nextInputNeeded: _nextInputNeeded,
            ...nextMetadata
          } = metadata;
          void _inputTargets;
          void _inputPolicy;
          void _nextInputNeeded;
          campaign.metadata = nextMetadata;
        } else {
          campaign.metadata = {
            ...metadata,
            inputTargets,
            inputPolicy,
            nextInputNeeded
          };
        }

        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update campaigns set metadata = jsonb_set")) {
      const campaignId = values[0] as string;
      const openingPlan = JSON.parse(values[1] as string) as Record<
        string,
        unknown
      >;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        campaign.metadata = {
          ...(campaign.metadata as Record<string, unknown>),
          eldermereOpeningPlan: openingPlan,
          eldermereOpeningPlanVersion: 2
        };
        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update campaigns set metadata = case")) {
      const campaignId = values[0] as string;
      const campaign = this.campaigns.find(
        (candidate) => candidate.id === campaignId
      );

      if (campaign) {
        campaign.updated_at = new Date();
      }

      return { rows: [] as T[] };
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

    if (normalizedSql.startsWith("insert into campaign_invites")) {
      const record: CampaignInviteRecord = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        campaign_id: values[0] as string,
        token_hash: values[1] as string,
        max_uses: (values[2] as number | null) ?? null,
        expires_at: (values[3] as Date | null) ?? null,
        created_by_user_id: values[4] as string,
        enabled: true,
        use_count: 0,
        created_at: new Date(),
        disabled_at: null,
        disabled_by_user_id: null
      };
      this.campaignInvites.push(record);
      return { rows: [record as T] };
    }

    if (normalizedSql.startsWith("select * from campaign_invites")) {
      const campaignId = values[0] as string;
      const rows = this.campaignInvites
        .filter((invite) => invite.campaign_id === campaignId)
        .slice()
        .reverse()
        .slice(0, 20);

      return { rows: rows as T[] };
    }

    if (normalizedSql.startsWith("update campaign_invites set enabled = false")) {
      const inviteId = values[0] as string;
      const campaignId = values[1] as string;
      const userId = values[2] as string;
      const invite = this.campaignInvites.find(
        (candidate) =>
          candidate.id === inviteId && candidate.campaign_id === campaignId
      );

      if (!invite) {
        return { rows: [] as T[] };
      }

      invite.enabled = false;
      invite.disabled_at ??= new Date();
      invite.disabled_by_user_id = userId;
      return { rows: [invite as T] };
    }

    if (
      normalizedSql.startsWith("select campaign_invites.*, campaigns.title as campaign_title")
    ) {
      const tokenHash = values[0] as string;
      const invite = this.campaignInvites.find(
        (candidate) => candidate.token_hash === tokenHash && candidate.enabled
      );
      const campaign = invite
        ? this.campaigns.find(
            (candidate) => candidate.id === invite.campaign_id
          )
        : undefined;

      if (!invite || !campaign) {
        return { rows: [] as T[] };
      }

      const activePlayers = this.players.filter(
        (player) =>
          player.campaign_id === campaign.id && player.status === "active"
      ).length;

      return {
        rows: [
          {
            ...invite,
            campaign_title: campaign.title,
            campaign_status: campaign.status,
            campaign_mode: campaign.mode,
            campaign_has_begun: campaign.has_begun,
            active_players: activePlayers
          } as T
        ]
      };
    }

    if (normalizedSql.startsWith("update campaign_invites set use_count")) {
      const inviteId = values[0] as string;
      const invite = this.campaignInvites.find(
        (candidate) => candidate.id === inviteId
      );

      if (invite) {
        invite.use_count += 1;
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("insert into campaign_invite_uses")) {
      this.campaignInviteUses.push({
        id: `invite-use-${this.nextId++}`,
        invite_id: values[0] as string,
        campaign_id: values[1] as string,
        joined_user_id: values[2] as string,
        player_id: values[3] as string,
        used_at: new Date()
      });

      return { rows: [] as T[] };
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

    if (
      normalizedSql.startsWith("select * from players where campaign_id") ||
      normalizedSql.startsWith("select players.*, media_assets.id as portrait_asset_id") ||
      normalizedSql.startsWith("select players.*, media_assets.public_url")
    ) {
      const campaignId = values[0] as string;

      if (normalizedSql.includes("and client_id = $2 and user_id = $3")) {
        const clientId = values[1] as string;
        const userId = values[2] as string;
        const player = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaignId &&
            candidate.client_id === clientId &&
            candidate.user_id === userId &&
            candidate.status === "active"
        );
        return { rows: player ? ([player] as T[]) : ([] as T[]) };
      }

      if (
        normalizedSql.includes("and user_id = $2") ||
        normalizedSql.includes("and players.user_id = $2")
      ) {
        const userId = values[1] as string;
        const player = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaignId && candidate.user_id === userId
        );
        const portrait = player?.portrait_asset_id
          ? this.mediaAssets.find(
              (asset) =>
                asset.id === player.portrait_asset_id && asset.status === "ready"
            )
          : undefined;

        return {
          rows: player
            ? ([
                {
                  ...player,
                  portrait_public_url: portrait?.public_url ?? null
                }
              ] as T[])
            : ([] as T[])
        };
      }

      if (
        normalizedSql.includes("where campaign_id = $1 and status = 'active'") ||
        normalizedSql.includes(
          "where players.campaign_id = $1 and players.status = 'active'"
        )
      ) {
        return {
          rows: this.players.filter(
            (player) =>
              player.campaign_id === campaignId && player.status === "active"
          ).map((player) => {
            const portrait = player.portrait_asset_id
              ? this.mediaAssets.find(
                  (asset) =>
                    asset.id === player.portrait_asset_id &&
                    asset.status === "ready"
                )
              : undefined;
            const latestIncompletePortrait = this.mediaAssets
              .filter(
                (asset) =>
                  asset.player_id === player.id &&
                  asset.kind === "character_portrait" &&
                  (asset.status === "pending" || asset.status === "failed")
              )
              .at(-1);

            return {
              ...player,
              portrait_asset_id: portrait?.id ?? player.portrait_asset_id,
              portrait_public_url: portrait?.public_url ?? null,
              portrait_status:
                portrait?.status ?? latestIncompletePortrait?.status ?? null
            } as T;
          })
        };
      }

      const clientId = values[1] as string;
      const player = this.players.find(
        (candidate) =>
          candidate.campaign_id === campaignId && candidate.client_id === clientId
      );
      return { rows: player ? ([player] as T[]) : ([] as T[]) };
    }

    if (normalizedSql.startsWith("update players set character_sheet = $2")) {
      const playerId = values[0] as string;
      const player = this.players.find((candidate) => candidate.id === playerId);

      if (player) {
        player.character_sheet = values[1] as string;
        player.updated_at = new Date();
      }

      return { rows: [] as T[] };
    }

    if (normalizedSql.startsWith("update players set combat_cheat_sheet = $3")) {
      const campaignId = values[0] as string;
      const clientId = values[1] as string;
      const markdown = values[2] as string;
      const sourceHash = values[3] as string;
      const player = this.players.find(
        (candidate) =>
          candidate.campaign_id === campaignId &&
          candidate.client_id === clientId &&
          candidate.status === "active"
      );

      if (player) {
        player.combat_cheat_sheet = markdown;
        player.combat_cheat_sheet_updated_at = new Date();
        player.combat_cheat_sheet_source_hash = sourceHash;
        player.last_seen_at = new Date();
        player.updated_at = new Date();
      }

      return { rows: player ? ([player] as T[]) : ([] as T[]) };
    }

    if (normalizedSql.startsWith("select count(*) as active_players from players")) {
      const campaignId = values[0] as string;
      const activePlayers = this.players.filter(
        (player) =>
          player.campaign_id === campaignId && player.status === "active"
      ).length;

      return { rows: [{ active_players: activePlayers } as T] };
    }

    if (normalizedSql.startsWith("select submissions.player_id")) {
      const turnId = values[0] as string;
      const rows = this.submissions
        .filter(
          (submission) =>
            submission.turn_id === turnId &&
            (submission.status === "submitted" ||
              submission.status === "included_in_turn")
        )
        .map((submission) => {
          const player = this.players.find(
            (candidate) => candidate.id === submission.player_id
          );
          return {
            player_id: submission.player_id,
            client_id: player?.client_id ?? null,
            username: player?.username ?? null,
            character_name: player?.character_name ?? null,
            character_sheet: player?.character_sheet ?? null,
            slot: player?.slot ?? null,
            content: submission.content,
            created_at: submission.created_at
          };
        });

      return { rows: rows as T[] };
    }

    if (normalizedSql.startsWith("select player_id from submissions")) {
      const turnId = values[0] as string;
      const rows = this.submissions
        .filter(
          (submission) =>
            submission.turn_id === turnId && submission.status === "submitted"
        )
        .map((submission) => ({ player_id: submission.player_id }) as T);

      return { rows };
    }

    if (
      normalizedSql.startsWith(
        "select id, trace_id, turn_id, phase, elapsed_ms, payload, created_at from dm_turn_traces"
      )
    ) {
      const campaignId = values[0] as string;
      const traceId = values[1] as string | null;
      const limit = values[2] as number;

      return {
        rows: this.dmTurnTraces
          .filter(
            (trace) =>
              trace.campaign_id === campaignId &&
              (!traceId || trace.trace_id === traceId)
          )
          .slice()
          .reverse()
          .slice(0, limit) as T[]
      };
    }

    if (normalizedSql.startsWith("select id, type, payload, created_at from")) {
      const campaignId = values[0] as string;
      if (normalizedSql.includes("payload->>'messageId' = $2")) {
        const messageId = values[1] as string;

        return {
          rows: this.campaignEvents
            .filter((event) => {
              const payload = event.payload as Record<string, unknown>;

              return (
                event.campaign_id === campaignId &&
                ["turn_submitted", "turn_resolved", "adventure_begun"].includes(
                  event.type
                ) &&
                payload.messageId === messageId &&
                payload.role === "dm"
              );
            })
            .slice()
            .reverse()
            .slice(0, 1) as T[]
        };
      }

      const limitOneQuery = normalizedSql.includes("limit 1");
      const visibleTypes = limitOneQuery
        ? ["turn_submitted", "turn_resolved", "adventure_begun"]
        : [
            "turn_submitted",
            "turn_resolved",
            "adventure_begun",
            "dm_question",
            "dm_answer"
          ];
      const events = this.campaignEvents
        .filter(
          (event) =>
            event.campaign_id === campaignId && visibleTypes.includes(event.type)
        )
        .slice();

      if (limitOneQuery) {
        return {
          rows: events
            .sort(
              (left, right) =>
                right.created_at.getTime() - left.created_at.getTime() ||
                compareEventIdDesc(left, right)
            )
            .slice(0, 1) as T[]
        };
      }

      const limit =
        normalizedSql.includes("limit $2") && typeof values[1] === "number"
          ? (values[1] as number)
          : undefined;
      const recentEvents = events
        .sort(
          (left, right) =>
            right.created_at.getTime() - left.created_at.getTime() ||
            recentRoomEventRank(left.type) - recentRoomEventRank(right.type) ||
            compareEventIdDesc(left, right)
        )
        .slice(0, limit);

      return {
        rows: recentEvents.sort(
          (left, right) =>
            left.created_at.getTime() - right.created_at.getTime() ||
            chronologicalRoomEventRank(left.type) -
              chronologicalRoomEventRank(right.type) ||
            compareEventIdAsc(left, right)
        ) as T[]
      };
    }

    if (normalizedSql.startsWith("insert into submissions")) {
      const campaignId = values[0] as string;
      const turnId = values[1] as string;
      const playerId = values[2] as string;
      const content = values[3] as string;
      const append = values[4] as boolean;
      const existing = this.submissions.find(
        (submission) =>
          submission.turn_id === turnId && submission.player_id === playerId
      );

      if (existing) {
        existing.content = append ? `${existing.content}\n${content}` : content;
        existing.status = "submitted";
        return { rows: [] as T[] };
      }

      this.submissions.push({
        campaign_id: campaignId,
        turn_id: turnId,
        player_id: playerId,
        content,
        status: "submitted",
        created_at: new Date()
      });

      return { rows: [] as T[] };
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

    if (normalizedSql.startsWith("update players set portrait_asset_id")) {
      if (normalizedSql.includes("where campaign_id = $1")) {
        const campaignId = values[0] as string;
        const assetId = values[1] as string;
        const userId = values[2] as string;
        const updated = this.players.filter(
          (player) =>
            player.campaign_id === campaignId &&
            player.user_id === userId &&
            player.status === "active"
        );

        for (const player of updated) {
          player.portrait_asset_id = assetId;
          player.updated_at = new Date();
        }

        return { rows: [] as T[] };
      }

      const assetId = values[0] as string;
      const playerId = values[1] as string;
      const player = this.players.find((candidate) => candidate.id === playerId);

      if (player) {
        player.portrait_asset_id = assetId;
        player.updated_at = new Date();
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

export function readCookie(setCookieHeader: string | string[] | undefined): string {
  assert.ok(setCookieHeader);
  const firstHeader = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  assert.ok(firstHeader);

  const cookie = firstHeader.split(";")[0];
  assert.ok(cookie);

  return cookie;
}

export async function signIn(email: string): Promise<string> {
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
      AUTH_COOKIE_NAME: "test_session",
      GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
      MEDIA_LOCAL_DIR: path.join(
        os.tmpdir(),
        `ai-taverns-api-test-media-${process.pid}`
      )
    }),
    connectToDatabase: false,
    dmRuntime: {
      askProvider: async (input) => {
        if (input.instructions.includes("AI Taverns DM router")) {
          const currentTurnInputMatch = input.message.match(
            /(?:^|\n)Current turn input:\s*([\s\S]*)$/i
          );
          const currentTurnInput = currentTurnInputMatch?.[1] ?? input.message;
          const shouldSelectCourierLetter =
            /read it again/i.test(currentTurnInput) &&
            input.message.includes('"key": "world:courier-letter"');
          const shouldSelectCinderhaltDocuments =
            /cross reference/i.test(currentTurnInput) &&
            input.message.includes('"key": "world:bellas-notebook"') &&
            input.message.includes('"key": "world:halkas-ledger"');
          const content = JSON.stringify({
            job_needed: /\battack\b/i.test(currentTurnInput)
              ? "combat"
              : "scene_director",
            context_keys: {
              npc_context: [],
              player_character_context: [],
              combat_context: [],
              relevant_world_context: shouldSelectCourierLetter
                ? ["world:courier-letter"]
                : shouldSelectCinderhaltDocuments
                  ? [
                      "world:bellas-notebook",
                      "world:league-of-brass-writ",
                      "world:halkas-ledger"
                    ]
                : [],
              quests_open_threads: [],
              overarching_big_plot_secrets: []
            },
            reason: "Deterministic test router response."
          });

          return {
            id: "provider-router-1",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("campaign foundation compiler")) {
          const content = JSON.stringify({
            patches: [],
            new_context_chunks: [
              {
                context_id: "pc:yiller",
                context_type: "player_character_context",
                title: "Yiller",
                visibility: "player_safe",
                markdown:
                  "# Yiller\n\n## Established Facts\n- Yiller is searching for Lysa after her trail went quiet.\n\n## Embedded Threads\n- The first playable leads should keep the search personal without resolving Lysa's fate."
              },
              {
                context_id: "world:sunder-kiln",
                context_type: "relevant_world_context",
                title: "Sunder Kiln",
                visibility: "player_safe",
                markdown:
                  "# Sunder Kiln\n\n## Canonical Grounding\n- A major campaign-local ruin anchor in the Sundered Vale.\n\n## Campaign-Local Premise\n- Local rumors, missing expeditions, and claim disputes point toward a dangerous ruin whose truth is not public.\n\n## Embedded Threads\n- Lysa's trail, local claim violence, and strange ruin signs can all point here over time.\n\n## Open Questions\n- What did Lysa find?\n- Who else wants the ruin claimed?"
              },
              {
                context_id: "thread:lysa-trail",
                context_type: "quests_open_threads",
                title: "Lysa's Trail",
                visibility: "player_safe",
                markdown:
                  "# Lysa's Trail\n\n## Established Facts\n- Lysa is missing after taking a private ruin contract.\n\n## Player-Safe Leads\n- Question witnesses.\n- Search public claim records.\n- Follow rumors of strange ruin signs.\n- Find the duplicate ledger hidden in the clerk's room.\n\n## Escalation\n- If Yiller waits too long, the unknown buyer may act first and the trail may grow colder.\n- Garrick Vaultgate sends a second team.\n\n## Open Questions\n- Who hired Lysa?\n- Is she still alive?"
              },
              {
                context_id: "npc:garrick-vaultgate",
                context_type: "npc_context",
                title: "Garrick Vaultgate",
                visibility: "dm_only",
                markdown:
                  "# Garrick Vaultgate\n\n## Hidden Truth\n- Garrick is the private buyer behind the opening pressure."
              },
              {
                context_id: "secret:sunder-kiln",
                context_type: "overarching_big_plot_secrets",
                title: "Sunder Kiln Secret",
                visibility: "dm_only",
                markdown:
                  "# Sunder Kiln Secret\n\n## Hidden Truth\n- The ruin's deeper behavior and the missing mentor's fate are campaign-scale secrets.\n\n## Evidence Planted\n- Witness contradictions, damaged records, and impossible ruin signs can point toward the truth.\n\n## Future Reveal Paths\n- Reveal the truth only after Yiller follows local leads and makes choices that affect Stakehold.\n\n## Constraints\n- Do not resolve the campaign-scale truth in the opener."
              }
            ],
            remove_context_chunks: []
          });

          return {
            id: "provider-foundation-compiler-1",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("living world pressure engine")) {
          const content = JSON.stringify({
            world_clock_updates: [
              {
                clock_id: "thread:lysa-trail:accord-pressure",
                title: "Accord pressure on Lysa's trail",
                status: "advanced",
                summary:
                  "The Accord hears enough public talk to start moving surveyors toward the same records.",
                visibility: "dm_only",
                related_context_ids: ["thread:lysa-trail"]
              }
            ],
            patches: [
              {
                operation: "append",
                context_id: "thread:lysa-trail",
                markdown:
                  "## Offscreen Movement\n- The Claim-Stake Accord has begun asking about the same records, making the trail more contested."
              }
            ],
            new_context_chunks: [],
            remove_context_chunks: [],
            dm_guidance: {
              current_direction:
                "The Claim-Stake Accord is quietly consolidating influence around Lysa's trail after the player's public investigation. Its pressure can remain backgrounded until an ordinary consequence naturally reaches the foreground.",
              avoid: [
                "Do not reveal Lysa's true fate",
                "Do not force the player to go to the kiln immediately"
              ]
            },
            possible_intrusions: [
              {
                title: "Accord surveyors arrive",
                summary:
                  "Surveyors enter the settlement asking after the same records.",
                fairness_reason:
                  "The player has been investigating Lysa in public.",
                pacing_note: "Use after a softer warning."
              }
            ],
            contradiction_warnings: []
          });

          return {
            id: "provider-living-world-1",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("memory/context updater")) {
          const shouldCreateMarra = /\bMarra Vell\b/.test(input.message);
          const hasMarraContext = input.message.includes(
            '"context_id": "npc:marra-vell"'
          );
          const shouldCreateAmber = /\bamber sphere\b/i.test(input.message);
          const hasAmberContext = input.message.includes(
            '"context_id": "world:amber-sphere"'
          );
          const courierLetterText = [
            "Marra,",
            "",
            "The tide gate opens at moonrise. Bring the black key and trust no one wearing harbor blue.",
            "",
            "- V."
          ].join("\n");
          const shouldCreateCourierLetter =
            /\bcourier letter\b/i.test(input.message) &&
            input.message.includes(courierLetterText);
          const hasCourierLetterContext = input.message.includes(
            '"context_id": "world:courier-letter"'
          );
          const bellaNotebookText =
            "H.K. - 12 oz Wellglass - 400 gp - delivery via relic exchange - Cinderhalt seal confirmed.";
          const bellaWritText =
            "Bella Trestlemark is authorized to detain, question, and seize property related to suspected illicit Wellglass trade within the Ferrant Concord.";
          const halkaLedgerText = [
            "Borrim Stonehand - two ancient lockets - 15 gp.",
            "Orin Farseeker - raw material - three recurring entries.",
            "Hedd Ironbrow - consulting fee - 200 gp - signed H.I.",
            "Kara Dusthand - Delivery to the Hollow - Copper Lane."
          ].join("\n");
          const shouldCreateBellaDocuments =
            input.message.includes(bellaNotebookText) &&
            input.message.includes(bellaWritText);
          const shouldCreateHalkaLedger =
            input.message.includes(halkaLedgerText) ||
            /Halka's ledger says/i.test(input.message);
          const hasBellaNotebookContext = input.message.includes(
            '"context_id": "world:bellas-notebook"'
          );
          const hasHalkaLedgerContext = input.message.includes(
            '"context_id": "world:halkas-ledger"'
          );
          const memoryPayload = (
            shouldCreateCourierLetter && !hasCourierLetterContext
              ? {
                  patches: [],
                  new_context_chunks: [
                    {
                      context_id: "world:courier-letter",
                      context_type: "relevant_world_context",
                      title: "Courier Letter",
                      visibility: "player_safe",
                      markdown: [
                        "# Courier Letter",
                        "",
                        "## Canonical Document Text",
                        courierLetterText,
                        "",
                        "## Established Facts",
                        "- Ira read the courier letter and knows its exact wording.",
                        "- The letter names Marra, the tide gate, the black key, harbor blue, and the initial V.",
                        "",
                        "## Strong Inferences",
                        "The letter points toward a moonrise meeting or handoff at the tide gate.",
                        "",
                        "## DM Seeds",
                        "- Harbor blue may identify watch uniforms, smugglers, or a false-flag disguise.",
                        "",
                        "## Open Questions",
                        "- Who is V?",
                        "- Why does the writer distrust people wearing harbor blue?",
                        "",
                        "## Last Touched",
                        "Created after Ira read the courier letter."
                      ].join("\n")
                    }
                  ],
                  remove_context_chunks: []
                }
              : shouldCreateBellaDocuments && !hasBellaNotebookContext
                ? {
                    patches: [],
                    new_context_chunks: [
                      {
                        context_id: "world:bellas-notebook",
                        context_type: "relevant_world_context",
                        title: "Bella's Notebook",
                        visibility: "player_safe",
                        markdown: [
                          "# Bella's Notebook",
                          "",
                          "## Canonical Document Text",
                          bellaNotebookText,
                          "",
                          "## Established Facts",
                          "- Senden read Bella's notebook and knows its exact revealed entry.",
                          "- The entry links H.K. to a 12 oz Wellglass transaction for 400 gp.",
                          "",
                          "## Strong Inferences",
                          "H.K. is likely Halka Kilnyard.",
                          "",
                          "## DM Seeds",
                          "- The relic exchange may have been cover for Wellglass movement.",
                          "",
                          "## Open Questions",
                          "- Who confirmed the Cinderhalt seal?",
                          "",
                          "## Last Touched",
                          "Created after Senden read Bella's notebook."
                        ].join("\n")
                      },
                      {
                        context_id: "world:league-of-brass-writ",
                        context_type: "relevant_world_context",
                        title: "League of Brass Writ",
                        visibility: "player_safe",
                        markdown: [
                          "# League of Brass Writ",
                          "",
                          "## Canonical Document Text",
                          bellaWritText,
                          "",
                          "## Established Facts",
                          "- Senden read the writ and knows its exact revealed authority.",
                          "",
                          "## Strong Inferences",
                          "The League of Brass investigation covers illicit Wellglass trade.",
                          "",
                          "## DM Seeds",
                          "- The writ could function as leverage or false authority.",
                          "",
                          "## Open Questions",
                          "- Which Master Forge-Alderman signed it?",
                          "",
                          "## Last Touched",
                          "Created after Senden read the writ."
                        ].join("\n")
                      }
                    ],
                    remove_context_chunks: []
                  }
              : shouldCreateHalkaLedger && !hasHalkaLedgerContext
                ? {
                    patches: [],
                    new_context_chunks: [
                      {
                        context_id: "world:halkas-ledger",
                        context_type: "relevant_world_context",
                        title: "Halka's Ledger",
                        visibility: "player_safe",
                        markdown: [
                          "# Halka's Ledger",
                          "",
                          "## Canonical Document Text",
                          halkaLedgerText,
                          "",
                          "## Established Facts",
                          "- Senden read Halka's ledger and knows the exact revealed entries.",
                          "",
                          "## Strong Inferences",
                          "The names may be Cinderhalt contacts or Wellglass customers.",
                          "",
                          "## DM Seeds",
                          "- The Hollow entry can point toward Copper Lane.",
                          "",
                          "## Open Questions",
                          "- Which listed name is safest to investigate first?",
                          "",
                          "## Last Touched",
                          "Created after Senden read Halka's ledger."
                        ].join("\n")
                      }
                    ],
                    remove_context_chunks: []
                  }
              : shouldCreateAmber && hasAmberContext
              ? {
                  patches: [
                    {
                      operation: "replace_section",
                      context_id: "world:amber-sphere",
                      markdown:
                        "# Amber Sphere\n\n## Established Facts\n- The amber sphere rests in the grove's root chamber.\n- The party touched it and woke a pulse of amber light through the roots.\n- The chamber reacted again after the party kept engaging with the sphere.\n\n## Strong Inferences\nThe sphere is bound to the grove's living heart and responds to intent, contact, and memory.\n\n## DM Seeds\n- The sphere may be storing the grove's oldest warning in sensory fragments.\n- Each touch can reveal a different layer of the grove's history or desire.\n\n## Open Questions\n- Is the sphere healing the grove or preparing it to choose a new guardian?\n\n## Last Touched\nUpdated after the party returned attention to the amber sphere."
                    }
                  ],
                  new_context_chunks: [],
                  remove_context_chunks: []
                }
              : shouldCreateAmber
                ? {
                    patches: [],
                    new_context_chunks: [
                      {
                        context_id: "world:amber-sphere",
                        context_type: "relevant_world_context",
                        title: "Amber Sphere",
                        visibility: "player_safe",
                        markdown:
                          "# Amber Sphere\n\n## Established Facts\n- The amber sphere rests in the grove's root chamber.\n- Touching it woke a pulse of amber light through the roots.\n\n## Strong Inferences\nThe sphere is tied to the grove's living heart and reacts to direct contact.\n\n## DM Seeds\n- The sphere may preserve an old warning from the grove.\n- The amber light can become a recurring sign of the grove's attention.\n\n## Open Questions\n- Is the sphere protecting the grove, imprisoning something, or asking for help?\n\n## Last Touched\nCreated after the party touched the amber sphere."
                      },
                      {
                        context_id: "thread:the-amber-sphere",
                        context_type: "quests_open_threads",
                        title: "The Amber Sphere",
                        visibility: "player_safe",
                        markdown:
                          "# The Amber Sphere\n\n## Current Situation\nThe party has touched the amber sphere in the grove's root chamber.\n\n## Stakes\nThe sphere's awakening may change how the grove responds to the party.\n\n## Known Leads\n- Watch the chamber for changes after contact.\n- Ask grove-touched NPCs about the amber light.\n\n## Possible Complications\n- The grove may answer in visions or transformations instead of words.\n\n## Resolution Signals\nThe party learns what the sphere is and decides what to do with it."
                      },
                      {
                        context_id: "secret:the-groves-heart",
                        context_type: "overarching_big_plot_secrets",
                        title: "The Grove's Heart",
                        visibility: "dm_only",
                        markdown:
                          "# The Grove's Heart\n\n## Hidden Truth\nThe amber sphere may be a visible vessel for the grove's deeper heart rather than a separate relic.\n\n## Evidence Planted\nAmber light moves through roots and stone when the sphere is touched.\n\n## Future Reveal Paths\n- Visions can show earlier guardians touching the same light.\n- NPCs tied to the grove may react with reverence or fear.\n\n## Constraints\nDo not confirm the sphere's full nature until the party earns a clearer revelation.\n\n## Open Questions\n- Who first placed or grew the sphere in the root chamber?"
                      }
                    ],
                    remove_context_chunks: []
                  }
                : shouldCreateMarra && hasMarraContext
              ? {
                  patches: [
                    {
                      operation: "replace_section",
                      context_id: "npc:marra-vell",
                      markdown:
                        "# Marra Vell\n\n## Name\nMarra Vell\n\n## Location\nHarbor Watch station.\n\n## Personality\nGuarded, quick-eyed, and newly desperate enough to negotiate.\n\n## Motivations\nStay alive and trade what she knows for protection.\n\n## Disposition Towards You\nStill wary, but more willing to talk after the party found her again.\n\n## Known History\n- First met by the party near Pier 6.\n- Later approached the party at the Harbor Watch station.\n\n## Secrets\nKnows more about the black key than she admitted.\n\n## Open Threads\n- Could reveal who sent the pursuers.\n\n## Last Seen\nAt the Harbor Watch station."
                    }
                  ],
                  new_context_chunks: [],
                  remove_context_chunks: []
                }
              : shouldCreateMarra
                ? {
                    patches: [],
                    new_context_chunks: [
                      {
                        context_id: "npc:marra-vell",
                        title: "Marra Vell",
                        markdown:
                          "# Marra Vell\n\n## Name\nMarra Vell\n\n## Location\nNear Pier 6.\n\n## Personality\nGuarded and quick-eyed.\n\n## Motivations\nStay alive and decide whether the party can be trusted.\n\n## Disposition Towards You\nWary but interested.\n\n## Known History\n- First met by the party near Pier 6.\n\n## Secrets\nKnows more about the black key than she admitted.\n\n## Open Threads\n- Could reveal who sent the pursuers.\n\n## Last Seen\nNear Pier 6."
                      }
                    ],
                    remove_context_chunks: []
                  }
              : {
                  patches: [],
                  new_context_chunks: [],
                  remove_context_chunks: []
                }
          );
          const content = JSON.stringify({
            ...memoryPayload,
            turn_summary: {
              summary:
                "The party's latest resolved action changes the immediate situation, while its longer consequences remain open.",
              entity_keys: [],
              open_thread_keys: [],
              certainty_notes: []
            }
          });

          return {
            id: "provider-memory-updater-1",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        providerInputs.push({
          message: input.message,
          instructions: input.instructions,
          ...(input.currentPlayerAction
            ? { currentPlayerAction: input.currentPlayerAction }
            : {}),
          ...(input.dmJob ? { dmJob: input.dmJob } : {}),
          ...(input.model ? { model: input.model } : {}),
          ...(typeof input.temperature === "number"
            ? { temperature: input.temperature }
            : {}),
          history: (input.history ?? []).map((message) => ({
            role: message.role,
            content: message.content
          }))
        });
        if (providerOverride) {
          return providerOverride(input);
        }

        if (input.instructions.includes("mechanics state updater")) {
          const payload = JSON.parse(input.message) as {
            current_player_action?: string;
            finalized_narrator_prose?: string;
            mechanics_state?: {
              actors?: Record<
                string,
                { spellSlots?: Record<string, { max: number; used: number }> }
              >;
            };
          };
          const action = payload.current_player_action ?? "";
          const prose = payload.finalized_narrator_prose ?? "";
          const actorKey = Object.keys(payload.mechanics_state?.actors ?? {}).find(
            (key) => key.startsWith("player:")
          );
          const slot = actorKey
            ? payload.mechanics_state?.actors?.[actorKey]?.spellSlots?.["3"]
            : undefined;
          const resolvedCast =
            /I cast (Fireball|Lightning Bolt)/i.test(action) &&
            /(fireball erupts|lightning bolt tears)/i.test(prose) &&
            actorKey &&
            slot;
          const content = JSON.stringify({
            no_changes_needed: !resolvedCast,
            mechanics_state_update: resolvedCast
              ? {
                  actors: {
                    [actorKey]: {
                      spellSlots: {
                        "3": { max: slot.max, used: slot.used + 1 }
                      }
                    }
                  }
                }
              : {},
            inventory_state_update: { patches: [] },
            player_facing_update: resolvedCast
              ? `3rd-level spell slot consumed — ${slot.max - slot.used - 1} remaining.`
              : null
          });

          return {
            id: "provider-mechanics-updater-1",
            content,
            debug: {
              requestMessages: [
                { role: "system", content: input.instructions },
                { role: "user", content: input.message }
              ],
              rawResponse: content,
              model: "qwen3.7-flash",
              temperature: 0,
              providerTimings: []
            }
          };
        }

        if (input.message.includes("TRIGGER_PROVIDER_DEBUG_FAILURE")) {
          const error = new Error("DeepSeek returned an empty reply.");
          (error as { debug?: unknown }).debug = {
            requestMessages: [
              {
                role: "system",
                content: input.instructions
              },
              {
                role: "user",
                content: input.message
              }
            ],
            rawResponse: "",
            model: "test-model",
            temperature: 0.8,
            providerTimings: [
              {
                attempt: 1,
                requestStartedAt: new Date(0).toISOString(),
                completedAt: new Date(0).toISOString(),
                totalMs: 12,
                requestBytes: 123,
                responseBytes: 0,
                requestMessageCount: 2,
                requestContentChars: input.instructions.length + input.message.length,
                responseFormat: "json_contract_prompt",
                status: 200,
                ok: true
              }
            ]
          };
          throw error;
        }

        if (
          input.message.includes("TRIGGER_RESOLVED_COMBAT_WITHOUT_ROLLS")
        ) {
          const content = JSON.stringify({
            narration_text:
              "Seren lunges with her blade. The strike hits the bandit squarely, opening a deep wound before he staggers back.",
            roll_requests: [],
            next_input_needed: "player_actions",
            input_targets: [],
            input_policy: "all_players"
          });

          return {
            id: "provider-combat-parse-failure",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.message.includes("TRIGGER_CLARIFICATION_NEXT_INPUT")) {
          const content = JSON.stringify({
            public_narration:
              "Seren, are you casting one spell this turn, or do you have a feature that lets you cast both? Choose the spell and target before I resolve it.",
            resolution_mode: "needs_dice",
            roll_requests: [],
            next_input_needed: "clarification",
            input_targets: ["player:owner"],
            input_policy: "only_targeted_players",
            mechanics_state_update: {}
          });

          return {
            id: "provider-clarification-recovered",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (
          input.message.toLowerCase().includes("scorching ray") &&
          (input.message.toLowerCase().includes("cutlass raider") ||
            input.message.toLowerCase().includes("horn-blower"))
        ) {
          const mechanicsJson = input.message.match(
            /If mechanicsState conflicts[\s\S]*?\n(\{[\s\S]*?\})\n\nCurrent turn input JSON:/
          )?.[1];
          const playerActorKeys =
            mechanicsJson
              ? Object.keys(
                  (JSON.parse(mechanicsJson) as {
                    actors?: Record<string, unknown>;
                  }).actors ?? {}
                ).filter((key) => key.startsWith("player:"))
              : [];
          const isMultiplayer = input.message.includes('"type": "multiplayer_turn"');
          const mechanicsState = mechanicsJson
            ? (JSON.parse(mechanicsJson) as {
                actors?: Record<
                  string,
                  { characterName?: string; currentHp?: number; maxHp?: number }
                >;
              })
            : undefined;
          const targetPlayerKey = playerActorKeys[0] ?? "player:owner";
          const targetPlayer = mechanicsState?.actors?.[targetPlayerKey];
          const targetName = targetPlayer?.characterName ?? "the front-line hero";
          const targetMaxHp = targetPlayer?.maxHp ?? 20;
          const targetCurrentHp = targetPlayer?.currentHp ?? targetMaxHp;
          const targetNextHp = Math.max(0, targetCurrentHp - 6);
          const content = JSON.stringify({
            public_narration:
              `The cutlass raider's turn resolves first. Cutlass raider attack roll: 17 vs AC 14 - hit. Cutlass raider damage roll: 1d6 + 2 = 6 slashing damage.\n\nThe rusted blade bites across ${targetName}'s ribs before the raider wrenches it free. ${targetName} drops from ${targetCurrentHp} HP to ${targetNextHp} HP, still standing but hurt.\n\nControl returns to the heroes. What do you do?`,
            roll_requests: [],
            next_input_needed: "player_actions",
            input_targets: [],
            input_policy: "all_players",
            mechanics_state_update: {
              combat: {
                active: true,
                round: 1,
                turnOwner: isMultiplayer ? playerActorKeys[0] : null,
                initiativeOrder: [
                  ...(playerActorKeys.length > 0 ? playerActorKeys : ["player:owner"]),
                  "npc:cutlass-raider",
                  "npc:horn-blower"
                ]
              },
              actors: {
                "npc:cutlass-raider": {
                  characterName: "Cutlass raider",
                  currentHp: 12,
                  maxHp: 12,
                  conditions: []
                },
                "npc:horn-blower": {
                  characterName: "Horn-blower",
                  currentHp: 10,
                  maxHp: 10,
                  conditions: []
                },
                [targetPlayerKey]: {
                  characterName: targetName,
                  currentHp: targetNextHp,
                  maxHp: targetMaxHp,
                  conditions: []
                }
              }
            },
            combat_events: [
              {
                event: "damage",
                actor: "npc:cutlass-raider",
                target: targetPlayerKey,
                roll: {
                  dice: "1d6",
                  rolls: [4],
                  modifier: 2,
                  total: 6
                },
                damage_type: "slashing",
                amount: 6,
                from_hp: targetCurrentHp,
                to_hp: targetNextHp
              }
            ]
          });

          return {
            id: "provider-npc-turn-catchup",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (
          input.message.includes("I rolled 8d6") &&
          input.message.includes("Fireball damage")
        ) {
          const content = JSON.stringify({
            public_narration:
              "The surprise Fireball detonates across the pier. Mara staggers through the smoke, and the two raiders are thrown back by the blast.\n\nThe opening strike has landed. Now the rest of the fight catches up: roll 1d20 + 2 for initiative.",
            roll_requests: [
              {
                player: "Owner",
                dice: "1d20",
                modifier: 2,
                label: "Initiative",
                advantage_state: "normal",
                reason: "Determine turn order after the surprise opening strike"
              }
            ],
            next_input_needed: "dice_results",
            input_targets: ["Owner"],
            input_policy: "only_targeted_players",
            mechanics_state_update: {
              combat: {
                active: true,
                round: 1,
                turnOwner: "player:owner",
                initiativeOrder: [
                  "player:owner",
                  "npc:mara",
                  "npc:drowned-choir-raider-1",
                  "npc:drowned-choir-raider-2"
                ]
              },
              actors: {
                "npc:mara": {
                  characterName: "Mara",
                  currentHp: 31,
                  maxHp: 45,
                  armorClass: 14,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: []
                },
                "npc:drowned-choir-raider-1": {
                  characterName: "Drowned Choir raider",
                  currentHp: 0,
                  maxHp: 16,
                  armorClass: 13,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: ["down"]
                },
                "npc:drowned-choir-raider-2": {
                  characterName: "Drowned Choir raider",
                  currentHp: 0,
                  maxHp: 16,
                  armorClass: 13,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: ["down"]
                }
              }
            }
          });

          return {
            id: "provider-surprise-fireball-damage",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (
          input.message.includes("I rolled 1d4 + 2") &&
          input.message.includes("Acolyte Damage")
        ) {
          const content = JSON.stringify({
            public_narration:
              "Your fist lands hard. Acolyte Damage: 1d4 + 2 = 5 bludgeoning damage.",
            roll_requests: [],
            next_input_needed: "player_actions",
            input_targets: ["player:owner"],
            input_policy: "only_targeted_players",
            mechanics_state_update: {
              combat: {
                active: true,
                round: 1,
                turnOwner: "player:owner",
                initiativeOrder: ["player:owner", "npc:acolyte-1"]
              }
            },
            combat_events: []
          });

          return {
            id: "provider-acolyte-damage-missing-hp",
            content,
            debug: {
              requestMessages: [
                { role: "user", content: input.message }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.message.includes("I cast fireball on Mara")) {
          const isSurpriseOpening = input.message.includes(
            "Mara has not noticed me"
          );
          const mechanicsJson = input.message.match(
            /If mechanicsState conflicts[\s\S]*?\n(\{[\s\S]*?\})\n\nCurrent turn input JSON:/
          )?.[1];
          const playerActorKey =
            mechanicsJson
              ? Object.keys(
                  (JSON.parse(mechanicsJson) as {
                    actors?: Record<string, unknown>;
                  }).actors ?? {}
                ).find((key) => key.startsWith("player:"))
              : undefined;
          const content = JSON.stringify({
            public_narration:
              isSurpriseOpening
                ? "Seren catches Mara before she can react. Mara and two Drowned Choir raiders are inside the spell radius.\n\nMara rolls 15 and succeeds. The first raider rolls 9 and fails. The second raider rolls 11 and fails.\n\nRoll 8d6 for Fireball damage."
                : "Seren starts to cast Fireball, and Mara and the Drowned Choir raiders snap into motion.\n\nCombat begins. Roll 1d20 + 2 for initiative before the spell is resolved.",
            roll_requests: [
              isSurpriseOpening
                ? {
                    player: "Owner",
                    dice: "8d6",
                    modifier: 0,
                    label: "Fireball damage",
                    advantage_state: "normal",
                    reason:
                      "Resolve the surprise Fireball damage before initiative",
                    combat: {
                      actionId: "seren-surprise-fireball",
                      actorKey: playerActorKey ?? "player:owner",
                      targetActorKey: "npc:mara",
                      kind: "damage_roll",
                      damageType: "fire"
                    }
                  }
                : {
                    player: "Owner",
                    dice: "1d20",
                    modifier: 2,
                    label: "Initiative",
                    advantage_state: "normal",
                    reason: "Determine turn order as combat begins"
                  }
            ],
            next_input_needed: "dice_results",
            input_targets: ["Owner"],
            input_policy: "only_targeted_players",
            mechanics_state_update: {
              combat: {
                active: true,
                round: 1,
                turnOwner: playerActorKey ?? "player:owner",
                initiativeOrder: [
                  playerActorKey ?? "player:owner",
                  "npc:mara",
                  "npc:drowned-choir-raider-1",
                  "npc:drowned-choir-raider-2"
                ]
              },
              actors: {
                "npc:mara": {
                  characterName: "Mara",
                  currentHp: 45,
                  maxHp: 45,
                  armorClass: 14,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: []
                },
                "npc:drowned-choir-raider-1": {
                  characterName: "Drowned Choir raider",
                  currentHp: 16,
                  maxHp: 16,
                  armorClass: 13,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: []
                },
                "npc:drowned-choir-raider-2": {
                  characterName: "Drowned Choir raider",
                  currentHp: 16,
                  maxHp: 16,
                  armorClass: 13,
                  allegiance: "hostile",
                  isPlayerControlled: false,
                  conditions: []
                }
              }
            }
          });

          return {
            id: "provider-initiative-fireball",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("campaign-opening planner")) {
          const selectedRegion =
            input.message.match(/Region: ([^\n]+)/)?.[1]?.trim() ?? "Cael Ambrose";
          const startingLocation =
            input.message.match(/Starting location: ([^\n]+)/)?.[1]?.trim() ??
            "Suncross";

          return {
            id: "provider-planner-1",
            content: JSON.stringify({
              region: selectedRegion,
              starting_location: startingLocation,
              why_the_player_is_here_now:
                "A local messenger asks the character to help with an urgent problem in the selected starting location.",
              concept:
                "A local request turns into an escalating mystery as the character learns why several people want the same truth hidden. As the player follows the messenger's lead, they discover the local network has been exploiting the town's pressures to conceal its work. The campaign becomes a choice between exposing the network, using its leverage, or protecting the people it has trapped.",
              opening_scene:
                "Introduce a public disruption at a marked doorway in the selected starting location. Establish that a worried messenger is present while someone watches the street. Keep the reason for the watch unexplained, and do not have the messenger assign the player a task.",
              private_truth:
                "The messenger's request is connected to a concealed local network that has been exploiting the town's pressures; discovering that recontextualizes the opening and gives the player leverage over the network.",
              campaign_anchors: [
                {
                  type: "region",
                  name: selectedRegion,
                  visibility: "player_safe",
                  description:
                    "The selected Eldermere region, whose local pressures shape the mystery and its consequences.",
                  opening_role: "Its tensions are felt through the first local conflict.",
                  campaign_relevance: "The network exploits regional pressure to protect itself.",
                  future_pressure_or_change: "The regional balance can worsen or shift as the truth emerges.",
                  player_influence: "The player can expose abuses, protect communities, or change which local power gains ground."
                },
                {
                  type: "settlement",
                  name: startingLocation,
                  visibility: "player_safe",
                  description:
                    "The selected starting settlement, where the network's first visible pressure is taking shape.",
                  opening_role: "It contains the marked doorway and first lead.",
                  campaign_relevance: "The settlement is the first community affected by the hidden conflict.",
                  future_pressure_or_change: "It can become more divided, controlled, or resilient as events unfold.",
                  player_influence: "The player can build trust, protect residents, or change who holds local influence."
                },
                {
                  type: "person",
                  name: "Mara Vell",
                  visibility: "player_safe",
                  description: "A worried local messenger carrying the first lead.",
                  opening_role: "She asks the player for help at the marked doorway.",
                  campaign_relevance: "Her divided loyalties connect the player to the hidden network.",
                  future_pressure_or_change: "Fear may make her cooperate, disappear, or betray someone under pressure.",
                  player_influence: "The player can earn her trust, protect her, or expose what she knows."
                },
                {
                  type: "mystery",
                  name: "The Marked Doorway",
                  visibility: "player_safe",
                  description: "A visible sign connected to a concealed local network.",
                  opening_role: "It is an immediate clue the player can investigate.",
                  campaign_relevance: "Its meaning points toward why the network anticipated the player.",
                  future_pressure_or_change: "New markings and erased evidence can deepen the trail.",
                  player_influence: "The player can follow, protect, publicize, or misuse the clues it provides."
                },
                {
                  type: "institution",
                  name: "The Local Network",
                  visibility: "dm_only",
                  description: "A concealed network using local pressure to protect its interests.",
                  opening_role: "Its watchers create the unseen pressure around the first lead.",
                  campaign_relevance: "It is the force behind the campaign's central situation.",
                  future_pressure_or_change: "It can erase evidence, fracture internally, or act openly if threatened.",
                  player_influence: "The player can infiltrate, expose, bargain with, or dismantle it."
                },
                {
                  type: "relationship",
                  name: "Mira's Missing Mentor",
                  visibility: "player_safe",
                  description: "The unresolved relationship that brought Mira to the selected starting location.",
                  opening_role: "It gives the opening lead personal urgency.",
                  campaign_relevance: "The mentor's trail reveals why the player was anticipated.",
                  future_pressure_or_change: "New evidence can change whether the mentor is a victim, ally, or source of danger.",
                  player_influence: "The player can pursue, protect, forgive, or challenge the mentor's legacy."
                }
              ]
            }),
            debug: {
              requestMessages: [],
              rawResponse: "{}",
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("AI Taverns Ask DM context selector")) {
          const shouldSelectRoadTracks =
            /tracks/i.test(input.message) &&
            input.message.includes('"key": "world:road-tracks"');
          const content = JSON.stringify({
            context_keys: {
              npc_context: [],
              player_character_context: [],
              combat_context: [],
              relevant_world_context: shouldSelectRoadTracks
                ? ["world:road-tracks"]
                : [],
              quests_open_threads: [],
              overarching_big_plot_secrets: []
            },
            reason: "Deterministic Ask DM context selector response."
          });

          return {
            id: "provider-ask-dm-selector-1",
            content,
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: content,
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("out-of-turn table question")) {
          const answer =
            input.message.includes("Road Tracks")
              ? "The stored campaign context says the road tracks were made by a two-legged creature dragging a hooked pole."
              : "Those tracks look too broad for a wolf and too deliberate for a stray animal.";

          input.onPublicNarrationDelta?.(answer.slice(0, 28));
          input.onPublicNarrationDelta?.(answer.slice(28));

          return {
            id: "provider-ask-dm-1",
            content: JSON.stringify({ answer }),
            debug: {
              requestMessages: [
                {
                  role: "system",
                  content: input.instructions
                },
                {
                  role: "user",
                  content: input.message
                }
              ],
              rawResponse: "{}",
              model: "test-model",
              temperature: 0.8,
              providerTimings: []
            }
          };
        }

        const publicNarration =
          "The summons that brought you here has the weight of <clue>unfinished business</clue>, the kind that does not let a traveler turn back once the old road bends toward trouble.\n\nFor the last few days, the <place>old road</place> has been mud, cold meals, and warnings from strangers who would not meet your eyes; in the last hour, the trees thinned enough to show the ruined watchtower beyond the ridge.\n\nA <object>lantern</object> flickers over the <place>old road</place> as your adventure begins, its light catching wet stones, wagon ruts, and a <clue>weathered sign</clue> pointing toward the tower beyond the trees.\n\nA <npc>courier</npc> waits beside the sign with their cloak pulled tight, glancing between you and the dark treeline while distant metal knocks once from somewhere inside the ruin.\n\nYou can question the courier, inspect the weathered sign, or follow the road toward the <danger>ruined watchtower</danger> before the lantern burns out.\n\nWhat do you do?";
        const isEldermereNarrator = input.message.includes(
          "ELDERMERE OPENING BRIEF"
        );
        const eldermerePublicNarration =
          "A <npc>courier</npc> waits beside a <clue>weathered sign</clue> on the <place>old road</place>, glancing between you and the <danger>ruined watchtower</danger> beyond the ridge. The summons in your pocket brought you here; earlier that evening, its bearer warned that the tower's lantern had gone dark.\n\nA <object>lantern</object> flickers over wet stones and wagon ruts as <faction>nearby travelers</faction> retreat from the watchtower's distant metal knock. \"That sound came from inside,\" the courier says. \"I am not going back alone.\"\n\nYou can question the courier, inspect the weathered sign, or follow the road toward the ruined watchtower before the lantern burns out.\n\nWhat would you like to do?";
        const resolvedSpellNarration = input.message.includes(
          "I cast Fireball at the clustered skeletons."
        )
          ? "The Fireball erupts among the clustered skeletons."
          : input.message.includes("I cast Lightning Bolt down the hallway.")
            ? "The Lightning Bolt tears down the hallway."
            : null;
        const narratorContent =
          resolvedSpellNarration ??
          (isEldermereNarrator ? eldermerePublicNarration : publicNarration);

        input.onPublicNarrationDelta?.(narratorContent.slice(0, 28));
        input.onPublicNarrationDelta?.(narratorContent.slice(28));

        return {
          id: "provider-message-1",
          content: resolvedSpellNarration ??
            (isEldermereNarrator
            ? eldermerePublicNarration
            : JSON.stringify({
                public_narration: publicNarration,
                roll_requests: [],
                next_input_needed: "player_actions",
                input_targets: [],
                input_policy: "all_players",
                setting: {
                  display_location: "Old Road",
                  world_name: "Test Realm",
                  region_name: "Test Region",
                  scene_location: "Old Road",
                  starting_location: "Old Road"
                }
              })),
          debug: {
            requestMessages: [],
            rawResponse: "{}",
            model: "test-model",
            temperature: 0.8,
            providerTimings: []
          }
        };
      }
    }
  });

  database = installFakeDatabase(app);
});

after(async () => {
  await app.close();
});


export function resetProviderInputs() {
  providerInputs = [];
  providerOverride = undefined;
}

export function getProviderInputs() {
  return providerInputs;
}

export function setProviderOverride(override: AskProvider | undefined) {
  providerOverride = override;
}
