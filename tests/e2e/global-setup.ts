import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

async function loadLocalEnv() {
  const envPath = join(process.cwd(), "apps", "web", ".env.local");

  try {
    const text = await readFile(envPath, "utf8");

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
    // CI can provide DATABASE_URL directly.
  }
}

async function globalSetup() {
  await loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;
  const userId =
    process.env.E2E_TEST_USER_ID ?? "00000000-0000-0000-0000-00000000e2e1";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for E2E tests.");
  }

  process.env.E2E_TEST_USER_ID = userId;

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL_DISABLED === "true"
        ? false
        : {
            rejectUnauthorized: false
          }
  });

  try {
    await pool.query(
      `
        insert into auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at
        )
        values (
          '00000000-0000-0000-0000-000000000000',
          $1,
          'authenticated',
          'authenticated',
          'e2e@ai-taverns.test',
          '',
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        )
        on conflict (id) do nothing
      `,
      [userId]
    );
  } finally {
    await pool.end();
  }
}

export default globalSetup;
