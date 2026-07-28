import type { FastifyInstance } from "fastify";
import {
  CampaignInviteCreateParamsSchema,
  CampaignInviteCreateRequestSchema,
  CampaignInviteCreateResponseSchema,
  CampaignInviteDisableParamsSchema,
  CampaignInviteDisableResponseSchema,
  CampaignInviteListParamsSchema,
  CampaignInviteListResponseSchema,
  CampaignCreateRequestSchema,
  CampaignCreateResponseSchema,
  CharacterBackstoryGenerateRequestSchema,
  CharacterBackstoryGenerateResponseSchema,
  CampaignNpcCardUpdateParamsSchema,
  CampaignNpcCardUpdateRequestSchema,
  CampaignNpcCardUpdateResponseSchema,
  CampaignNpcCardsResponseSchema,
  CampaignJoinPreviewRequestSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinRequestSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadParamsSchema,
  CampaignReadResponseSchema,
  CharacterPortraitGenerateParamsSchema,
  CharacterPortraitGenerateRequestSchema,
  CharacterPortraitPreviewRequestSchema,
  CharacterPortraitPreviewResponseSchema,
  CharacterPortraitResponseSchema,
  CharacterPortraitUploadParamsSchema,
  CharacterPortraitUploadRequestSchema,
  LobbyInviteJoinParamsSchema,
  LobbyInviteJoinRequestSchema,
  LobbyInviteJoinResponseSchema,
  LobbyInvitePreviewParamsSchema,
  LobbyInvitePreviewResponseSchema,
  type CampaignMode
} from "@ai-dnd/contracts";
import {
  eldermereRegions,
  formatEldermereOpeningPromptContext,
  generateNamePool,
  type EldermereCampaignStart as DmEldermereCampaignStart,
  type NameGender
} from "@ai-dnd/dm";
import {
  createCampaignInvite,
  createCampaignForMode,
  disableCampaignInvite,
  type DungeonMasterRuntime,
  getCampaignSummaryForUser,
  joinCampaignByInvite,
  joinCampaignByCode,
  listPlayerSafeNpcCardsForCampaign,
  listCampaignInvitesForOwner,
  listCampaignSummariesForUser,
  updatePlayerSafeNpcCardMarkdown,
  previewLobbyInvite,
  previewCampaignJoinByCode
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import {
  generateCharacterPortraitPreview,
  generateCharacterPortraitForCampaign,
  storeUploadedCharacterPortraitForCampaign
} from "../character-portrait-generation.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type CampaignRouteOptions = {
  config: ApiConfig;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

const characterPortraitUploadBodyLimitBytes = 12 * 1024 * 1024;

const campaignGenrePresets = [
  {
    id: "eldermere",
    label: "Eldermere",
    promptBrief:
      "Run this campaign in Eldermere, AI Taverns' flagship anchored-high-fantasy world: a world built on the bones of the fallen Second Dominion, where the gods have gone quiet, Wellglass makes the strongest magic scarce and costly, and every region is deciding what the Third Age should become."
  },
  {
    id: "classic_fantasy",
    label: "Classic Fantasy",
    promptBrief:
      "Run this as a classic fantasy campaign with ancient ruins, strange magic, mythic quests, clear heroism, wondrous danger, and room for tavern-born adventure."
  },
  {
    id: "dark_fantasy",
    label: "Dark Fantasy",
    promptBrief:
      "Run this as a dark fantasy campaign with curses, hard bargains, haunted places, moral pressure, ominous magic, and danger that feels intimate rather than gratuitous."
  },
  {
    id: "high_adventure",
    label: "High Adventure",
    promptBrief:
      "Run this as a high adventure campaign with bold heroes, wild travel, ancient threats, kinetic action, colorful allies, and sweeping stakes that invite decisive choices."
  },
  {
    id: "mystery",
    label: "Mystery",
    promptBrief:
      "Run this as a fantasy mystery campaign with secrets, suspects, layered clues, social tension, hidden motives, and discoveries that reward careful attention."
  }
] as const;

function createHttpError(
  statusCode: number,
  message: string,
  options: { expose?: boolean } = {}
): Error {
  const error = new Error(message) as Error & {
    expose?: boolean;
    statusCode: number;
  };
  error.statusCode = statusCode;
  if (options.expose !== undefined) {
    error.expose = options.expose;
  }
  return error;
}

function imageBufferFromDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl.trim()
  );

  if (!match) {
    throw createHttpError(400, "Upload a valid image file.");
  }

  const contentType = match[1]?.toLowerCase();

  if (
    contentType !== "image/png" &&
    contentType !== "image/jpeg" &&
    contentType !== "image/jpg" &&
    contentType !== "image/webp"
  ) {
    throw createHttpError(400, "Upload a PNG, JPEG, or WebP image.");
  }

  const buffer = Buffer.from(match[2]?.replace(/\s+/g, "") ?? "", "base64");

  if (buffer.byteLength === 0) {
    throw createHttpError(400, "The uploaded image was empty.");
  }

  return buffer;
}

