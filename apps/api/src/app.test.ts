import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

test("buildApp serves local media from an absolute public base URL path", async () => {
  const mediaLocalDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "ai-taverns-static-media-")
  );
  await fs.mkdir(path.join(mediaLocalDir, "health"), { recursive: true });
  await fs.writeFile(
    path.join(mediaLocalDir, "health", "probe.txt"),
    "media-ok"
  );

  const app = await buildApp({
    connectToDatabase: false,
    config: loadConfig({
      NODE_ENV: "production",
      MEDIA_STORAGE_DRIVER: "local",
      MEDIA_LOCAL_DIR: mediaLocalDir,
      MEDIA_PUBLIC_BASE_URL: "https://cdn.example.com/media"
    })
  });

  const response = await app.inject({
    method: "GET",
    url: "/media/health/probe.txt"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "media-ok");
  await app.close();
});
