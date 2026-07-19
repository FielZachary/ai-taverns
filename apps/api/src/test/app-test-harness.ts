import assert from "node:assert/strict";
import { after, before } from "node:test";
import type { FastifyInstance } from "fastify";
import { AuthPasswordlessStartResponseSchema } from "@ai-dnd/contracts";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

export let app: FastifyInstance;
export let database: FakeDatabase;
let providerInputs: {
  message: string;
  instructions: string;
  history: { role: string; content: string }[];
}[] = [];

type QueryResult<T> = {
  rows: T[];
};

type QueryFn = <T = unknown>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

export type DebugFields = {
  model?: unknown;
  rawResponse?: unknown;
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

type TurnRecord = {
  id: string;
  campaign_id: string;
  status: "collecting" | "resolving" | "resolved" | "failed" | "cancelled";
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

class FakeDatabase {
  loginTokens: LoginTokenRecord[] = [];
  users: UserRecord[] = [];
  sessions: SessionRecord[] = [];
  campaigns: CampaignRecord[] = [];
  players: PlayerRecord[] = [];
  joinCodes: JoinCodeRecord[] = [];
  campaignEvents: CampaignEventRecord[] = [];
  turns: TurnRecord[] = [];
  submissions: SubmissionRecord[] = [];
  nextId = 1;

  query: QueryFn = async <T>(sql: string, values: unknown[] = []) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql === "begin" || normalizedSql === "commit") {
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

    if (normalizedSql.startsWith("select * from campaigns where (id = $1")) {
      const roomId = values[0] as string;
      const sessionId = values[1] as string;
      const campaign = this.campaigns.find(
        (candidate) =>
          (candidate.id === roomId || candidate.hermes_session_id === sessionId) &&
          candidate.status !== "deleted"
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql.startsWith(
        "select * from campaigns where (hermes_session_id = $1"
      )
    ) {
      const roomId = values[0] as string;
      const sessionId = values[1] as string;
      const campaign = this.campaigns.find(
        (candidate) =>
          (candidate.hermes_session_id === roomId ||
            candidate.hermes_session_id === sessionId) &&
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

    if (
      normalizedSql ===
      "select * from campaigns where id = $1 and status = 'active' limit 1"
    ) {
      const campaign = this.campaigns.find(
        (candidate) =>
          candidate.id === values[0] && candidate.status === "active"
      );

      return { rows: campaign ? ([campaign] as T[]) : ([] as T[]) };
    }

    if (
      normalizedSql ===
      "select * from campaigns where id = $1 and status <> 'deleted' limit 1"
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
      const isHermesCompatibilityInsert = !normalizedSql.includes("metadata");
      const record: CampaignRecord = {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        hermes_session_id: values[0] as string,
        title: values[1] as string,
        mode: (isHermesCompatibilityInsert ? values[4] : values[2]) as
          | "single_player"
          | "multiplayer",
        status: "active",
        has_begun: false,
        owner_client_id: (isHermesCompatibilityInsert ? values[2] : values[3]) as
          | string
          | null,
        owner_user_id: (isHermesCompatibilityInsert ? values[3] : values[4]) as
          | string
          | null,
        metadata: isHermesCompatibilityInsert
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
        updated_at: now
      };
      this.players.push(record);
      return { rows: [record as T] };
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

    if (
      normalizedSql.startsWith("insert into campaign_current_state") ||
      normalizedSql.startsWith("insert into campaign_memories")
    ) {
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
          eldermereOpeningPlanVersion: 1
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

      if (normalizedSql.includes("and user_id = $2")) {
        const userId = values[1] as string;
        const player = this.players.find(
          (candidate) =>
            candidate.campaign_id === campaignId && candidate.user_id === userId
        );
        return { rows: player ? ([player] as T[]) : ([] as T[]) };
      }

      if (normalizedSql.includes("where campaign_id = $1 and status = 'active'")) {
        return {
          rows: this.players.filter(
            (player) =>
              player.campaign_id === campaignId && player.status === "active"
          ) as T[]
        };
      }

      const clientId = values[1] as string;
      const player = this.players.find(
        (candidate) =>
          candidate.campaign_id === campaignId && candidate.client_id === clientId
      );
      return { rows: player ? ([player] as T[]) : ([] as T[]) };
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

    if (normalizedSql.startsWith("select id, type, payload, created_at from")) {
      const campaignId = values[0] as string;
      if (normalizedSql.includes("and type = 'turn_debug_trace'")) {
        const traceId = values[1] as string | null;
        const limit = values[2] as number;

        return {
          rows: this.campaignEvents
            .filter((event) => {
              if (
                event.campaign_id !== campaignId ||
                event.type !== "turn_debug_trace"
              ) {
                return false;
              }

              const payload = event.payload as Record<string, unknown>;
              return !traceId || payload.traceId === traceId;
            })
            .slice(0, limit) as T[]
        };
      }

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

      return {
        rows: this.campaignEvents
          .filter((event) => {
            const visibleTypes = normalizedSql.includes("limit 1")
              ? ["turn_submitted", "turn_resolved", "adventure_begun"]
              : [
                "turn_submitted",
                "turn_resolved",
                "adventure_begun",
                "dm_question",
                "dm_answer"
                ];

            return (
              event.campaign_id === campaignId &&
              visibleTypes.includes(event.type)
            );
          })
          .slice()
          .reverse()
          .slice(0, normalizedSql.includes("limit 1") ? 1 : undefined) as T[]
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
      AUTH_COOKIE_NAME: "test_session"
    }),
    connectToDatabase: false,
    dmRuntime: {
      askProvider: async (input) => {
        providerInputs.push({
          message: input.message,
          instructions: input.instructions,
          history: (input.history ?? []).map((message) => ({
            role: message.role,
            content: message.content
          }))
        });
        if (input.instructions.includes("AI Taverns response formatter")) {
          return {
            id: "provider-repair-1",
            content: JSON.stringify({
              public_narration:
                "Plain prose from the provider becomes contract JSON.\n\nWhat do you do?",
              roll_requests: [],
              next_input_needed: "player_actions",
              input_targets: [],
              input_policy: "all_players"
            }),
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
              providerTimings: []
            }
          };
        }

        if (input.message.includes("TRIGGER_PROSE_DM_RESPONSE")) {
          const content =
            "Plain prose from the provider becomes contract JSON.\n\nWhat do you do?";

          return {
            id: "provider-prose-1",
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
            public_narration:
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
              providerTimings: []
            }
          };
        }

        if (input.instructions.includes("campaign-opening planner")) {
          const selectedRegion =
            input.message.match(/Region: ([^.]+)\./)?.[1] ?? "Cael Ambrose";
          const startingLocation =
            input.message.match(/Starting settlement: ([^(.\n]+)/)?.[1]?.trim() ??
            "Suncross";

          return {
            id: "provider-planner-1",
            content: JSON.stringify({
              campaign_title: "The Quiet Road",
              region: {
                name: selectedRegion,
                why_this_region: "It gives the opener a concrete local conflict.",
                plain_description: "A troubled Eldermere region with pressure close enough to touch."
              },
              starting_location: {
                name: startingLocation,
                type: "settlement",
                why_this_location: "It is the selected campaign start.",
                plain_description: "A specific place where the first problem is already visible."
              },
              opening_premise: {
                why_the_party_is_here: "The party has come to answer a local summons.",
                immediate_objective: "Find the person who sent for them.",
                immediate_complication: "The locals are afraid to explain what happened.",
                first_scene_location: "At the edge of the starting settlement.",
                opening_mood: "watchful and tense",
                campaign_promise: "A grounded mystery with old power underneath it."
              },
              player_facing_facts: [
                "The party has a reason to be here now.",
                "Someone local needs help and is afraid."
              ],
              allowed_player_facing_terms: [
                {
                  term: selectedRegion,
                  plain_meaning: "the larger region where the campaign begins"
                },
                {
                  term: startingLocation,
                  plain_meaning: "the settlement where the first scene begins"
                }
              ],
              npc_seed: [
                {
                  name: "Mara Vell",
                  role: "a worried local messenger",
                  wants: "help without drawing official attention",
                  visible_behavior: "keeps watching the street behind her"
                }
              ],
              first_interactable_choices: [
                "question Mara Vell",
                "inspect the marked doorway",
                "ask nearby locals what frightened them"
              ],
              sensory_palette: {
                sights: ["a marked doorway", "lanterns lit early"],
                sounds: ["low voices", "boots on stone"],
                smells: ["cold rain"],
                textures_or_weather: ["damp air"]
              },
              dm_private_context: [
                "Old world lore may matter later, but should not be named in the opening."
              ],
              forbidden_opening_terms: [
                "Second Dominion",
                "Graywake",
                "Wellglass",
                "Curia of Watchers",
                "Ashen Scholar"
              ],
              narrator_instructions: [
                "Use the allowed terms only.",
                "Explain each allowed term plainly."
              ],
              opening_quality_checks: [
                "No forbidden opening terms appear.",
                "The first choices are clear."
              ]
            }),
            debug: {
              requestMessages: [],
              rawResponse: "{}",
              model: "test-model",
              providerTimings: []
            }
          };
        }
        const publicNarration =
          "A lantern flickers over the old road as your adventure begins.\n\nA weathered sign points toward a ruined watchtower beyond the trees.\n\nWhat do you do?";
        const isEldermereNarrator = input.message.includes(
          'Set setting.world_name to "Eldermere".'
        );
        const eldermereStartingLocation =
          input.message.match(
            /Set setting\.starting_location and setting\.display_location to "([^"]+)"/
          )?.[1] ?? "Old Road";

        input.onPublicNarrationDelta?.(publicNarration.slice(0, 28));
        input.onPublicNarrationDelta?.(publicNarration.slice(28));

        return {
          id: "provider-message-1",
          content: JSON.stringify({
            public_narration: publicNarration,
            roll_requests: [],
            next_input_needed: "player_actions",
            input_targets: [],
            input_policy: "all_players",
            setting: {
              display_location: isEldermereNarrator
                ? eldermereStartingLocation
                : "Old Road",
              world_name: isEldermereNarrator ? "Eldermere" : "Test Realm",
              starting_location: isEldermereNarrator
                ? eldermereStartingLocation
                : "Old Road"
            }
          }),
          debug: {
            requestMessages: [],
            rawResponse: "{}",
            model: "test-model",
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
}

export function getProviderInputs() {
  return providerInputs;
}
