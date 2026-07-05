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

try {
  await pool.query("drop schema public cascade");
  await pool.query("create schema public");
  console.log("Reset local database schema.");
} finally {
  await pool.end();
}