function getCampaignGenrePreset(presetId: string | undefined) {
  return campaignGenrePresets.find((preset) => preset.id === presetId);
}

type BackstoryPromptInput = {
  characterSheet: string;
  currentBackstory?: string | undefined;
  includeEldermereStart?: boolean | undefined;
  nameBank: string;
  worldContext: string;
};

const backstoryJsonInstructions = [
  "You are AI Taverns, a fantasy tabletop character backstory writer and editor.",
  "Return exactly one valid JSON object with this shape: {\"backstory\":\"...\",\"eldermereStart\":{\"regionName\":\"...\",\"settlementName\":\"...\",\"reason\":\"...\"}}.",
  "Only include eldermereStart when the prompt provides canonical Eldermere start options. Otherwise return only {\"backstory\":\"...\"}.",
  "The backstory value must be plain player-facing prose only. Do not include markdown headings, bullet points, stat blocks, hook labels, explanations, or surrounding commentary.",
  "For backstories, invented proper nouns are allowed only for people. Do not invent named non-person entities."
].join("\n");

function characterBackstoryWorldContext(input: {
  campaignGenreKind?: "preset" | "custom" | undefined;
  campaignGenrePresetId?: string | undefined;
  campaignGenre?: string | undefined;
  customWorldName?: string | undefined;
  customWorldDescription?: string | undefined;
}) {
  if (input.campaignGenreKind === "custom") {
    return [
      `World: ${input.customWorldName?.trim() || input.campaignGenre?.trim() || "Custom World"}.`,
      input.customWorldDescription?.trim() || "No custom world description was supplied."
    ].join("\n");
  }

  const preset = getCampaignGenrePreset(input.campaignGenrePresetId?.trim());

  if (preset?.id === "eldermere") {
    return formatEldermereOpeningPromptContext();
  }

  return [
    `World or genre: ${preset?.label ?? input.campaignGenre?.trim() ?? "Fantasy"}.`,
    preset?.promptBrief ??
      "Use a coherent fantasy world with concrete people, places, factions, tensions, and future story hooks."
  ].join("\n");
}

function extractExistingPromptNames(...values: Array<string | undefined>) {
  return [
    ...new Set(
      values
        .flatMap((value) =>
          value?.match(/\b[A-Z][a-z]+(?:\s+(?:of|the|and|[A-Z][a-z]+)){0,3}\b/g) ??
          []
        )
        .map((name) => name.trim())
        .filter((name) => name.length >= 3)
    )
  ];
}

