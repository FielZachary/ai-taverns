import pg from "pg";
import {
  databaseSslConfig,
  loadLocalDatabaseEnv,
  requireDatabaseUrl
} from "./db-local-env.mjs";

const { Pool } = pg;

await loadLocalDatabaseEnv();
const databaseUrl = requireDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSslConfig(databaseUrl)
});

const userId = "00000000-0000-4000-8000-000000000101";
const campaignId = "00000000-0000-4000-8000-000000000201";
const playerId = "00000000-0000-4000-8000-000000000301";
const sessionId = "ai-dnd-local-seed";

try {
  await pool.query(
    `
      insert into users (id, email, display_name, subscription_tier)
      values ($1, 'player@example.com', 'Local Player', 'prestige')
      on conflict (id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          subscription_tier = excluded.subscription_tier
    `,
    [userId]
  );
  await pool.query(
    `
      insert into auth_identities (user_id, provider, provider_subject, email)
      values ($1, 'email', 'player@example.com', 'player@example.com')
      on conflict (provider, provider_subject) do nothing
    `,
    [userId]
  );
  await pool.query(
    `
      insert into campaigns (
        id,
        session_id,
        title,
        mode,
        has_begun,
        owner_client_id,
        owner_user_id,
        metadata
      )
      values (
        $1,
        $2,
        'Local Seed Adventure',
        'multiplayer',
        false,
        'local-owner-client',
        $3,
        '{"genre":{"kind":"preset","presetId":"classic_fantasy","label":"Classic Fantasy","promptBrief":"Local seeded campaign."}}'::jsonb
      )
      on conflict (id) do update
      set title = excluded.title,
          owner_user_id = excluded.owner_user_id,
          metadata = excluded.metadata
    `,
    [campaignId, sessionId, userId]
  );
  await pool.query(
    `
      insert into players (
        id,
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
        'local-owner-client',
        $3,
        'Local Player',
        'Astra',
        'A local seed character ready for testing.',
        0,
        'active',
        now()
      )
      on conflict (campaign_id, client_id) do update
      set user_id = excluded.user_id,
          username = excluded.username,
          character_name = excluded.character_name,
          character_sheet = excluded.character_sheet,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at
    `,
    [playerId, campaignId, userId]
  );
  await pool.query(
    `
      insert into turns (campaign_id, status)
      values ($1, 'collecting')
      on conflict do nothing
    `,
    [campaignId]
  );

  console.log(
    "Seeded local database with prestige player@example.com and one campaign."
  );
} finally {
  await pool.end();
}
