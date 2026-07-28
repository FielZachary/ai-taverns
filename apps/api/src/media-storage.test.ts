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

test("createCharacterPortraitVariants creates landscape webp variants", async () => {
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
        name: "768",
        width: 768,
        height: 512,
        contentType: "image/webp"
      },
      {
        name: "192",
        width: 192,
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
    objectKey: "campaigns/campaign-1/players/player-1/portraits/asset-1/192.webp",
    body: smallVariant.buffer,
    contentType: "image/webp"
  });

  assert.equal(result.storageProvider, "local");
  assert.equal(result.bucket, null);
  assert.equal(
    result.objectKey,
    "campaigns/campaign-1/players/player-1/portraits/asset-1/192.webp"
  );
  assert.equal(
    result.publicUrl,
    "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/192.webp"
  );
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.width, 192);
  assert.equal(result.height, 128);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);

  const saved = await fs.stat(path.join(mediaLocalDir, result.objectKey));
  assert.equal(saved.size, result.byteSize);
});

test("local media storage rejects object keys outside the media directory", async () => {
  const mediaLocalDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "ai-taverns-media-")
  );
  const storage = createMediaStorage(
    loadConfig({
      MEDIA_STORAGE_DRIVER: "local",
      MEDIA_LOCAL_DIR: mediaLocalDir
    })
  );

  await assert.rejects(
    () =>
      storage.putObject({
        objectKey: "../escape.webp",
        body: Buffer.from("not an image"),
        contentType: "image/webp"
      }),
    /escapes local media directory/
  );
});

test("Spaces media storage requires S3-compatible credentials", () => {
  assert.throws(
    () =>
      createMediaStorage(
        loadConfig({
          MEDIA_STORAGE_DRIVER: "spaces",
          SPACES_ENDPOINT: "https://sgp1.digitaloceanspaces.com",
          SPACES_REGION: "sgp1",
          SPACES_BUCKET: "ai-taverns-media"
        })
      ),
    /Spaces storage requires/
  );
});

test("Spaces media storage uploads public objects and returns CDN metadata", async () => {
  const storage = createMediaStorage(
    loadConfig({
      MEDIA_STORAGE_DRIVER: "spaces",
      MEDIA_PUBLIC_BASE_URL: "https://cdn.example.com/media",
      SPACES_ENDPOINT: "https://sgp1.digitaloceanspaces.com",
      SPACES_REGION: "sgp1",
      SPACES_BUCKET: "ai-taverns-media",
      DIGITALOCEAN_SPACES_ACCESS_KEY: "spaces-key",
      DIGITALOCEAN_SPACES_SECRET_KEY: "spaces-secret"
    })
  );
  const sentCommands: Array<{ input?: Record<string, unknown> }> = [];
  (
    storage as unknown as {
      client: { send(command: { input?: Record<string, unknown> }): Promise<unknown> };
    }
  ).client = {
    async send(command) {
      sentCommands.push(command);
      return {};
    }
  };
  const body = (await createCharacterPortraitVariants(await samplePng()))[0];
  assert.ok(body);

  const result = await storage.putObject({
    objectKey: "/campaigns/campaign-1/portrait.webp",
    body: body.buffer,
    contentType: body.contentType
  });

  assert.equal(result.storageProvider, "digitalocean_spaces");
  assert.equal(result.bucket, "ai-taverns-media");
  assert.equal(result.objectKey, "campaigns/campaign-1/portrait.webp");
  assert.equal(
    result.publicUrl,
    "https://cdn.example.com/media/campaigns/campaign-1/portrait.webp"
  );
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.width, 768);
  assert.equal(result.height, 512);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(sentCommands.length, 1);
  assert.equal(sentCommands[0]?.input?.Bucket, "ai-taverns-media");
  assert.equal(sentCommands[0]?.input?.Key, "campaigns/campaign-1/portrait.webp");
  assert.equal(sentCommands[0]?.input?.ACL, "public-read");
  assert.equal(
    sentCommands[0]?.input?.CacheControl,
    "public, max-age=31536000, immutable"
  );
});

test("generic S3 media storage reports the generic storage provider", async () => {
  const storage = createMediaStorage(
    loadConfig({
      MEDIA_STORAGE_DRIVER: "s3",
      MEDIA_PUBLIC_BASE_URL: "https://assets.example.com",
      SPACES_ENDPOINT: "https://s3.example.com",
      SPACES_REGION: "us-east-1",
      SPACES_BUCKET: "media",
      SPACES_ACCESS_KEY_ID: "key",
      SPACES_SECRET_ACCESS_KEY: "secret"
    })
  );
  (
    storage as unknown as {
      client: { send(command: unknown): Promise<unknown> };
    }
  ).client = {
    async send() {
      return {};
    }
  };
  const body = await samplePng();

  const result = await storage.putObject({
    objectKey: "raw/sample.png",
    body,
    contentType: "image/png"
  });

  assert.equal(result.storageProvider, "s3");
  assert.equal(result.publicUrl, "https://assets.example.com/raw/sample.png");
  assert.equal(result.width, 96);
  assert.equal(result.height, 64);
});