function backstoryNameBank(input: {
  characterSheet: string;
  currentBackstory?: string | undefined;
  campaignGenreKind?: "preset" | "custom" | undefined;
  campaignGenrePresetId?: string | undefined;
  campaignGenre?: string | undefined;
  customWorldName?: string | undefined;
}) {
  const world = input.customWorldName?.trim() || input.campaignGenre?.trim();
  const seed = [
    "backstory",
    input.campaignGenreKind ?? "preset",
    input.campaignGenrePresetId ?? "",
    world ?? "",
    input.characterSheet,
    input.currentBackstory ?? ""
  ].join("|");
  const existingNames = extractExistingPromptNames(
    input.characterSheet,
    input.currentBackstory
  );
  const genderGroups: Array<{ gender: NameGender; label: string }> = [
    { gender: "masculine", label: "Masculine people" },
    { gender: "feminine", label: "Feminine people" },
    { gender: "neutral", label: "Neutral people" }
  ];
  const sections = genderGroups
    .map(({ gender, label }) => {
      const pool = generateNamePool({
        world,
        seed,
        target: "person",
        gender,
        count: 5,
        existingNames
      });
      const names = pool.names.map((candidate) => candidate.name);

      return names.length ? `${label}: ${names.join(", ")}` : "";
    })
    .filter(Boolean);

  return [
    "Validated people names for this backstory:",
    "Use these validated candidate names only when inventing people. Choose a name from the gender group that fits the person's stated role or gender. Do not force every name into the output. Do not use these names for families, places, factions, taverns, objects, ships, roads, organizations, or threats. Do not rename any player-authored or already established names.",
    ...sections
  ].join("\n");
}

function isEldermereBackstoryRequest(input: {
  campaignGenrePresetId?: string | undefined;
}) {
  return input.campaignGenrePresetId?.trim() === "eldermere";
}

function formatEldermereStartOptions() {
  return [
    "Canonical Eldermere start options:",
    "Choose exactly one region and one settlement from this list for eldermereStart. The settlement must belong to the chosen region.",
    ...eldermereRegions.flatMap((region) => [
      `Region: ${region.name}`,
      `Settlements: ${region.settlements.map((settlement) => settlement.name).join(", ")}`
    ])
  ].join("\n");
}

function resolveEldermereCampaignStart(input: {
  regionName?: string | undefined;
  settlementName?: string | undefined;
}): DmEldermereCampaignStart | undefined {
  const regionName = input.regionName?.trim();
  const settlementName = input.settlementName?.trim();

  if (!regionName || !settlementName) {
    return undefined;
  }

  const region = eldermereRegions.find(
    (candidate) => candidate.name === regionName
  );
  const settlement = region?.settlements.find(
    (candidate) => candidate.name === settlementName
  );

  return region && settlement ? { region, settlement } : undefined;
}

