import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { redirect } from "next/navigation";
import { GameShell } from "@/components/playing/GameShell";
import { getOptionalUser } from "@/lib/auth";

type DebugPageProps = {
  searchParams: Promise<{
    campaignId?: string | string[];
    sourceCampaignId?: string | string[];
  }>;
};

const defaultDatabaseUrl = "postgres://postgres:postgres@localhost:5432/ai_taverns";
const repoRoot = process.env.DEBUG_REPO_ROOT ?? process.cwd();
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const execFileAsync = promisify(execFile);

function databaseUrl() {
  return process.env.DEBUG_DATABASE_URL ?? defaultDatabaseUrl;
}

function databaseSsl() {
  const url = databaseUrl();

  if (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    process.env.DEBUG_DATABASE_SSL_DISABLED === "true"
  ) {
    return false;
  }

  return { rejectUnauthorized: false };
}

function debugSessionId(sourceCampaignId: string, userId: string) {
  return `debug-${sourceCampaignId}-${userId}`;
}

function isUuid(value: string) {
  return uuidPattern.test(value);
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function extractCampaignLookup(value: string) {
  try {
    const url = new URL(value);
    return (
      url.searchParams.get("campaignId") ??
      url.searchParams.get("sourceCampaignId")
    );
  } catch {
    // Not a full URL. It may still be a pasted query string.
  }

  const query = value.startsWith("?") ? value.slice(1) : value;

  if (!/^(campaignId|sourceCampaignId)=/.test(query)) {
    return null;
  }

  const params = new URLSearchParams(query);

  return params.get("campaignId") ?? params.get("sourceCampaignId");
}

function normalizeCampaignLookup(value: string) {
  let normalized = value.trim();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const extracted = extractCampaignLookup(normalized)?.trim();

    if (!extracted || extracted === normalized) {
      return normalized;
    }

    normalized = extracted;
  }

  return normalized;
}

async function withDebugDb<T>(callback: (client: pg.PoolClient) => Promise<T>) {
  const pool = new pg.Pool({
    connectionString: databaseUrl(),
    ssl: databaseSsl()
  });

  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
    await pool.end();
  }
}

type CampaignRow = {
  id: string;
  session_id: string;
  title: string;
  metadata: unknown;
  owner_user_id: string | null;
};

type ProductionPlayer = {
  username: string;
  character_name: string;
  character_sheet: string;
  slot: number | null;
};

type ProductionEvent = {
  type: string;
  payload: unknown;
  created_at: string;
};

type ProductionCampaignSnapshot = {
  campaign: CampaignRow | null;
  players: ProductionPlayer[];
  events: ProductionEvent[];
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function extractJsonObject(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("Production export did not return JSON.");
  }

  return output.slice(start, end + 1);
}

async function fetchProductionCampaignSnapshot(sourceCampaignId: string) {
  const isSourceUuid = isUuid(sourceCampaignId);
  const sourcePredicate = isSourceUuid
    ? `campaigns.id = ${shellQuote(sourceCampaignId)}::uuid`
    : `campaigns.session_id = ${shellQuote(sourceCampaignId)}`;
  const sql = `
with source_campaign as (
  select id, session_id, title, metadata, owner_user_id
  from campaigns
  where ${sourcePredicate}
    and status <> 'deleted'
  limit 1
)
select json_build_object(
  'campaign', (select row_to_json(source_campaign) from source_campaign),
  'players', coalesce((
    select json_agg(json_build_object(
      'username', players.username,
      'character_name', players.character_name,
      'character_sheet', players.character_sheet,
      'slot', players.slot
    ) order by players.slot asc nulls last, players.created_at asc)
    from players
    join source_campaign on source_campaign.id = players.campaign_id
    where players.status = 'active'
  ), '[]'::json),
  'events', coalesce((
    select json_agg(json_build_object(
      'type', campaign_events.type,
      'payload', campaign_events.payload,
      'created_at', campaign_events.created_at
    ) order by campaign_events.created_at asc, campaign_events.id asc)
    from campaign_events
    join source_campaign on source_campaign.id = campaign_events.campaign_id
  ), '[]'::json)
);
`.trim();
  const psqlCommand = `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -t -A -c ${shellQuote(sql)}`;
  const remoteCommand = `cd /opt/ai-taverns && docker compose --env-file infra/production.env -f infra/docker-compose.production.yml exec -T postgres sh -lc ${shellQuote(psqlCommand)}`;
  let stdout: string;

  try {
    ({ stdout } = await execFileAsync("npm", [
      "run",
      "droplet:one-time-access",
      "--",
      remoteCommand
    ], {
      cwd: repoRoot,
      maxBuffer: 100 * 1024 * 1024
    }));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);

    if (details.includes("Permission denied (publickey)")) {
      throw new Error(
        "Production import could not access the droplet. Check DROPLET_BOOTSTRAP_SSH_KEY/DROPLET_SSH_KEY and DROPLET_SSH_USER; the runbook default user is root."
      );
    }

    throw error;
  }

  return JSON.parse(extractJsonObject(stdout)) as ProductionCampaignSnapshot;
}

