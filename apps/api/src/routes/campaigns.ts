import { randomUUID } from "node:crypto";
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
  CampaignRestartBackstoryParamsSchema,
  CampaignRestartBackstoryRequestSchema,
  CampaignRestartRequestSchema,
  CampaignRestartResponseSchema,
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
import type { AnalyticsEventProperties } from "@ai-dnd/contracts";
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
  previewCampaignJoinByCode,
  restartSinglePlayerCampaignForUser
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import type { ServerAnalytics } from "../analytics.js";
import {
  generateCharacterPortraitPreview,
  generateCharacterPortraitForCampaign,
  storeUploadedCharacterPortraitForCampaign
} from "../character-portrait-generation.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type CampaignRouteOptions = {
  config: ApiConfig;
  analytics?: ServerAnalytics;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

function sheetField(sheet: string | undefined, label: string) {
  return sheet?.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim();
}

function spellCountFromSheet(sheet: string | undefined) {
  if (!sheet) {
    return 0;
  }

  const spellsSection = sheet.match(/^Spells\n([\s\S]*?)(?:\n\n|$)/m)?.[1] ?? "";

  if (!spellsSection || spellsSection === "None") {
    return 0;
  }

  return spellsSection
    .split("\n")
    .flatMap((line) => line.split(":").slice(1).join(":").split(","))
    .map((spell) => spell.trim())
    .filter((spell) => spell && !/^dc|spell|slots?|[+-]?\d/.test(spell.toLowerCase()))
    .length;
}

function characterBuildModeFromSheet(sheet: string | undefined) {
  return sheetField(sheet, "Build Mode")?.toLowerCase().includes("quick")
    ? "quick"
    : "custom";
}

function characterAnalyticsProperties(input: {
  userId: string;
  campaignId: string;
  campaignMode: CampaignMode;
  characterSheet?: string | undefined;
  campaignGenre?: string | undefined;
  campaignGenreKind?: "preset" | "custom" | undefined;
  campaignGenrePresetId?: string | undefined;
  hasCustomWorld?: boolean | undefined;
  hasEldermereStart?: boolean | undefined;
  hasPortrait?: boolean | undefined;
  portraitSource?: "generated" | "preview" | "upload" | undefined;
  joinSource?: "code" | "invite" | undefined;
  inviteUsed?: boolean | undefined;
  campaignAgeHours?: number | undefined;
  minutesSinceCampaignCreated?: number | undefined;
}) {
  return {
    userId: input.userId,
    campaignId: input.campaignId,
    campaignMode: input.campaignMode,
    campaignGenre: input.campaignGenre,
    campaignGenreKind: input.campaignGenreKind,
    campaignGenrePresetId: input.campaignGenrePresetId,
    characterClass: sheetField(input.characterSheet, "Class"),
    characterSpecies: sheetField(input.characterSheet, "Species"),
    characterBuildMode: characterBuildModeFromSheet(input.characterSheet),
    spellCount: spellCountFromSheet(input.characterSheet),
    equipmentCompleted: Boolean(input.characterSheet?.includes("\nEquipment\n")),
    hasBackstory: Boolean(
      input.characterSheet?.trim().includes("Backstory\n") &&
        !input.characterSheet.includes(
          "AI Taverns should generate a fitting backstory"
        )
    ),
    hasCustomWorld: input.hasCustomWorld,
    hasEldermereStart: input.hasEldermereStart,
    hasPortrait: input.hasPortrait,
    portraitSource: input.portraitSource,
    joinSource: input.joinSource,
    inviteUsed: input.inviteUsed,
    campaignAgeHours: input.campaignAgeHours,
    minutesSinceCampaignCreated: input.minutesSinceCampaignCreated
  } satisfies Partial<AnalyticsEventProperties>;
}