function buildGenerateBackstoryPrompt(input: BackstoryPromptInput) {
  return [
    "Write a player-facing character backstory for the character below. The backstory must feel native to the provided world context and should give the AI DM excellent hooks for the opening adventure and later campaign play.",
    "",
    "Rules:",
    "- Use the character sheet as authoritative. Do not change class, species, background, alignment, gender, level, stats, proficiencies, equipment, or spells.",
    "- Use the full world context as canon. Include concrete world details, factions, places, conflicts, beliefs, customs, threats, or tensions where they naturally fit.",
    "- Use generated names only for people. Do not use generated names for settlements, landmarks, taverns, factions, families, artifacts, ships, roads, objects, or organizations.",
    "- The only newly invented proper nouns allowed are people names. Do not invent new proper nouns for any non-person entity.",
    "- Do not give names to ships, taverns, guilds, companies, ruins, roads, artifacts, books, ledgers, weapons, or family lines. Refer to those as plain descriptions, such as 'her mother's fishing boat' or 'a ruined observatory'.",
    "- Never write phrases like 'called the [Name]' or 'named the [Name]' for a non-person entity.",
    "- Use places, factions, faiths, threats, historical events, and magic terms only when they come from the world context or the player-authored character sheet. If the world context does not supply a specific proper noun, use a plain description instead of inventing one.",
    "- Backstory override for Eldermere opener context: do not invent named starting places or named local anchors. Use only region, city-state, faction, threat, history, or magic names already present in the world context.",
    "- Keep the setting texture focused: choose one primary region or local anchor from the world context, include at most two other canonical setting proper nouns, and explain lore through personal stakes rather than listing canon.",
    "- Make the backstory unique, interesting, and specific. Avoid generic fantasy biography, vague tragedy, empty prophecy, or interchangeable \"chosen one\" framing.",
    "- Include important people from the character's past or present. These people should have names, clear relationships to the character, and reasons they matter.",
    "- When naming newly invented people, prefer the validated people names below. Use only 1-2 new named people unless the character sheet already establishes more. Do not rename the player character or any established player-written names.",
    "- Explain why those people matter not only to the player character, but also to the living world: what they know, control, protect, threaten, need, believe, owe, hide, or could change.",
    "- Make these people useful for the AI DM to bring back later as allies, rivals, patrons, family, witnesses, enemies, missing persons, debt-holders, mentors, or complications.",
    "- Do not reveal secret DM-only information unless the world context explicitly says it is player-safe.",
    "- Keep the character as someone with unresolved motivation, not someone whose story is already complete.",
    "- Include 2-4 usable story hooks: a personal want, a complication, a connection to the world, and something the DM can bring into play later.",
    "- Weave hooks into the prose. Do not add a 'Hooks:' label or any other labeled section.",
    "- Before returning JSON, silently remove any invented non-person proper noun and replace it with a plain description.",
    ...(input.includeEldermereStart
      ? [
          "- Also choose the best Eldermere campaign starting region and settlement for this character. Return them in eldermereStart.regionName and eldermereStart.settlementName using exact names from the canonical start options below.",
          "- Choose the starting settlement that best turns the backstory's unresolved trouble into the opening scene. The backstory itself may mention a broader region or city-state without starting there."
        ]
      : []),
    "- Do not write in second person.",
    "",
    "Length: 250-450 words.",
    "Tone: evocative, grounded, playable, mysterious but not melodramatic.",
    "",
    "Character sheet:",
    input.characterSheet,
    "",
    input.nameBank,
    "",
    ...(input.includeEldermereStart
      ? [formatEldermereStartOptions(), ""]
      : []),
    "World context:",
    input.worldContext
  ].join("\n");
}

function buildAddBackstoryDetailsPrompt(input: BackstoryPromptInput) {
  return [
    "Expand and enrich the player-written backstory below. Preserve the player's core ideas, events, relationships, tone, and intent. Your job is to add vivid, useful detail that makes the backstory feel specific to the provided world context and gives the AI DM excellent material to bring into the story later.",
    "",
    "Rules:",
    "- Treat the existing backstory as authoritative. Do not remove, contradict, rename, or overwrite any player-authored details.",
    "- Use the character sheet as authoritative. Do not change class, species, background, alignment, gender, level, stats, proficiencies, equipment, or spells.",
    "- Use the full world context as canon. Add concrete world details, factions, places, conflicts, beliefs, customs, threats, or tensions where they naturally fit.",
    "- Use generated names only for people. Do not use generated names for settlements, landmarks, taverns, factions, families, artifacts, ships, roads, objects, or organizations.",
    "- The only newly invented proper nouns allowed are people names. Do not invent new proper nouns for any non-person entity.",
    "- Do not give names to ships, taverns, guilds, companies, ruins, roads, artifacts, books, ledgers, weapons, or family lines unless the player already named them. Refer to those as plain descriptions, such as 'her mother's fishing boat' or 'a ruined observatory'.",
    "- Never write phrases like 'called the [Name]' or 'named the [Name]' for a non-person entity unless the player already named it.",
    "- Use places, factions, faiths, threats, historical events, and magic terms only when they come from the world context, the player-written backstory, or the character sheet. If the world context does not supply a specific proper noun, use a plain description instead of inventing one.",
    "- Backstory override for Eldermere opener context: do not invent named starting places or named local anchors. Use only region, city-state, faction, threat, history, or magic names already present in the world context.",
    "- Keep the setting texture focused: choose one primary region or local anchor from the world context, include at most two other canonical setting proper nouns, and explain lore through personal stakes rather than listing canon.",
    "- Make the enriched backstory unique, interesting, and specific. Avoid generic fantasy biography, vague tragedy, empty prophecy, or interchangeable \"chosen one\" framing.",
    "- Add or deepen important people from the character's past or present. These people should have names, clear relationships to the character, and reasons they matter.",
    "- When naming newly invented people, prefer the validated people names below. Use only 1-2 new named people unless the player-written backstory already establishes more. Do not rename the player character or any established player-written names.",
    "- Explain why those people matter not only to the player character, but also to the living world: what they know, control, protect, threaten, need, believe, owe, hide, or could change.",
    "- Make these people useful for the AI DM to bring back later as allies, rivals, patrons, family, witnesses, enemies, missing persons, debt-holders, mentors, or complications.",
    "- Keep the character as someone with unresolved motivation, not someone whose story is already complete.",
    "- Include 2-4 usable story hooks: a personal want, a complication, a connection to the world, and something the DM can bring into play later.",
    "- Weave hooks into the prose. Do not add a 'Hooks:' label or any other labeled section.",
    "- Before returning JSON, silently remove any invented non-person proper noun and replace it with a plain description.",
    "- Do not reveal secret DM-only information unless the world context explicitly says it is player-safe.",
    ...(input.includeEldermereStart
      ? [
          "- Also choose the best Eldermere campaign starting region and settlement for this character. Return them in eldermereStart.regionName and eldermereStart.settlementName using exact names from the canonical start options below.",
          "- Choose the starting settlement that best turns the enriched backstory's unresolved trouble into the opening scene. The backstory itself may mention a broader region or city-state without starting there."
        ]
      : []),
    "- Do not write in second person.",
    "",
    "Length: 300-550 words.",
    "Tone: evocative, grounded, playable, mysterious but not melodramatic.",
    "",
    "Character sheet:",
    input.characterSheet,
    "",
    "Player-written backstory:",
    input.currentBackstory ?? "",
    "",
    input.nameBank,
    "",
    ...(input.includeEldermereStart
      ? [formatEldermereStartOptions(), ""]
      : []),
    "World context:",
    input.worldContext
  ].join("\n");
}

