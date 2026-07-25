#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const envText = fs.readFileSync(filePath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    process.env[match[1]] ??= match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "apps/api/.env.local"));
loadEnvFile(path.join(repoRoot, "infra/production.env"));

const region = process.env.SPACES_REGION ?? "sgp1";
const endpoint =
  process.env.SPACES_ENDPOINT ?? `https://${region}.digitaloceanspaces.com`;
const bucket = process.env.SPACES_BUCKET ?? "ai-taverns-media";
const accessKeyId = process.env.SPACES_ACCESS_KEY_ID;
const secretAccessKey = process.env.SPACES_SECRET_ACCESS_KEY;
const publicBaseUrl =
  process.env.MEDIA_PUBLIC_BASE_URL ??
  `https://${bucket}.${region}.digitaloceanspaces.com`;

if (!accessKeyId || !secretAccessKey) {
  console.error(
    "SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY are required. DigitalOcean account API tokens are not S3-compatible Spaces keys."
  );
  process.exit(1);
}

const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: false,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Space exists: ${bucket}`);
    return;
  } catch (error) {
    const statusCode = error?.$metadata?.httpStatusCode;
    if (statusCode && statusCode !== 404 && statusCode !== 403) {
      throw error;
    }
  }

  await s3.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ACL: "public-read"
    })
  );
  console.log(`Created Space: ${bucket}`);
}

await ensureBucket();

await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "HEAD"],
          AllowedOrigins: ["*"],
          MaxAgeSeconds: 86400
        }
      ]
    }
  })
);

const probeKey = "health/media-storage-probe.txt";
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: probeKey,
    Body: `AI Taverns media storage probe ${new Date().toISOString()}\n`,
    ContentType: "text/plain; charset=utf-8",
    CacheControl: "no-store",
    ACL: "public-read"
  })
);

console.log(`Wrote probe object: ${publicBaseUrl.replace(/\/+$/, "")}/${probeKey}`);
