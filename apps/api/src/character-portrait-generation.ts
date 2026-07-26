import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  createPendingCharacterPortraitAsset,
  getCharacterPortraitTargetForUser,
  markCharacterPortraitAssetFailed,
  markCharacterPortraitAssetReady,
  type StoredMediaAssetObject
} from "@ai-dnd/db";
import type pg from "pg";
import type { ApiConfig } from "./config.js";
import {
  createCharacterPortraitVariants,
  createMediaStorage,
  type MediaStorage
} from "./media-storage.js";

type QwenImageContent = {
  image?: string;
  text?: string;
};

type QwenImageResponse = {
  request_id?: string;
  output?: {
    choices?: {
      message?: {
        content?: QwenImageContent[];
      };
    }[];
  };
  usage?: unknown;
  code?: string;
  message?: string;
};

type CharacterPortraitGenerationResult =
  | {
      status: "ready";
      assetId: string;
      portraitUrl: string;
    }
  | {
      status: "skipped" | "failed";
      reason: string;
    };

type GenerateCharacterPortraitInput = {
  db: pg.Pool;
  config: ApiConfig;
  campaignId: string;
  userId: string;
  guidelines?: string | undefined;
  artStyle?: string | undefined;
  imageModel?: "qwen" | undefined;
  fetchImpl?: typeof fetch;
  storage?: MediaStorage;
};

type PreviewCharacterPortraitInput = {
  characterName?: string | undefined;
  playerName?: string | undefined;
  characterSheet?: string | undefined;
  campaignGenre?: string | undefined;
  customWorldName?: string | undefined;
  guidelines?: string | undefined;
  artStyle?: string | undefined;
  imageModel?: "qwen" | undefined;
  fetchImpl?: typeof fetch;
};

const defaultQwenImageEndpoint =
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const defaultQwenImageModel = "qwen-image-2.0-pro";
let localEnvCache: Record<string, string> | undefined;
let localEnvCacheCwd: string | undefined;

