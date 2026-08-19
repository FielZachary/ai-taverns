import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadLocalEnvironment();
const config = loadConfig();
const app = await buildApp({
  config,
  connectToDatabase: true
});

try {
  await app.listen({
    host: config.host,
    port: config.port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
