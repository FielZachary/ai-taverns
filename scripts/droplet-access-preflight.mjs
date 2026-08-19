import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDropletAccessConfig,
  loadLocalDropletEnv
} from "./droplet-local-env.mjs";

const execFileAsync = promisify(execFile);

try {
  await loadLocalDropletEnv();
  const { host, user } = await assertDropletAccessConfig();
  await execFileAsync("npm", ["run", "droplet:one-time-access", "--", "true"], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024
  });
  console.log(`One-time droplet access is ready for ${user}@${host}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Droplet access preflight failed: ${message}`);
  process.exitCode = 1;
}