function parseLocalEnvFile(text: string) {
  const values: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    values[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

function loadLocalEnvCache() {
  const cwd = process.cwd();

  if (localEnvCache && localEnvCacheCwd === cwd) {
    return localEnvCache;
  }

  const repoRootFromApiWorkspace = join(cwd, "..", "..");
  const envPaths = Array.from(
    new Set([
      join(repoRootFromApiWorkspace, ".env.local"),
      join(repoRootFromApiWorkspace, "apps", "web", ".env.local"),
      join(repoRootFromApiWorkspace, "apps", "api", ".env.local"),
      join(cwd, ".env.local"),
      join(cwd, "apps", "web", ".env.local"),
      join(cwd, "apps", "api", ".env.local"),
      join(cwd, "..", "web", ".env.local")
    ])
  );
  localEnvCache = {};
  localEnvCacheCwd = cwd;

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    localEnvCache = {
      ...localEnvCache,
      ...parseLocalEnvFile(readFileSync(envPath, "utf8"))
    };
  }

  return localEnvCache;
}

function envValue(name: string) {
  return process.env[name] || loadLocalEnvCache()[name] || "";
}

function qwenImageEndpointFromBaseUrl(baseUrl: string) {
  if (!baseUrl.trim()) {
    return "";
  }

  try {
    const parsed = new URL(baseUrl);

    if (!/dashscope(?:-intl)?\.aliyuncs\.com$/i.test(parsed.hostname)) {
      return "";
    }

    return `${parsed.origin}/api/v1/services/aigc/multimodal-generation/generation`;
  } catch {
    return "";
  }
}

function qwenImageSettings() {
  return {
    apiKey:
      envValue("QWEN_IMAGE_API_KEY") ||
      envValue("DASHSCOPE_API_KEY") ||
      envValue("QWEN_API_KEY"),
    endpoint: (
      envValue("QWEN_IMAGE_ENDPOINT") ||
      qwenImageEndpointFromBaseUrl(envValue("QWEN_BASE_URL")) ||
      defaultQwenImageEndpoint
    ).replace(/\/+$/, ""),
    model: envValue("QWEN_IMAGE_MODEL") || defaultQwenImageModel
  };
}

function compactText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function artStyleDirection(artStyle: string | undefined) {
  switch (artStyle) {
    case "storybook_illustration":
      return "Art style: richly textured fantasy storybook illustration, warm shapes, clear character readability, polished but hand-made.";
    case "ink_and_watercolor":
      return "Art style: expressive ink lines with layered watercolor washes, elegant paper texture, strong facial silhouette.";
    case "cinematic_concept_art":
      return "Art style: cinematic fantasy concept art, dramatic lighting, grounded materials, production-ready character key art.";
    case "painterly_fantasy":
    default:
      return "Art style: premium painterly tabletop RPG fantasy realism with refined brushwork and dramatic tavern-and-adventure lighting.";
  }
}

function characterPortraitPrompt(input: {
  characterName: string;
  username: string;
  characterSheet: string;
  campaignGenre: string | null;
  customWorldName: string | null;
  guidelines?: string | undefined;
  artStyle?: string | undefined;
}) {
  const characterName =
    input.characterName.trim() || input.username.trim() || "Adventurer";
  const world = input.customWorldName?.trim() || input.campaignGenre || "fantasy";
  const characterSheet = compactText(input.characterSheet, 2200);
  const guidelines = compactText(input.guidelines ?? "", 900);

  return [
    `Create a square fantasy character portrait for ${characterName}.`,
    `Campaign world or genre: ${world}.`,
    "Use the character sheet details below for class, species, gear, mood, age, gender presentation, alignment, and magical flavor.",
    "",
    characterSheet,
    "",
    artStyleDirection(input.artStyle),
    guidelines ? `User art guidelines: ${guidelines}` : "",
    "Composition: waist-up heroic portrait, expressive face, readable silhouette, detailed clothing and equipment, subtle background atmosphere, no frame, no UI, no text, no logo, no watermark."
  ].join("\n");
}

function characterPortraitNegativePrompt() {
  return [
    "text",
    "logo",
    "watermark",
    "caption",
    "extra limbs",
    "extra fingers",
    "malformed hands",
    "distorted face",
    "duplicate character",
    "blurry",
    "low quality",
    "cropped head",
    "modern clothing",
    "photorealistic selfie"
  ].join(", ");
}

async function fetchQwenImage(input: {
  fetchImpl: typeof fetch;
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
  negativePrompt: string;
}) {
  const response = await input.fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                text: input.prompt
              }
            ]
          }
        ]
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        n: 1,
        size: "1024*1024",
        negative_prompt: input.negativePrompt
      }
    })
  });
  const body = (await response.json()) as QwenImageResponse;

  if (!response.ok || body.code) {
    throw new Error(
      body.message || `Qwen image generation failed with ${response.status}.`
    );
  }

  const imageUrl = body.output?.choices?.[0]?.message?.content?.find(
    (content) => typeof content.image === "string" && content.image
  )?.image;

  if (!imageUrl) {
    throw new Error("Qwen image generation returned no image URL.");
  }

  return {
    imageUrl,
    requestId: body.request_id ?? null,
    usage: body.usage
  };
}

