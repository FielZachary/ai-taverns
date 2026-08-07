import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function packageHasDropletAccessScript(directory: string) {
  const packageJsonPath = join(directory, "package.json");

  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, unknown>;
    };

    return typeof packageJson.scripts?.["droplet:one-time-access"] === "string";
  } catch {
    return false;
  }
}

export function resolveDropletCommandCwd(startDirectory = process.cwd()) {
  if (process.env.DEBUG_REPO_ROOT) {
    return process.env.DEBUG_REPO_ROOT;
  }

  let directory = resolve(startDirectory);

  while (true) {
    if (packageHasDropletAccessScript(directory)) {
      return directory;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return startDirectory;
    }

    directory = parent;
  }
}
