import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import type { ApiConfig } from "./config.js";

export type MediaStorageProvider = "local" | "digitalocean_spaces" | "s3";

export type StoredMediaObject = {
  storageProvider: MediaStorageProvider;
  bucket: string | null;
  objectKey: string;
  publicUrl: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
};

export type MediaStorage = {
  putObject(input: {
    objectKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredMediaObject>;
};

export type ImageVariant = {
  name: string;
  width: number;
  height: number;
  buffer: Buffer;
  contentType: "image/webp";
};

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(apiDir, "../../..");

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function joinUrl(baseUrl: string, objectKey: string) {
  if (baseUrl.startsWith("/")) {
    return `${baseUrl.replace(/\/+$/, "")}/${trimSlashes(objectKey)}`;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${trimSlashes(objectKey)}`;
}

async function imageDimensions(body: Buffer) {
  const metadata = await sharp(body).metadata();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null
  };
}

export async function createCharacterPortraitVariants(
  source: Buffer
): Promise<ImageVariant[]> {
  const sizes = [
    { name: "512", width: 512, height: 512, quality: 86 },
    { name: "128", width: 128, height: 128, quality: 82 }
  ];

  return Promise.all(
    sizes.map(async ({ name, width, height, quality }) => ({
      name,
      width,
      height,
      buffer: await sharp(source)
        .resize(width, height, {
          fit: "cover",
          position: "attention"
        })
        .webp({ quality })
        .toBuffer(),
      contentType: "image/webp" as const
    }))
  );
}

export function createMediaStorage(config: ApiConfig): MediaStorage {
  if (config.mediaStorageDriver === "local") {
    return new LocalMediaStorage(config);
  }

  return new S3MediaStorage(config);
}

class LocalMediaStorage implements MediaStorage {
  private readonly rootDir: string;

  constructor(private readonly config: ApiConfig) {
    this.rootDir = path.resolve(repoRoot, config.mediaLocalDir);
  }

  async putObject(input: {
    objectKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredMediaObject> {
    const safeObjectKey = trimSlashes(input.objectKey);
    const target = path.resolve(this.rootDir, safeObjectKey);

    if (!target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new Error("Media object key escapes local media directory.");
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.body);

    const { width, height } = await imageDimensions(input.body);

    return {
      storageProvider: "local",
      bucket: null,
      objectKey: safeObjectKey,
      publicUrl: joinUrl(this.config.mediaPublicBaseUrl, safeObjectKey),
      contentType: input.contentType,
      byteSize: input.body.byteLength,
      width,
      height,
      sha256: createHash("sha256").update(input.body).digest("hex")
    };
  }
}

class S3MediaStorage implements MediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly storageProvider: MediaStorageProvider;

  constructor(private readonly config: ApiConfig) {
    if (
      !config.spacesEndpoint ||
      !config.spacesRegion ||
      !config.spacesBucket ||
      !config.spacesAccessKeyId ||
      !config.spacesSecretAccessKey
    ) {
      throw new Error(
        "Spaces storage requires SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_ACCESS_KEY_ID, and SPACES_SECRET_ACCESS_KEY."
      );
    }

    this.bucket = config.spacesBucket;
    this.storageProvider =
      config.mediaStorageDriver === "spaces" ? "digitalocean_spaces" : "s3";
    this.client = new S3Client({
      endpoint: config.spacesEndpoint,
      forcePathStyle: false,
      region: config.spacesRegion,
      credentials: {
        accessKeyId: config.spacesAccessKeyId,
        secretAccessKey: config.spacesSecretAccessKey
      }
    });
  }

  async putObject(input: {
    objectKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<StoredMediaObject> {
    const objectKey = trimSlashes(input.objectKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: "public, max-age=31536000, immutable",
        ACL: "public-read"
      })
    );

    const { width, height } = await imageDimensions(input.body);

    return {
      storageProvider: this.storageProvider,
      bucket: this.bucket,
      objectKey,
      publicUrl: joinUrl(this.config.mediaPublicBaseUrl, objectKey),
      contentType: input.contentType,
      byteSize: input.body.byteLength,
      width,
      height,
      sha256: createHash("sha256").update(input.body).digest("hex")
    };
  }
}