function parseBackstoryProviderResponse(content: string) {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const jsonText = fenced?.[1] ?? trimmed;

  try {
    const parsed = JSON.parse(jsonText) as {
      backstory?: unknown;
      eldermereStart?: unknown;
    };
    const backstory =
      typeof parsed.backstory === "string" ? parsed.backstory.trim() : "";
    const rawStart =
      parsed.eldermereStart &&
      typeof parsed.eldermereStart === "object" &&
      !Array.isArray(parsed.eldermereStart)
        ? (parsed.eldermereStart as Record<string, unknown>)
        : undefined;
    const eldermereStart = rawStart
      ? {
          regionName:
            typeof rawStart.regionName === "string"
              ? rawStart.regionName.trim()
              : "",
          settlementName:
            typeof rawStart.settlementName === "string"
              ? rawStart.settlementName.trim()
              : "",
          reason:
            typeof rawStart.reason === "string"
              ? rawStart.reason.trim()
              : undefined
        }
      : undefined;

    if (backstory) {
      return {
        backstory,
        ...(eldermereStart?.regionName && eldermereStart.settlementName
          ? { eldermereStart }
          : {})
      };
    }
  } catch {
    // Some providers may still return plain prose. Fall through and use it.
  }

  if (!trimmed) {
    throw createHttpError(502, "AI Taverns returned an empty backstory.");
  }

  return { backstory: trimmed };
}

