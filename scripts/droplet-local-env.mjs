import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

const dropletEnvKeys = new Set([
  "DROPLET_SSH_HOST",
  "DROPLET_SSH_USER",
  "DROPLET_SSH_PORT",
  "DROPLET_BOOTSTRAP_SSH_KEY",
  "DROPLET_SSH_KEY",
  "DROPLET_ACCESS_TTL_SECONDS"
]);

function parseEnvLine(line) {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmedLine.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmedLine.slice(0, separatorIndex).trim();
  const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
  const value =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;

  return { key, value };
}

export async function loadLocalDropletEnv() {
  const envPaths = [
    join(process.cwd(), "apps", "api", ".env.local"),
    join(process.cwd(), ".env.local")
  ];

  for (const envPath of envPaths) {
    try {
      const text = await readFile(envPath, "utf8");

      for (const line of text.split(/\r?\n/)) {
        const entry = parseEnvLine(line);

        if (entry && dropletEnvKeys.has(entry.key) && entry.value) {
          // The ignored project file is the local source of truth. This avoids
          // accidentally using a stale shell-level Droplet configuration.
          process.env[entry.key] = entry.value;
        }
      }
    } catch {
      // CI and production environments provide these values directly.
    }
  }
}

export async function assertDropletAccessConfig() {
  const host = process.env.DROPLET_SSH_HOST;
  const user = process.env.DROPLET_SSH_USER ?? "root";
  const bootstrapKey =
    process.env.DROPLET_BOOTSTRAP_SSH_KEY ?? process.env.DROPLET_SSH_KEY;

  if (!host || !bootstrapKey) {
    throw new Error(
      "Set DROPLET_SSH_HOST and DROPLET_BOOTSTRAP_SSH_KEY in apps/api/.env.local or the process environment."
    );
  }

  try {
    await access(bootstrapKey, constants.R_OK);
  } catch {
    throw new Error(`Droplet bootstrap key is not readable: ${bootstrapKey}`);
  }

  return { host, user, bootstrapKey };
}
