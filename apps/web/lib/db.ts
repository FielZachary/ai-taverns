import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var aiDndPgPool: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Database is not configured. Set DATABASE_URL.");
  }

  return databaseUrl;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPool() {
  globalThis.aiDndPgPool ??= new Pool({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: getPositiveIntegerEnv(
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5_000
    ),
    idleTimeoutMillis: getPositiveIntegerEnv("DATABASE_IDLE_TIMEOUT_MS", 10_000),
    max: getPositiveIntegerEnv("DATABASE_POOL_MAX", 1),
    maxUses: getPositiveIntegerEnv("DATABASE_POOL_MAX_USES", 100),
    ssl:
      process.env.DATABASE_SSL_DISABLED === "true"
        ? false
        : {
            rejectUnauthorized: false
          }
  });

  return globalThis.aiDndPgPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  const client = await getPool().connect();

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