export async function registerCampaignRoutes(
  fastify: FastifyInstance,
  options: CampaignRouteOptions
) {
  const { config } = options;
  const runtime = options.dmRuntime ?? {
    askProvider: askDungeonMasterProvider
  };

  fastify.get("/campaigns", async (request) => {
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const response = {
      campaigns: await listCampaignSummariesForUser(fastify.pg, user.id)
    };

    return CampaignListResponseSchema.parse(response);
  });

  fastify.post("/campaigns/backstory", async (request) => {
    const body = CharacterBackstoryGenerateRequestSchema.parse(request.body);
    const characterSheet = body.characterSheet.trim();
    const currentBackstory = body.currentBackstory?.trim();

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    if (body.mode === "add_details" && !currentBackstory) {
      throw createHttpError(400, "Write a backstory before adding details.");
    }

    const worldContext = characterBackstoryWorldContext({
      campaignGenreKind: body.campaignGenreKind,
      campaignGenrePresetId: body.campaignGenrePresetId,
      campaignGenre: body.campaignGenre,
      customWorldName: body.customWorldName,
      customWorldDescription: body.customWorldDescription
    });
    const nameBank = backstoryNameBank({
      characterSheet,
      currentBackstory,
      campaignGenreKind: body.campaignGenreKind,
      campaignGenrePresetId: body.campaignGenrePresetId,
      campaignGenre: body.campaignGenre,
      customWorldName: body.customWorldName
    });
    const includeEldermereStart = isEldermereBackstoryRequest({
      campaignGenrePresetId: body.campaignGenrePresetId
    });
    const message =
      body.mode === "generate"
        ? buildGenerateBackstoryPrompt({
            characterSheet,
            includeEldermereStart,
            nameBank,
            worldContext
          })
        : buildAddBackstoryDetailsPrompt({
            characterSheet,
            currentBackstory,
            includeEldermereStart,
            nameBank,
            worldContext
          });
    const providerResponse = await runtime.askProvider({
      instructions: backstoryJsonInstructions,
      message
    });
    const generated = parseBackstoryProviderResponse(providerResponse.content);
    const validatedStart =
      includeEldermereStart && generated.eldermereStart
        ? resolveEldermereCampaignStart(generated.eldermereStart)
        : undefined;

    return CharacterBackstoryGenerateResponseSchema.parse({
      backstory: generated.backstory,
      ...(validatedStart
        ? {
            eldermereStart: {
              regionName: validatedStart.region.name,
              settlementName: validatedStart.settlement.name,
              ...(generated.eldermereStart?.reason
                ? { reason: generated.eldermereStart.reason }
                : {})
            }
          }
        : {})
    });
  });

  fastify.post("/campaigns", async (request, reply) => {
    const body = CampaignCreateRequestSchema.parse(request.body);
    const mode: CampaignMode =
      body.mode === "single_player" ? "single_player" : "multiplayer";
    const campaignGenreKind =
      body.campaignGenreKind === "custom" ? "custom" : "preset";
    const customWorldName = body.customWorldName?.trim();
    const campaignGenrePresetId = body.campaignGenrePresetId?.trim();
    const campaignGenrePreset = getCampaignGenrePreset(campaignGenrePresetId);
    const campaignGenre =
      campaignGenreKind === "custom"
        ? body.campaignGenre?.trim() || "Custom World"
        : campaignGenrePreset?.label;
    const campaignGenrePromptBrief =
      campaignGenreKind === "custom"
        ? body.customWorldDescription?.trim()
        : campaignGenrePreset?.promptBrief;
    const customWorldDescription = body.customWorldDescription?.trim();
    const title =
      body.title?.trim() ||
      (campaignGenreKind === "custom"
        ? customWorldName
        : campaignGenre
          ? `${campaignGenre} Adventure`
          : undefined);
    const playerName =
      body.playerName?.trim() ||
      body.characterName?.trim() ||
      (mode === "single_player" ? "Solo Player" : "Table Owner");

    if (!title || !campaignGenre || !campaignGenrePromptBrief) {
      throw createHttpError(400, "A campaign genre is required.");
    }

    if (
      campaignGenreKind === "custom" &&
      (!customWorldName || !customWorldDescription)
    ) {
      throw createHttpError(
        400,
        "A custom world name and description are required."
      );
    }

    if (mode === "single_player" && !body.characterName?.trim()) {
      throw createHttpError(
        400,
        "A character name is required for singleplayer."
      );
    }

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await createCampaignForMode(fastify.pg, {
      mode,
      title,
      campaignGenre,
      campaignGenreKind,
      campaignGenrePresetId,
      campaignGenrePromptBrief,
      customWorldName,
      customWorldDescription,
      ownerClientId: body.ownerClientId?.trim(),
      playerName,
      characterName: body.characterName?.trim(),
      characterSheet: body.characterSheet?.trim(),
      mechanicsSeed: body.mechanicsSeed,
      eldermereStart: resolveEldermereCampaignStart({
        regionName: body.eldermereStart?.regionName,
        settlementName: body.eldermereStart?.settlementName
      }),
      userId: user.id,
      runtime
    });
    const portrait =
      body.generateCharacterPortrait === true
        ? await generateCharacterPortraitForCampaign({
            db: fastify.pg,
            config,
            campaignId: campaign.id,
            userId: user.id
          })
        : undefined;

    if (portrait && portrait.status !== "ready") {
      fastify.log.warn(
        {
          campaignId: campaign.id,
          userId: user.id,
          portraitStatus: portrait.status,
          reason: portrait.reason
        },
        "Character portrait generation did not complete."
      );
    }

    const responseCampaign =
      portrait?.status === "ready"
        ? {
            ...campaign,
            portraitAssetId: portrait.assetId,
            portraitUrl: portrait.portraitUrl
          }
        : campaign;

    reply.status(201);
    return CampaignCreateResponseSchema.parse({ campaign: responseCampaign });
  });

  fastify.post("/campaigns/portrait/preview", async (request) => {
    const body = CharacterPortraitPreviewRequestSchema.parse(request.body);

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const portrait = await generateCharacterPortraitPreview({
      characterName: body.characterName,
      playerName: body.playerName,
      characterSheet: body.characterSheet,
      campaignGenre: body.campaignGenre,
      customWorldName: body.customWorldName,
      guidelines: body.guidelines,
      artStyle: body.artStyle,
      imageModel: body.imageModel
    });

    if (portrait.status !== "ready") {
      throw createHttpError(502, portrait.reason, { expose: true });
    }

    return CharacterPortraitPreviewResponseSchema.parse({
      imageDataUrl: portrait.imageDataUrl,
      contentType: portrait.contentType
    });
  });

  fastify.get("/campaigns/:campaignId", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    return CampaignReadResponseSchema.parse({ campaign });
  });

  fastify.post("/campaigns/:campaignId/portrait/generate", async (request) => {
    const params = CharacterPortraitGenerateParamsSchema.parse(request.params);
    const body = CharacterPortraitGenerateRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    const portrait = await generateCharacterPortraitForCampaign({
      db: fastify.pg,
      config,
      campaignId: params.campaignId,
      userId: user.id,
      guidelines: body.guidelines,
      artStyle: body.artStyle,
      imageModel: body.imageModel
    });

    if (portrait.status !== "ready") {
      throw createHttpError(502, portrait.reason, { expose: true });
    }

    const campaign = await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    return CharacterPortraitResponseSchema.parse({
      campaign: {
        ...campaign,
        portraitAssetId: portrait.assetId,
        portraitUrl: portrait.portraitUrl
      }
    });
  });

  fastify.post(
    "/campaigns/:campaignId/portrait/upload",
    { bodyLimit: characterPortraitUploadBodyLimitBytes },
    async (request) => {
      const params = CharacterPortraitUploadParamsSchema.parse(request.params);
      const body = CharacterPortraitUploadRequestSchema.parse(request.body);
      const user = await requireAuthenticatedUser(
        fastify,
        config,
        request.cookies[config.authCookieName]
      );

      await getCampaignSummaryForUser(fastify.pg, {
        campaignId: params.campaignId,
        userId: user.id
      });

      const portrait = await storeUploadedCharacterPortraitForCampaign({
        db: fastify.pg,
        config,
        campaignId: params.campaignId,
        userId: user.id,
        image: imageBufferFromDataUrl(body.imageDataUrl),
        fileName: body.fileName,
        guidelines: body.guidelines,
        artStyle: body.artStyle
      });

      if (portrait.status !== "ready") {
        throw createHttpError(400, portrait.reason);
      }

      const campaign = await getCampaignSummaryForUser(fastify.pg, {
        campaignId: params.campaignId,
        userId: user.id
      });

      return CharacterPortraitResponseSchema.parse({
        campaign: {
          ...campaign,
          portraitAssetId: portrait.assetId,
          portraitUrl: portrait.portraitUrl
        }
      });
    }
  );

  fastify.get("/campaigns/:campaignId/npc-cards", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    const npcCards = await listPlayerSafeNpcCardsForCampaign(
      fastify.pg,
      params.campaignId
    );

    return CampaignNpcCardsResponseSchema.parse({ npcCards });
  });

  fastify.patch("/campaigns/:campaignId/npc-cards/:npcCardId", async (request) => {
    const params = CampaignNpcCardUpdateParamsSchema.parse(request.params);
    const body = CampaignNpcCardUpdateRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    const npcCard = await updatePlayerSafeNpcCardMarkdown(fastify.pg, {
      campaignId: params.campaignId,
      npcCardId: params.npcCardId,
      markdown: body.markdown
    });

    return CampaignNpcCardUpdateResponseSchema.parse({ npcCard });
  });

  fastify.get("/campaigns/:campaignId/invites", async (request) => {
    const params = CampaignInviteListParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const invites = await listCampaignInvitesForOwner(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    return CampaignInviteListResponseSchema.parse({ invites });
  });

  fastify.post("/campaigns/:campaignId/invites", async (request, reply) => {
    const params = CampaignInviteCreateParamsSchema.parse(request.params);
    const body = CampaignInviteCreateRequestSchema.parse(request.body ?? {});
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const response = await createCampaignInvite(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt
    });

    reply.status(201);
    return CampaignInviteCreateResponseSchema.parse(response);
  });

  fastify.post(
    "/campaigns/:campaignId/invites/:inviteId/disable",
    async (request) => {
      const params = CampaignInviteDisableParamsSchema.parse(request.params);
      const user = await requireAuthenticatedUser(
        fastify,
        config,
        request.cookies[config.authCookieName]
      );
      const invite = await disableCampaignInvite(fastify.pg, {
        campaignId: params.campaignId,
        inviteId: params.inviteId,
        userId: user.id
      });

      return CampaignInviteDisableResponseSchema.parse({ invite });
    }
  );

  fastify.get("/invites/:token/preview", async (request) => {
    const params = LobbyInvitePreviewParamsSchema.parse(request.params);

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return LobbyInvitePreviewResponseSchema.parse(
      await previewLobbyInvite(fastify.pg, params.token)
    );
  });

  fastify.post("/invites/:token/join", async (request) => {
    const params = LobbyInviteJoinParamsSchema.parse(request.params);
    const body = LobbyInviteJoinRequestSchema.parse(request.body ?? {});
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await joinCampaignByInvite(fastify.pg, {
      token: params.token,
      clientId: body.clientId ?? "",
      username: body.username ?? "",
      characterName: body.characterName ?? "",
      characterSheet: body.characterSheet ?? "",
      mechanicsSeed: body.mechanicsSeed,
      userId: user.id
    });

    return LobbyInviteJoinResponseSchema.parse({ campaign });
  });

  fastify.post("/campaigns/join/preview", async (request) => {
    const body = CampaignJoinPreviewRequestSchema.parse(request.body);

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return CampaignJoinPreviewResponseSchema.parse(
      await previewCampaignJoinByCode(fastify.pg, body.gameCode ?? "")
    );
  });

  fastify.post("/campaigns/join", async (request) => {
    const body = CampaignJoinRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await joinCampaignByCode(fastify.pg, {
      gameCode: body.gameCode ?? "",
      clientId: body.clientId ?? "",
      username: body.username ?? "",
      characterName: body.characterName ?? "",
      characterSheet: body.characterSheet ?? "",
      mechanicsSeed: body.mechanicsSeed,
      userId: user.id
    });

    return CampaignJoinResponseSchema.parse({ campaign });
  });
}
