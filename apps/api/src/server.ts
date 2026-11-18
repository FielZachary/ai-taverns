import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function loadLocalEnvironment() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [
    path.join(apiRoot, ".env.local"),
    path.resolve(apiRoot, "../web/.env.local"),
    path.resolve(apiRoot, "../../.env.local")
  ];

  for (const envPath of candidates) {
    try {
      const contents = await readFile(envPath, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const separator = line.indexOf("=");
        if (separator < 1 || line.trimStart().startsWith("#")) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // Local environment files are optional.
    }
  }
}

await loadLocalEnvironment();
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
