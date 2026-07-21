import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

async function loadEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");

    for (const line of text.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      process.env[key] ??= value;
    }
  } catch {
    // CI and droplet shells can provide DATABASE_URL directly.
  }
}

await loadEnvFile(join(process.cwd(), "infra", "production.env"));

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.DATABASE_SSL_DISABLED === "true"
      ? false
      : {
          rejectUnauthorized: false
        }
});

const failures = [];
const warnings = [];

async function scalar(name, sql) {
  const result = await pool.query(sql);
  const value = Number(result.rows[0]?.count ?? 0);
  console.log(`${name}: ${value}`);
  return value;
}

function failIfPositive(name, count) {
  if (count > 0) {
    failures.push(`${name} returned ${count}`);
  }
}

try {
  const missingTables = await pool.query(`
    select expected.table_name
    from (
      values
        ('users'),
        ('auth_identities'),
        ('sessions'),
        ('login_tokens'),
        ('campaigns'),
        ('players'),
        ('turns'),
        ('submissions'),
        ('campaign_events'),
        ('campaign_join_codes'),
        ('campaign_context_chunks'),
        ('active_combats'),
        ('combat_events'),
        ('dm_turn_traces'),
        ('dm_context_snapshots'),
        ('dm_model_calls'),
        ('dm_output_reports'),
        ('dm_memory_patch_logs')
    ) as expected(table_name)
    left join information_schema.tables existing
      on existing.table_schema = 'public'
      and existing.table_name = expected.table_name
    where existing.table_name is null
  `);

  if (missingTables.rowCount > 0) {
    failures.push(
      `missing tables: ${missingTables.rows.map((row) => row.table_name).join(", ")}`
    );
  }

  failIfPositive(
    "constraints still referencing auth schema",
    await scalar(
      "constraints still referencing auth schema",
      `
        select count(*)
        from pg_constraint constraint_record
        join pg_class referenced_table
          on referenced_table.oid = constraint_record.confrelid
        join pg_namespace referenced_schema
          on referenced_schema.oid = referenced_table.relnamespace
        where referenced_schema.nspname = 'auth'
      `
    )
  );

  failIfPositive(
    "campaigns with invalid owner_user_id",
    await scalar(
      "campaigns with invalid owner_user_id",
      `
        select count(*)
        from campaigns
        left join users on users.id = campaigns.owner_user_id
        where campaigns.owner_user_id is not null
          and users.id is null
      `
    )
  );

  failIfPositive(
    "players with invalid campaign_id",
    await scalar(
      "players with invalid campaign_id",
      `
        select count(*)
        from players
        left join campaigns on campaigns.id = players.campaign_id
        where campaigns.id is null
      `
    )
  );

  failIfPositive(
    "turns with invalid campaign_id",
    await scalar(
      "turns with invalid campaign_id",
      `
        select count(*)
        from turns
        left join campaigns on campaigns.id = turns.campaign_id
        where campaigns.id is null
      `
    )
  );

  failIfPositive(
    "submissions with invalid turn_id",
    await scalar(
      "submissions with invalid turn_id",
      `
        select count(*)
        from submissions
        left join turns on turns.id = submissions.turn_id
        where turns.id is null
      `
    )
  );

  failIfPositive(
    "campaign events with invalid campaign_id",
    await scalar(
      "campaign events with invalid campaign_id",
      `
        select count(*)
        from campaign_events
        left join campaigns on campaigns.id = campaign_events.campaign_id
        where campaigns.id is null
      `
    )
  );

  const ownerlessActiveCampaigns = await scalar(
    "active campaigns without owner_user_id",
    `
      select count(*)
      from campaigns
      where status = 'active'
        and owner_user_id is null
    `
  );

  if (ownerlessActiveCampaigns > 0) {
    const message = `active campaigns without owner_user_id returned ${ownerlessActiveCampaigns}`;
    if (process.env.CUTOVER_STRICT_OWNERS === "true") {
      failures.push(message);
    } else {
      warnings.push(message);
    }
  }

  const usersCount = await scalar("users", "select count(*) from users");
  const campaignsCount = await scalar("campaigns", "select count(*) from campaigns");
  const sessionsCount = await scalar("sessions", "select count(*) from sessions");

  if (usersCount === 0 && campaignsCount > 0) {
    warnings.push("campaigns exist but users is empty; verify the user migration intentionally left campaigns unclaimed");
  }

  if (sessionsCount > 0) {
    warnings.push("sessions table is not empty; verify no Supabase session tokens were migrated");
  }

  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`failed: ${failure}`);
    }
    process.exit(1);
  }

  console.log("production cutover data checks passed");
} finally {
  await pool.end();
}