type RestartBackstoryContextRow = {
  metadata: unknown;
  mode: CampaignMode;
  character_sheet: string;
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

async function generateCharacterPortraitAndPublish(input: {
  fastify: FastifyInstance;
  config: ApiConfig;
  campaignId: string;
  userId: string;
  guidelines?: string | undefined;
  artStyle?: Parameters<typeof generateCharacterPortraitForCampaign>[0]["artStyle"];
  imageModel?: Parameters<
    typeof generateCharacterPortraitForCampaign
  >[0]["imageModel"];
}) {
  const portrait = await generateCharacterPortraitForCampaign({
    db: input.fastify.pg,
    config: input.config,
    campaignId: input.campaignId,
    userId: input.userId,
    guidelines: input.guidelines,
    artStyle: input.artStyle,
    imageModel: input.imageModel,
    onPending: async () => {
      try {
        await input.fastify.roomRealtime.publishRoomUpdated({
          roomId: input.campaignId
        });
      } catch (error) {
        input.fastify.log.warn(
          { error, campaignId: input.campaignId },
          "Character portrait pending update could not be published."
        );
      }
    }
  });

  if (portrait.status !== "ready") {
    input.fastify.log.warn(
      {
        campaignId: input.campaignId,
        userId: input.userId,
        portraitStatus: portrait.status,
        reason: portrait.reason
      },
      "Character portrait generation did not complete."
    );
  }

  try {
    await input.fastify.roomRealtime.publishRoomUpdated({
      roomId: input.campaignId
    });
  } catch (error) {
    input.fastify.log.warn(
      { error, campaignId: input.campaignId },
      "Character portrait completion update could not be published."
    );
  }

  return portrait;
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
  "The backstory value must be plain player-facing prose only. Do not include markdown headings, bullet points, stat blocks, hook labels, separate glossary entries, or surrounding commentary. Explain any setting terms inside the prose itself.",
  "Write the backstory value as 2-4 short paragraphs separated by blank lines, unless the prompt specifically asks you to preserve the player's original paragraph structure. Avoid returning one long unbroken paragraph.",
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
    "Write a player-facing character backstory for the character below. Make a new player understand who this person is quickly. This is a small piece of someone’s life, not a campaign pitch, lore summary, or list of adventure hooks.",
    "",
    "Rules:",
    "- Use the character sheet as authoritative. Do not change class, species, background, alignment, gender, level, stats, proficiencies, equipment, or spells.",
    "- Build the backstory around one clear chain: a close relationship or ordinary part of the character's life, one specific event that changed them, and what they began doing afterward.",
    "- The aftermath should naturally explain why the character became their class without listing class skills or relying on class stereotypes.",
    "- Use concrete actions, places, and objects. Let the reader infer feelings from what happened and what the character does afterward.",
    "- Do not summarize the character with abstract claims such as 'they value freedom,' 'they fear powerlessness,' or 'they seek redemption.'",
    "- Use the world context as canon, but include setting lore only when it is necessary to understand the story. By default, use no more than one named setting detail.",
    "- Use generated names only for people. Do not use generated names for settlements, landmarks, taverns, factions, families, artifacts, ships, roads, objects, or organizations.",
    "- The only newly invented proper nouns allowed are people names. Do not invent new proper nouns for any non-person entity.",
    "- Do not give names to ships, taverns, guilds, companies, ruins, roads, artifacts, books, ledgers, weapons, or family lines. Refer to those as plain descriptions, such as 'her mother's fishing boat' or 'a ruined observatory'.",
    "- Never write phrases like 'called the [Name]' or 'named the [Name]' for a non-person entity.",
    "- Use places, factions, faiths, threats, historical events, and magic terms only when they come from the world context or the player-authored character sheet. If the world context does not supply a specific proper noun, use a plain description instead of inventing one.",
    "- Backstory override for Eldermere opener context: do not invent named starting places or named local anchors. Use only region, city-state, faction, threat, history, or magic names already present in the world context.",
    "- If a setting term is necessary, explain it through the immediate situation instead of giving lore exposition.",
    "- When introducing a setting term, faction, region, title, settlement, custom, historical event, or magic concept a new player may not know, briefly define it in the same sentence or a nearby clause through natural prose. Do not add a separate glossary or labeled explanation section.",
    "- Make the story unique through its relationship, event, and aftermath rather than extra subplots, mysteries, prophecies, or world-level stakes.",
    "- Include no more than two important people. Give a person a name only when the name makes the relationship clearer; otherwise use the relationship naturally.",
    "- Explain why a person matters to the character, not why they matter to the wider world.",
    "- Do not require an unresolved hook, a personal goal, a faction, a mystery, or a world-level stake. Do not add a hook simply because one could be useful later.",
    "- Do not reveal secret DM-only information unless the world context explicitly says it is player-safe.",
    "- Write 2-4 readable paragraphs separated by blank lines. Avoid one long unbroken block of text.",
    "- Before returning, silently check that every paragraph leads naturally into the next and that the final paragraph shows how the character moved forward instead of explaining what they feel.",
    "- Before returning JSON, silently remove any invented non-person proper noun and replace it with a plain description.",
    ...(input.includeEldermereStart
      ? [
          "- Also choose the best Eldermere campaign starting region and settlement for this character. Return them in eldermereStart.regionName and eldermereStart.settlementName using exact names from the canonical start options below.",
          "- Choose the starting settlement that best turns the backstory's unresolved trouble into the opening scene. The backstory itself may mention a broader region or city-state without starting there."
        ]
      : []),
    "- Do not write in second person.",
    "",
    "Length: 150-250 words.",
    "Tone: plain, natural, and human. Be specific without decorative fantasy narration or melodrama.",
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
    "Clarify and enrich the player-written backstory below while preserving its core ideas, events, relationships, tone, and intent. Make the person easier to understand at a glance; do not turn it into a campaign pitch, lore summary, or a larger story.",
    "",
    "Rules:",
    "- Treat the existing backstory as authoritative. Do not remove, contradict, rename, or overwrite any player-authored details.",
    "- Use the character sheet as authoritative. Do not change class, species, background, alignment, gender, level, stats, proficiencies, equipment, or spells.",
    "- Use the world context as canon, but add setting details only when they make an existing relationship, event, or aftermath clearer.",
    "- When the world is Eldermere, convert generic or non-canonical places, factions, institutions, threats, magic, customs, and historical references into Eldermere-native equivalents from the world context when doing so preserves the player's meaning.",
    "- Do not merely append Eldermere terms. Weave them into the existing story only where they preserve the player's meaning and keep the story easy to understand.",
    "- Use generated names only for people. Do not use generated names for settlements, landmarks, taverns, factions, families, artifacts, ships, roads, objects, or organizations.",
    "- The only newly invented proper nouns allowed are people names. Do not invent new proper nouns for any non-person entity.",
    "- Do not give names to ships, taverns, guilds, companies, ruins, roads, artifacts, books, ledgers, weapons, or family lines unless the player already named them. Refer to those as plain descriptions, such as 'her mother's fishing boat' or 'a ruined observatory'.",
    "- Never write phrases like 'called the [Name]' or 'named the [Name]' for a non-person entity unless the player already named it.",
    "- Use places, factions, faiths, threats, historical events, and magic terms only when they come from the world context, the player-written backstory, or the character sheet. If the world context does not supply a specific proper noun, use a plain description instead of inventing one.",
    "- Backstory override for Eldermere opener context: do not invent named starting places or named local anchors. Use only region, city-state, faction, threat, history, or magic names already present in the world context.",
    "- Do not add more than one named setting detail by default, and never add lore exposition.",
    "- When introducing a setting term, faction, region, title, settlement, custom, historical event, or magic concept a new player may not know, briefly define it in the same sentence or a nearby clause through natural prose. Do not add a separate glossary or labeled explanation section.",
    "- Add detail only when it strengthens the existing relationship, event, or aftermath. Do not add new subplots, mysteries, prophecies, tragedies, factions, goals, or adventure hooks.",
    "- Use concrete actions, places, and objects. Do not add abstract explanations of what the character values, fears, or seeks when the story can show it.",
    "- Keep important people focused on their relationship to the character. Do not explain why they matter to the wider world.",
    "- Do not add names unless a name makes an existing relationship easier to follow. Do not rename the player character or any established player-written names.",
    "- Keep the original structure where it works; otherwise use 2-4 short paragraphs. The final paragraph should show how the character moved forward rather than directly explaining what they feel.",
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
    "Length: Stay close to the original length; do not exceed it by more than 40% unless needed to make the central relationship, event, or aftermath clear.",
    "Tone: preserve the player's tone, using plain and natural prose rather than decorative fantasy narration.",
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

function buildLocalizeBackstoryPrompt(input: BackstoryPromptInput) {
  return [
    "Localize the player-written backstory below into the provided world context while changing as little as possible. Preserve the player's wording, structure, events, relationships, tone, character intent, and emotional emphasis wherever you can.",
    "",
    "Rules:",
    "- Treat the existing backstory as authoritative. Do not remove, contradict, rename, or overwrite any player-authored details unless a small change is needed to make a generic or non-canonical world reference native to the provided world.",
    "- Use the character sheet as authoritative. Do not change class, species, background, alignment, gender, level, stats, proficiencies, equipment, or spells.",
    "- Use the full world context as canon. Replace generic or non-canonical places, factions, institutions, threats, magic, customs, and historical references with native world terms only where the replacement is natural and preserves the player's meaning.",
    "- When the world is Eldermere, convert the current details into Eldermere-native terms and places from the world context while changing as little as possible.",
    "- Do not expand the backstory into a new story. Add only the smallest connective phrases needed to make introduced world terms readable.",
    "- Do not add new plot events, new tragedies, new secrets, new prophecies, new quests, or new relationships.",
    "- Do not rename the player character or any player-authored people.",
    "- Use generated names only for people, and only if the original backstory describes an unnamed important person who needs a name to remain readable. Prefer not to invent names during localization.",
    "- Do not invent named non-person entities. Use places, factions, faiths, threats, historical events, and magic terms only when they come from the world context, the player-written backstory, or the character sheet.",
    "- Backstory override for Eldermere opener context: do not invent named starting places or named local anchors. Use only region, city-state, faction, threat, history, or magic names already present in the world context.",
    "- Keep the setting texture focused: choose one primary region or local anchor from the world context, include at most two other canonical setting proper nouns, and explain lore through personal stakes rather than listing canon.",
    "- When introducing a setting term, faction, region, title, settlement, custom, historical event, or magic concept a new player may not know, briefly define it in the same sentence or a nearby clause through natural prose. Do not add a separate glossary or labeled explanation section.",
    "- Keep paragraph breaks close to the player's original structure. If the original is one short paragraph, return one short paragraph.",
    "- Before returning JSON, silently remove any invented non-person proper noun and replace it with a plain description.",
    "- Do not reveal secret DM-only information unless the world context explicitly says it is player-safe.",
    ...(input.includeEldermereStart
      ? [
          "- Also choose the best Eldermere campaign starting region and settlement for this character. Return them in eldermereStart.regionName and eldermereStart.settlementName using exact names from the canonical start options below.",
          "- Choose the starting settlement that best turns the localized backstory's unresolved trouble into the opening scene. The backstory itself may mention a broader region or city-state without starting there."
        ]
      : []),
    "- Do not write in second person.",
    "",
    "Length: Stay close to the player's original length. Do not exceed the original by more than 25% unless a brief world-term explanation is necessary.",
    "Tone: preserve the player's tone.",
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

function buildBackstoryPrompt(
  mode: "generate" | "add_details" | "localize",
  input: BackstoryPromptInput
) {
  if (mode === "generate") {
    return buildGenerateBackstoryPrompt(input);
  }

  if (mode === "localize") {
    return buildLocalizeBackstoryPrompt(input);
  }

  return buildAddBackstoryDetailsPrompt(input);
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
  const { config, analytics } = options;
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

    if (body.mode !== "generate" && !currentBackstory) {
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
    const message = buildBackstoryPrompt(body.mode, {
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

  fastify.post("/campaigns/:campaignId/restart/backstory", async (request) => {
    const params = CampaignRestartBackstoryParamsSchema.parse(request.params);
    const body = CampaignRestartBackstoryRequestSchema.parse(request.body);
    const currentBackstory = body.currentBackstory?.trim();
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    if (body.mode !== "generate" && !currentBackstory) {
      throw createHttpError(400, "Write a backstory before adding details.");
    }

    const context = (
      await fastify.pg.query<RestartBackstoryContextRow>(
        `
          select
            campaigns.metadata,
            campaigns.mode,
            players.character_sheet
          from campaigns
          join players on players.campaign_id = campaigns.id
          where campaigns.id = $1
            and campaigns.status = 'active'
            and players.user_id = $2
            and players.status = 'active'
          order by players.slot asc nulls last, players.created_at asc
          limit 1
        `,
        [params.campaignId, user.id]
      )
    ).rows[0];

    if (!context) {
      throw createHttpError(404, "Campaign not found.");
    }

    if (context.mode !== "single_player") {
      throw createHttpError(
        400,
        "Campaign restart is available for singleplayer adventures."
      );
    }

    const metadata =
      context.metadata && typeof context.metadata === "object"
        ? (context.metadata as Record<string, unknown>)
        : {};
    const genre =
      metadata.genre && typeof metadata.genre === "object"
        ? (metadata.genre as Record<string, unknown>)
        : {};
    const campaignGenreKind = genre.kind === "custom" ? "custom" : "preset";
    const campaignGenrePresetId =
      typeof genre.presetId === "string" ? genre.presetId : undefined;
    const campaignGenre =
      typeof genre.label === "string" ? genre.label : undefined;
    const customWorldName =
      typeof genre.customWorldName === "string" ? genre.customWorldName : undefined;
    const customWorldDescription =
      typeof genre.customWorldDescription === "string"
        ? genre.customWorldDescription
        : undefined;
    const worldContext = characterBackstoryWorldContext({
      campaignGenreKind,
      campaignGenrePresetId,
      campaignGenre,
      customWorldName,
      customWorldDescription
    });
    const characterSheet = context.character_sheet.trim();
    const nameBank = backstoryNameBank({
      characterSheet,
      currentBackstory,
      campaignGenreKind,
      campaignGenrePresetId,
      campaignGenre,
      customWorldName
    });
    const includeEldermereStart = isEldermereBackstoryRequest({
      campaignGenrePresetId
    });
    const message = buildBackstoryPrompt(body.mode, {
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
        ? await generateCharacterPortraitAndPublish({
            fastify,
            config,
            campaignId: campaign.id,
            userId: user.id
          })
        : undefined;

    const responseCampaign =
      portrait?.status === "ready"
        ? {
            ...campaign,
            portraitAssetId: portrait.assetId,
            portraitUrl: portrait.portraitUrl
          }
        : campaign;
    const campaignCreateAnalyticsProperties = characterAnalyticsProperties({
      userId: user.id,
      campaignId: campaign.id,
      campaignMode: mode,
      campaignGenre,
      campaignGenreKind,
      campaignGenrePresetId,
      characterSheet: body.characterSheet,
      minutesSinceCampaignCreated: 0,
      campaignAgeHours: 0,
      hasCustomWorld: campaignGenreKind === "custom",
      hasEldermereStart: Boolean(body.eldermereStart),
      hasPortrait: portrait?.status === "ready",
      portraitSource: portrait?.status === "ready" ? "generated" : undefined
    });
    analytics?.track({
      name: "Campaign World Selected",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: campaign.id,
        campaignMode: mode,
        campaignGenre,
        campaignGenreKind,
        campaignGenrePresetId,
        hasCustomWorld: campaignGenreKind === "custom"
      }
    });
    if (campaignGenreKind === "custom") {
      analytics?.track({
        name: "Custom World Completed",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: campaign.id,
          campaignMode: mode,
          campaignGenre,
          campaignGenreKind,
          hasCustomWorld: true,
          customWorldName: body.customWorldName?.trim() || campaignGenre,
          customWorldDescriptionLength:
            body.customWorldDescription?.trim().length ?? 0
        }
      });
    }
    analytics?.track({
      name: "Character Creation Started",
      distinctId: `user:${user.id}`,
      properties: campaignCreateAnalyticsProperties
    });
    analytics?.track({
      name: "Character Created",
      distinctId: `user:${user.id}`,
      properties: campaignCreateAnalyticsProperties
    });
    analytics?.track({
      name: "Campaign Created",
      distinctId: `user:${user.id}`,
      properties: campaignCreateAnalyticsProperties,
      milestones: [
        "campaign_created_or_joined",
        "character_completed",
        ...(portrait?.status === "ready" ? (["portrait_added"] as const) : [])
      ]
    });

    reply.status(201);
    return CampaignCreateResponseSchema.parse({ campaign: responseCampaign });
  });

  fastify.post("/campaigns/:campaignId/restart", async (request, reply) => {
    const restartTraceId = randomUUID();
    const params = CampaignRestartBackstoryParamsSchema.parse(request.params);
    const body = CampaignRestartRequestSchema.parse(request.body);
    request.log.info(
      {
        restartTraceId,
        campaignId: params.campaignId,
        backstoryLength: body.backstory.trim().length
      },
      "campaign restart request received"
    );
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    request.log.info(
      {
        restartTraceId,
        campaignId: params.campaignId,
        userId: user.id
      },
      "campaign restart authenticated"
    );

    try {
      const campaign = await restartSinglePlayerCampaignForUser(fastify.pg, {
        campaignId: params.campaignId,
        backstory: body.backstory,
        userId: user.id,
        runtime,
        restartTraceId
      });
      request.log.info(
        {
          restartTraceId,
          sourceCampaignId: params.campaignId,
          restartedCampaignId: campaign.id,
          restartedSessionId: campaign.sessionId,
          portraitCopied: Boolean(campaign.portraitAssetId)
        },
        "campaign restart completed"
      );

      reply.status(201);
      analytics?.track({
        name: "Campaign Restarted",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: campaign.id,
          campaignMode: campaign.mode
        }
      });
      return CampaignRestartResponseSchema.parse({ campaign });
    } catch (error) {
      request.log.error(
        {
          restartTraceId,
          campaignId: params.campaignId,
          userId: user.id,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack
                }
              : error
        },
        "campaign restart failed"
      );
      throw error;
    }
  });

  fastify.post("/campaigns/portrait/preview", async (request) => {
    const body = CharacterPortraitPreviewRequestSchema.parse(request.body);

    const user = await requireAuthenticatedUser(
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

    analytics?.track({
      name: "Character Portrait Previewed",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignGenre: body.campaignGenre,
        portraitSource: "preview",
        characterClass: sheetField(body.characterSheet, "Class"),
        characterSpecies: sheetField(body.characterSheet, "Species")
      }
    });

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

    if (body.background) {
      void generateCharacterPortraitAndPublish({
        fastify,
        config,
        campaignId: params.campaignId,
        userId: user.id,
        guidelines: body.guidelines,
        artStyle: body.artStyle,
        imageModel: body.imageModel
      }).catch((error) => {
        fastify.log.error(
          { error, campaignId: params.campaignId, userId: user.id },
          "Background character portrait generation failed."
        );
      });

      const campaign = await getCampaignSummaryForUser(fastify.pg, {
        campaignId: params.campaignId,
        userId: user.id
      });

      analytics?.track({
        name: "Character Portrait Requested",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: params.campaignId,
          campaignMode: campaign.mode,
          portraitSource: "generated"
        }
      });

      return CharacterPortraitResponseSchema.parse({ campaign });
    }

    const portrait = await generateCharacterPortraitAndPublish({
      fastify,
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
    analytics?.track({
      name: "Character Portrait Requested",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: params.campaignId,
        campaignMode: campaign.mode,
        hasPortrait: true,
        portraitSource: "generated"
      },
      milestones: ["portrait_added"]
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
      analytics?.track({
        name: "Character Portrait Uploaded",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: params.campaignId,
          campaignMode: campaign.mode,
          hasPortrait: true,
          portraitSource: "upload"
        },
        milestones: ["portrait_added"]
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
    analytics?.track({
      name: "Campaign Invite Created",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: params.campaignId,
        campaignMode: "multiplayer"
      },
      milestones: ["multiplayer_invite_created"]
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
      analytics?.track({
        name: "Campaign Invite Disabled",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: params.campaignId,
          campaignMode: "multiplayer"
        }
      });

      return CampaignInviteDisableResponseSchema.parse({ invite });
    }
  );

  fastify.get("/invites/:token/preview", async (request) => {
    const params = LobbyInvitePreviewParamsSchema.parse(request.params);

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const preview = await previewLobbyInvite(fastify.pg, params.token);
    analytics?.track({
      name: "Campaign Invite Previewed",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        joinSource: "invite",
        hasBegun: false,
        availableSlots: preview.availableSlots
      }
    });

    return LobbyInvitePreviewResponseSchema.parse(preview);
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
    const joinAnalyticsProperties = characterAnalyticsProperties({
      userId: user.id,
      campaignId: campaign.id,
      campaignMode: "multiplayer",
      characterSheet: body.characterSheet,
      joinSource: "invite",
      inviteUsed: true
    });
    analytics?.track({
      name: "Character Creation Started",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties
    });
    analytics?.track({
      name: "Character Created",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties
    });
    analytics?.track({
      name: "Campaign Joined",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties,
      milestones: ["campaign_created_or_joined", "character_completed"]
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
    const joinAnalyticsProperties = characterAnalyticsProperties({
      userId: user.id,
      campaignId: campaign.id,
      campaignMode: "multiplayer",
      characterSheet: body.characterSheet,
      joinSource: "code",
      inviteUsed: false
    });
    analytics?.track({
      name: "Character Creation Started",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties
    });
    analytics?.track({
      name: "Character Created",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties
    });
    analytics?.track({
      name: "Campaign Joined",
      distinctId: `user:${user.id}`,
      properties: joinAnalyticsProperties,
      milestones: ["campaign_created_or_joined", "character_completed"]
    });

    return CampaignJoinResponseSchema.parse({ campaign });
  });
}
