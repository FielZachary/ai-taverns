import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const migrationsDir = join(process.cwd(), "infra", "db", "migrations");

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
    // The deployment environment can provide DATABASE_URL directly.
  }
}

await loadLocalEnv();

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

try {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const migrationFile of migrationFiles) {
    const path = join(migrationsDir, migrationFile);
    const sql = await readFile(path, "utf8");
    await pool.query(sql);
    console.log(`Applied ${migrationFile}`);
  }
} finally {
  await pool.end();
}