async function ensureDebugCampaign(input: {
  sourceCampaignId: string;
  userId: string;
}) {
  return withDebugDb(async (client) => {
    const sourceLookupIsUuid = isUuid(input.sourceCampaignId);
    const existingDebug = await client.query<CampaignRow>(
      `
        select id, session_id, title, metadata, owner_user_id
        from campaigns
        where ${
          sourceLookupIsUuid
            ? "metadata->>'debugSourceCampaignId' = $1"
            : "metadata->>'debugSourceLookup' = $1"
        }
          and owner_user_id = $2
          and metadata->>'debugSourceCampaignId' is not null
          and status = 'active'
        limit 1
      `,
      [input.sourceCampaignId, input.userId]
    );

    if (existingDebug.rows[0]) {
      return existingDebug.rows[0].id;
    }

    const sessionId = debugSessionId(input.sourceCampaignId, input.userId);
    const reusableDebug = await client.query<CampaignRow>(
      `
        select id, session_id, title, metadata, owner_user_id
        from campaigns
        where session_id = $1
          and owner_user_id = $2
          and status = 'active'
        limit 1
      `,
      [sessionId, input.userId]
    );

    if (reusableDebug.rows[0]) {
      return reusableDebug.rows[0].id;
    }

    const sourceSql = sourceLookupIsUuid
      ? `
          select id, session_id, title, metadata, owner_user_id
          from campaigns
          where id = $1
            and status <> 'deleted'
          limit 1
        `
      : `
          select id, session_id, title, metadata, owner_user_id
          from campaigns
          where session_id = $1
            and status <> 'deleted'
          limit 1
        `;
    const source = await client.query<CampaignRow>(
      sourceSql,
      [input.sourceCampaignId]
    );
    const sourceCampaign = source.rows[0];
    const productionSnapshot = sourceCampaign
      ? null
      : await fetchProductionCampaignSnapshot(input.sourceCampaignId);
    const resolvedSourceCampaign = sourceCampaign ?? productionSnapshot?.campaign;
    const sourcePlayers = productionSnapshot?.players ?? null;
    const sourceEvents = productionSnapshot?.events ?? null;

    if (!resolvedSourceCampaign) {
      throw new Error("Campaign not found in production.");
    }

    await client.query("begin");

    try {
      const debugCampaignId = randomUUID();
      const metadata = {
        ...(resolvedSourceCampaign.metadata &&
        typeof resolvedSourceCampaign.metadata === "object" &&
        !Array.isArray(resolvedSourceCampaign.metadata)
          ? resolvedSourceCampaign.metadata
          : {}),
        debugSourceCampaignId: resolvedSourceCampaign.id,
        debugSourceLookup: input.sourceCampaignId,
        debugSourceSessionId: resolvedSourceCampaign.session_id,
        debugCreatedAt: new Date().toISOString()
      };

      await client.query(
        `
          insert into campaigns (
            id,
            session_id,
            title,
            mode,
            status,
            has_begun,
            owner_client_id,
            owner_user_id,
            metadata
          )
          values ($1, $2, $3, 'single_player', 'active', true, $4, $5, $6::jsonb)
        `,
        [
          debugCampaignId,
          sessionId,
          `[Debug] ${resolvedSourceCampaign.title}`,
          input.userId,
          input.userId,
          JSON.stringify(metadata)
        ]
      );

      if (sourcePlayers) {
        const sourcePlayer = sourcePlayers[0];

        if (sourcePlayer) {
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
              values ($1, $2, $3, $4, $5, $6, 0, 'active', now())
            `,
            [
              debugCampaignId,
              input.userId,
              input.userId,
              sourcePlayer.username || "Debug Player",
              sourcePlayer.character_name || "Debug Character",
              sourcePlayer.character_sheet || "Quick fantasy adventurer template."
            ]
          );
        }
      } else {
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
            select
              $1,
              $2,
              $3,
              coalesce(nullif(username, ''), 'Debug Player'),
              coalesce(nullif(character_name, ''), 'Debug Character'),
              coalesce(nullif(character_sheet, ''), 'Quick fantasy adventurer template.'),
              0,
              'active',
              now()
            from players
            where campaign_id = $4
              and status = 'active'
            order by slot asc nulls last, created_at asc
            limit 1
          `,
          [debugCampaignId, input.userId, input.userId, resolvedSourceCampaign.id]
        );
      }

      const playerCount = await client.query<{ count: string }>(
        "select count(*) from players where campaign_id = $1",
        [debugCampaignId]
      );

      if (Number(playerCount.rows[0]?.count ?? 0) === 0) {
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
            values (
              $1,
              $2,
              $3,
              'Debug Player',
              'Debug Character',
              'Quick fantasy adventurer template.',
              0,
              'active',
              now()
            )
          `,
          [debugCampaignId, input.userId, input.userId]
        );
      }

      if (sourceEvents) {
        for (const event of sourceEvents) {
          await client.query(
            `
              insert into campaign_events (campaign_id, type, payload, created_at)
              values ($1, $2, $3::jsonb, $4::timestamptz)
            `,
            [
              debugCampaignId,
              event.type,
              JSON.stringify(event.payload ?? {}),
              event.created_at
            ]
          );
        }
      } else {
        await client.query(
          `
            insert into campaign_events (campaign_id, type, payload, created_at)
            select $1, type, payload, created_at
            from campaign_events
            where campaign_id = $2
            order by created_at asc, id asc
          `,
          [debugCampaignId, resolvedSourceCampaign.id]
        );
      }

      await client.query(
        "insert into turns (campaign_id, status) values ($1, 'collecting')",
        [debugCampaignId]
      );

      await client.query("commit");

      return debugCampaignId;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

function DebugCampaignPicker({ error }: { error?: string }) {
  return (
    <main className="table-page">
      <section className="play-table" aria-label="Debug campaign loader">
        <div className="story-column">
          <form className="debug-campaign-picker" action="/debug" method="get">
            <label htmlFor="debug-campaign-id">Campaign ID</label>
            <input
              id="debug-campaign-id"
              name="campaignId"
              placeholder="bee02d07-143a-4bb7-8f3c-058b7ddeb8a4"
              required
              type="text"
            />
            <button type="submit">Load Campaign</button>
          </form>
          {error ? (
            <p className="table-alert" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default async function DebugPage({ searchParams }: DebugPageProps) {
  const user = await getOptionalUser();
  const { campaignId, sourceCampaignId } = await searchParams;
  const requestedCampaignId = firstSearchParam(campaignId);
  const requestedSourceCampaignId = firstSearchParam(sourceCampaignId);
  const normalizedCampaignId = requestedCampaignId
    ? normalizeCampaignLookup(requestedCampaignId)
    : "";

  if (!user) {
    const next = normalizedCampaignId
      ? `/debug?campaignId=${encodeURIComponent(normalizedCampaignId)}`
      : "/debug";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!normalizedCampaignId) {
    return <DebugCampaignPicker />;
  }

  if (!requestedSourceCampaignId) {
    let debugCampaignId: string;

    try {
      debugCampaignId = await ensureDebugCampaign({
        sourceCampaignId: normalizedCampaignId,
        userId: user.id
      });
    } catch (error) {
      return (
        <DebugCampaignPicker
          error={
            error instanceof Error
              ? error.message
              : "Campaign could not be loaded."
          }
        />
      );
    }

    if (debugCampaignId !== normalizedCampaignId) {
      redirect(
        `/debug?campaignId=${encodeURIComponent(
          debugCampaignId
        )}&sourceCampaignId=${encodeURIComponent(normalizedCampaignId)}`
      );
    }
  }

  return (
    <GameShell
      allowUnlistedInitialCampaign
      includeAllMessages
      initialCampaignId={normalizedCampaignId}
      routePath="/debug"
      userEmail={user.email}
      userId={user.id}
    />
  );
}