async function downloadImage(fetchImpl: typeof fetch, imageUrl: string) {
  const response = await fetchImpl(imageUrl);

  if (!response.ok) {
    throw new Error(`Generated image download failed with ${response.status}.`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png"
  };
}

function portraitObjectKey(input: {
  campaignId: string;
  playerId: string;
  assetId: string;
  variant: string;
}) {
  return [
    "campaigns",
    input.campaignId,
    "players",
    input.playerId,
    "portraits",
    input.assetId,
    input.variant
  ].join("/");
}

function configuredStorageProvider(config: ApiConfig) {
  return config.mediaStorageDriver === "spaces"
    ? "digitalocean_spaces"
    : config.mediaStorageDriver;
}

async function storePortraitSource(input: {
  source: Buffer;
  storage: MediaStorage;
  campaignId: string;
  playerId: string;
  assetId: string;
}) {
  const originalPng = await sharp(input.source).png().toBuffer();
  const variants = await createCharacterPortraitVariants(input.source);
  const storedObjects: StoredMediaAssetObject[] = [];

  storedObjects.push(
    await input.storage.putObject({
      objectKey: portraitObjectKey({
        campaignId: input.campaignId,
        playerId: input.playerId,
        assetId: input.assetId,
        variant: "original.png"
      }),
      body: originalPng,
      contentType: "image/png"
    })
  );

  for (const variant of variants) {
    storedObjects.push(
      await input.storage.putObject({
        objectKey: portraitObjectKey({
          campaignId: input.campaignId,
          playerId: input.playerId,
          assetId: input.assetId,
          variant: `${variant.name}.webp`
        }),
        body: variant.buffer,
        contentType: variant.contentType
      })
    );
  }

  const displayObject =
    storedObjects.find((object) => object.objectKey.endsWith("/512.webp")) ??
    storedObjects.at(-1);

  if (!displayObject) {
    throw new Error("No portrait objects were stored.");
  }

  return { displayObject, storedObjects };
}

export async function generateCharacterPortraitForCampaign(
  input: GenerateCharacterPortraitInput
): Promise<CharacterPortraitGenerationResult> {
  if (input.imageModel && input.imageModel !== "qwen") {
    return {
      status: "skipped",
      reason: "That character portrait model is not supported yet."
    };
  }

  const settings = qwenImageSettings();

  if (!settings.apiKey) {
    return {
      status: "skipped",
      reason: "Qwen image generation is not configured."
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const storage = input.storage ?? createMediaStorage(input.config);
  const target = await getCharacterPortraitTargetForUser(input.db, {
    campaignId: input.campaignId,
    userId: input.userId
  });
  const prompt = characterPortraitPrompt({
    ...target,
    guidelines: input.guidelines,
    artStyle: input.artStyle
  });
  const negativePrompt = characterPortraitNegativePrompt();
  const pendingAsset = await createPendingCharacterPortraitAsset(input.db, {
    ownerUserId: target.ownerUserId,
    campaignId: target.campaignId,
    playerId: target.playerId,
    storageProvider: configuredStorageProvider(input.config),
    prompt,
    negativePrompt,
    provider: "qwen",
    model: settings.model
  });

  try {
    const generated = await fetchQwenImage({
      fetchImpl,
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.model,
      prompt,
      negativePrompt
    });
    const source = (await downloadImage(fetchImpl, generated.imageUrl)).buffer;
    const { displayObject, storedObjects } = await storePortraitSource({
      source,
      storage,
      campaignId: target.campaignId,
      playerId: target.playerId,
      assetId: pendingAsset.id
    });

    const readyAsset = await markCharacterPortraitAssetReady(input.db, {
      assetId: pendingAsset.id,
      playerId: target.playerId,
      displayObject,
      providerRequestId: generated.requestId,
      generationMetadata: {
        sourceImageUrl: generated.imageUrl,
        usage: generated.usage ?? null,
        variants: storedObjects.map((object) => ({
          objectKey: object.objectKey,
          publicUrl: object.publicUrl,
          contentType: object.contentType,
          byteSize: object.byteSize,
          width: object.width,
          height: object.height,
          sha256: object.sha256
        }))
      }
    });

    return {
      status: "ready",
      assetId: readyAsset.id,
      portraitUrl: readyAsset.public_url ?? displayObject.publicUrl
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portrait generation failed.";

    await markCharacterPortraitAssetFailed(input.db, {
      assetId: pendingAsset.id,
      errorMessage: message,
      generationMetadata: {
        endpoint: settings.endpoint,
        model: settings.model
      }
    });

    return {
      status: "failed",
      reason: message
    };
  }
}

export async function generateCharacterPortraitPreview(
  input: PreviewCharacterPortraitInput
): Promise<
  | {
      status: "ready";
      imageDataUrl: string;
      contentType: string;
    }
  | {
      status: "skipped" | "failed";
      reason: string;
    }
> {
  if (input.imageModel && input.imageModel !== "qwen") {
    return {
      status: "skipped",
      reason: "That character portrait model is not supported yet."
    };
  }

  const settings = qwenImageSettings();

  if (!settings.apiKey) {
    return {
      status: "skipped",
      reason: "Qwen image generation is not configured."
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const prompt = characterPortraitPrompt({
    characterName: input.characterName ?? "",
    username: input.playerName ?? "",
    characterSheet: input.characterSheet ?? "",
    campaignGenre: input.campaignGenre ?? null,
    customWorldName: input.customWorldName ?? null,
    guidelines: input.guidelines,
    artStyle: input.artStyle
  });
  const negativePrompt = characterPortraitNegativePrompt();

  try {
    const generated = await fetchQwenImage({
      fetchImpl,
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.model,
      prompt,
      negativePrompt
    });
    const downloaded = await downloadImage(fetchImpl, generated.imageUrl);
    const png = await sharp(downloaded.buffer).png().toBuffer();

    return {
      status: "ready",
      imageDataUrl: `data:image/png;base64,${png.toString("base64")}`,
      contentType: "image/png"
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Portrait generation failed."
    };
  }
}

export async function storeUploadedCharacterPortraitForCampaign(input: {
  db: pg.Pool;
  config: ApiConfig;
  campaignId: string;
  userId: string;
  image: Buffer;
  fileName?: string | undefined;
  guidelines?: string | undefined;
  artStyle?: string | undefined;
  storage?: MediaStorage;
}): Promise<CharacterPortraitGenerationResult> {
  const storage = input.storage ?? createMediaStorage(input.config);
  const target = await getCharacterPortraitTargetForUser(input.db, {
    campaignId: input.campaignId,
    userId: input.userId
  });
  const prompt = [
    `Uploaded character portrait for ${target.characterName || target.username || "Adventurer"}.`,
    artStyleDirection(input.artStyle),
    compactText(input.guidelines ?? "", 900)
  ]
    .filter(Boolean)
    .join("\n");
  const pendingAsset = await createPendingCharacterPortraitAsset(input.db, {
    ownerUserId: target.ownerUserId,
    campaignId: target.campaignId,
    playerId: target.playerId,
    storageProvider: configuredStorageProvider(input.config),
    prompt,
    negativePrompt: "",
    provider: "upload",
    model: "user-upload"
  });

  try {
    const { displayObject, storedObjects } = await storePortraitSource({
      source: input.image,
      storage,
      campaignId: target.campaignId,
      playerId: target.playerId,
      assetId: pendingAsset.id
    });
    const readyAsset = await markCharacterPortraitAssetReady(input.db, {
      assetId: pendingAsset.id,
      playerId: target.playerId,
      displayObject,
      providerRequestId: null,
      generationMetadata: {
        fileName: input.fileName ?? null,
        variants: storedObjects.map((object) => ({
          objectKey: object.objectKey,
          publicUrl: object.publicUrl,
          contentType: object.contentType,
          byteSize: object.byteSize,
          width: object.width,
          height: object.height,
          sha256: object.sha256
        }))
      }
    });

    return {
      status: "ready",
      assetId: readyAsset.id,
      portraitUrl: readyAsset.public_url ?? displayObject.publicUrl
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portrait upload failed.";

    await markCharacterPortraitAssetFailed(input.db, {
      assetId: pendingAsset.id,
      errorMessage: message
    });

    return {
      status: "failed",
      reason: message
    };
  }
}
