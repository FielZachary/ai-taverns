import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { loadConfig } from "./config.js";
import {
  createCharacterPortraitVariants,
  createMediaStorage
} from "./media-storage.js";

async function samplePng() {
  return sharp({
    create: {
      width: 96,
      height: 64,
      channels: 4,
      background: "#4f8cff"
    }
  })
    .png()
    .toBuffer();
}

test("createCharacterPortraitVariants creates square webp variants", async () => {
  const variants = await createCharacterPortraitVariants(await samplePng());

  assert.deepEqual(
    variants.map((variant) => ({
      name: variant.name,
      width: variant.width,
      height: variant.height,
      contentType: variant.contentType
    })),
    [
      {
        name: "512",
        width: 512,
        height: 512,
        contentType: "image/webp"
      },
      {
        name: "128",
        width: 128,
        height: 128,
        contentType: "image/webp"
      }
    ]
  );
  assert.ok(variants.every((variant) => variant.buffer.byteLength > 0));
});

test("local media storage writes objects and returns stable metadata", async () => {
  const mediaLocalDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "ai-taverns-media-")
  );
  const storage = createMediaStorage(
    loadConfig({
      MEDIA_STORAGE_DRIVER: "local",
      MEDIA_LOCAL_DIR: mediaLocalDir,
      MEDIA_PUBLIC_BASE_URL: "/media"
    })
  );

  const variants = await createCharacterPortraitVariants(await samplePng());
  const smallVariant = variants[1];
  assert.ok(smallVariant);

  const result = await storage.putObject({
    objectKey: "campaigns/campaign-1/players/player-1/portraits/asset-1/128.webp",
    body: smallVariant.buffer,
    contentType: "image/webp"
  });

  assert.equal(result.storageProvider, "local");
  assert.equal(result.bucket, null);
  assert.equal(
    result.objectKey,
    "campaigns/campaign-1/players/player-1/portraits/asset-1/128.webp"
  );
  assert.equal(
    result.publicUrl,
    "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/128.webp"
  );
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.width, 128);
  assert.equal(result.height, 128);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);

  const saved = await fs.stat(path.join(mediaLocalDir, result.objectKey));
  assert.equal(saved.size, result.byteSize);
});
