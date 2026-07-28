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

type OpenAiImageResponse = {
  data?: {
    b64_json?: string;
    url?: string;
  }[];
  usage?: unknown;
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

type CharacterPortraitImageModel = "qwen" | "openai";
const supportedCharacterPortraitImageModels = ["qwen", "openai"] as const;

type GeneratedPortraitImage = {
  buffer: Buffer;
  contentType: string;
  requestId: string | null;
  usage: unknown;
  sourceImageUrl: string | null;
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
  imageModel?: CharacterPortraitImageModel | undefined;
  fetchImpl?: typeof fetch;
  storage?: MediaStorage;
  onPending?: (() => void | Promise<void>) | undefined;
};

type PreviewCharacterPortraitInput = {
  characterName?: string | undefined;
  playerName?: string | undefined;
  characterSheet?: string | undefined;
  campaignGenre?: string | undefined;
  customWorldName?: string | undefined;
  guidelines?: string | undefined;
  artStyle?: string | undefined;
  imageModel?: CharacterPortraitImageModel | undefined;
  fetchImpl?: typeof fetch;
};

const defaultQwenImageEndpoint =
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const defaultQwenImageModel = "qwen-image-2.0-pro";
const defaultOpenAiImageEndpoint =
  "https://api.openai.com/v1/images/generations";
const defaultOpenAiImageModel = "gpt-image-2";
const openAiCharacterPortraitSize = "1024x1024";
const openAiCharacterPortraitQuality = "medium";
const openAiCharacterPortraitOutputFormat = "jpeg";
const openAiCharacterPortraitOutputCompression = 88;
const qwenCharacterPortraitSize = "1024*1024";
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

function openAiImageSettings() {
  return {
    apiKey: envValue("OPENAI_API_KEY"),
    endpoint: (
      envValue("OPENAI_IMAGE_ENDPOINT") || defaultOpenAiImageEndpoint
    ).replace(/\/+$/, ""),
    model: envValue("OPENAI_IMAGE_MODEL") || defaultOpenAiImageModel
  };
}

function imageProviderForModel(
  imageModel: CharacterPortraitImageModel | undefined
) {
  return imageModel ?? "qwen";
}

function isSupportedCharacterPortraitImageModel(
  imageModel: unknown
): imageModel is CharacterPortraitImageModel {
  return supportedCharacterPortraitImageModels.includes(
    imageModel as CharacterPortraitImageModel
  );
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
    `Create fantasy character key art for ${characterName}.`,
    `Campaign world or genre: ${world}.`,
    "Use the character sheet details below for class, species, gear, mood, age, gender presentation, alignment, and magical flavor.",
    "",
    characterSheet,
    "",
    artStyleDirection(input.artStyle),
    guidelines ? `User art guidelines: ${guidelines}` : "",
    "Composition: square 1024 by 1024 cinematic environmental character portrait, medium-distance framing. Show the character from head to at least mid-thigh or knees with full torso, hands, belt, cloak, and main props visible. Do not make a tight bust, headshot, chest-up crop, or flat studio portrait. Place the character slightly off center with generous readable background around them: a real fantasy adventure location with depth, weather, architecture, lanterns, banners, roads, ruins, or distant landmarks. Keep the head safely away from the top edge and leave room around the full silhouette. No frame, no UI, no text, no logo, no watermark."
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
        size: qwenCharacterPortraitSize,
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

async function fetchOpenAiImage(input: {
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
      prompt: `${input.prompt}\n\nAvoid: ${input.negativePrompt}.`,
      n: 1,
      size: openAiCharacterPortraitSize,
      quality: openAiCharacterPortraitQuality,
      output_format: openAiCharacterPortraitOutputFormat,
      output_compression: openAiCharacterPortraitOutputCompression
    })
  });
  const body = (await response.json()) as OpenAiImageResponse;
  const requestId = response.headers.get("x-request-id");

  if (!response.ok || body.error) {
    const errorCode = body.error?.code ? ` (${body.error.code})` : "";
    const requestSuffix = requestId ? ` Request ID: ${requestId}.` : "";
    const providerMessage = body.error?.message?.replace(/\.+$/, "");

    throw new Error(
      providerMessage
        ? `OpenAI image generation failed${errorCode}: ${providerMessage}.${requestSuffix}`
        : `OpenAI image generation failed with ${response.status}.${requestSuffix}`
    );
  }

  const imageBase64 = body.data?.[0]?.b64_json;
  const imageUrl = body.data?.[0]?.url;

  if (imageBase64) {
    return {
      buffer: Buffer.from(imageBase64, "base64"),
      contentType: `image/${openAiCharacterPortraitOutputFormat}`,
      requestId,
      usage: body.usage
    };
  }

  if (imageUrl) {
    const downloaded = await downloadImage(input.fetchImpl, imageUrl);

    return {
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      requestId,
      usage: body.usage
    };
  }

  throw new Error(
    `OpenAI image generation returned no image data.${
      requestId ? ` Request ID: ${requestId}.` : ""
    }`
  );
}

async function generatePortraitSourceImage(input: {
  provider: CharacterPortraitImageModel;
  fetchImpl: typeof fetch;
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
  negativePrompt: string;
}): Promise<GeneratedPortraitImage> {
  if (input.provider === "openai") {
    const generated = await fetchOpenAiImage(input);

    return {
      ...generated,
      sourceImageUrl: null
    };
  }

  const generated = await fetchQwenImage(input);
  const downloaded = await downloadImage(input.fetchImpl, generated.imageUrl);

  return {
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    requestId: generated.requestId,
    usage: generated.usage,
    sourceImageUrl: generated.imageUrl
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
  if (
    input.imageModel &&
    !isSupportedCharacterPortraitImageModel(input.imageModel)
  ) {
    return {
      status: "skipped",
      reason: "That character portrait model is not supported yet."
    };
  }

  const provider = imageProviderForModel(input.imageModel);
  const settings =
    provider === "openai" ? openAiImageSettings() : qwenImageSettings();

  if (!settings.apiKey) {
    return {
      status: "skipped",
      reason:
        provider === "openai"
          ? "OpenAI image generation is not configured."
          : "Qwen image generation is not configured."
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
    provider,
    model: settings.model
  });

  await input.onPending?.();

  try {
    const generated = await generatePortraitSourceImage({
      provider,
      fetchImpl,
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.model,
      prompt,
      negativePrompt
    });
    const { displayObject, storedObjects } = await storePortraitSource({
      source: generated.buffer,
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
        sourceImageUrl: generated.sourceImageUrl,
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
  if (
    input.imageModel &&
    !isSupportedCharacterPortraitImageModel(input.imageModel)
  ) {
    return {
      status: "skipped",
      reason: "That character portrait model is not supported yet."
    };
  }

  const provider = imageProviderForModel(input.imageModel);
  const settings =
    provider === "openai" ? openAiImageSettings() : qwenImageSettings();

  if (!settings.apiKey) {
    return {
      status: "skipped",
      reason:
        provider === "openai"
          ? "OpenAI image generation is not configured."
          : "Qwen image generation is not configured."
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
    const generated = await generatePortraitSourceImage({
      provider,
      fetchImpl,
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.model,
      prompt,
      negativePrompt
    });
    return {
      status: "ready",
      imageDataUrl: `data:${generated.contentType};base64,${generated.buffer.toString(
        "base64"
      )}`,
      contentType: generated.contentType
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
