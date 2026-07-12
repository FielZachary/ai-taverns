import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const defaultDatabaseUrl =
  "postgres://postgres:postgres@localhost:5432/ai_taverns_playwright";
const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL ?? defaultDatabaseUrl;
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));

if (
  !["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)
) {
  console.error("Refusing to reset a non-local Playwright database.");
  process.exit(1);
}

if (!databaseName || databaseName === "postgres") {
  console.error("PLAYWRIGHT_DATABASE_URL must point to a dedicated database.");
  process.exit(1);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseSslConfig(url) {
  return process.env.DATABASE_SSL_DISABLED === "true" ||
    url.includes("localhost") ||
    url.includes("127.0.0.1")
    ? false
    : {
        rejectUnauthorized: false
      };
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";
const migrationsDir = join(process.cwd(), "infra", "db", "migrations");

const adminPool = new Pool({
  connectionString: adminUrl.toString(),
  ssl: databaseSslConfig(adminUrl.toString())
});

try {
  const existingDatabase = await adminPool.query(
    "select 1 from pg_database where datname = $1",
    [databaseName]
  );

  if (existingDatabase.rowCount === 0) {
    await adminPool.query(`create database ${quoteIdentifier(databaseName)}`);
    console.log(`Created Playwright database ${databaseName}.`);
  }
} finally {
  await adminPool.end();
}

const appPool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSslConfig(databaseUrl)
});

try {
  await appPool.query("drop schema if exists public cascade");
  await appPool.query("create schema public");

  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(join(migrationsDir, migrationFile), "utf8");
    await appPool.query(sql);
    console.log(`Applied ${migrationFile}`);
  }

  console.log(`Reset Playwright database ${databaseName}.`);
} finally {
  await appPool.end();
}
