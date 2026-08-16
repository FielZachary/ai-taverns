import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLocalDatabaseEnv() {
  const envPaths = [
    join(process.cwd(), "apps", "api", ".env.local"),
    join(process.cwd(), "apps", "web", ".env.local"),
    join(process.cwd(), ".env.local")
  ];

  for (const envPath of envPaths) {
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
        const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
        const value =
          (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
          (rawValue.startsWith("'") && rawValue.endsWith("'"))
            ? rawValue.slice(1, -1)
            : rawValue;

        if (!value) {
          continue;
        }

        process.env[key] ??= value;
      }
    } catch {
      // Deployment and CI environments can provide DATABASE_URL directly.
    }
  }
}

export function requireDatabaseUrl() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/ai_taverns";

  if (!databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1")) {
    console.error("Refusing to run local database script against non-local DATABASE_URL.");
    process.exit(1);
  }

  return databaseUrl;
}

export function databaseSslConfig(databaseUrl) {
  return process.env.DATABASE_SSL_DISABLED === "true" ||
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1")
    ? false
    : {
        rejectUnauthorized: false
      };
}
