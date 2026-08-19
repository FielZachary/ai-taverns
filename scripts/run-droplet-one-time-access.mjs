import { spawn } from "node:child_process";
import { loadLocalDropletEnv } from "./droplet-local-env.mjs";

await loadLocalDropletEnv();

const child = spawn(
  "bash",
  ["scripts/droplet-one-time-access.sh", ...process.argv.slice(2)],
  { env: process.env, stdio: "inherit" }
);

child.once("error", (error) => {
  console.error(`Could not start one-time droplet access: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
