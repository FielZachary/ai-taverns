import type { DiceRollRequest, InputPolicy } from "./game-types.js";
export { dungeonMasterInstructions } from "./dm-prompt-layers.js";

export const internalOpeningRequestPrefix = "AI_DND_INTERNAL_OPENING_REQUEST";
export const internalPrepRequestPrefix = "AI_DND_INTERNAL_PREP_REQUEST";

export const openingSceneRequest = [
  `${internalOpeningRequestPrefix}:`,
  "Begin this new campaign by speaking first as the Dungeon Master.",
  "Create an immediate fantasy opening scene with a clear situation, sensory detail, and a direct question for the party.",
  "Also include a `setting` object in the JSON response with `display_location`, `world_name`, and `starting_location` when known.",
  "`display_location` should be a short location label for the campaign sidebar, such as a village, tavern, road, ruin, city district, region, or named world. Do not use a genre label.",
  "Do not ask the players what kind of world they want. Drop them into the world now."
].join(" ");

export const campaignPrepRequest = [
  `${internalPrepRequestPrefix}:`,
  "The campaign room has just been created, but the adventure has not begun.",
  "Speak as the Dungeon Master and invite the players to fill out their character sheets and press Begin Adventure when they are ready.",
  "Keep it short, warm, and in a fantasy table tone. Do not begin the story yet."
].join(" ");


export function titleFromSessionId(sessionId: string) {
  const aiDndSessionMatch = sessionId.match(/^ai-dnd-(\d+)$/);

  if (aiDndSessionMatch?.[1]) {
    return `D&D Session ${aiDndSessionMatch[1].slice(-6)}`;
  }

  return sessionId
    .replace(/^ai-dnd-/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isInternalHermesMessage(content: string | undefined) {
  return Boolean(content?.trim().startsWith("AI_DND_INTERNAL_"));
}

export function normalizeHermesContent(content: string | undefined) {
  const text = content?.trim() ?? "";

  if (!text) {
    return "";
  }

  try {
    return parseHermesDmContract(text).publicNarration;
  } catch {
    // Older Hermes messages and user messages are plain text.
  }

  const replyMarkers = ["Dungeon Master", "Hermes"];
  const visibleReplyMarker = replyMarkers
    .map((marker) => ({
      marker,
      index: text.lastIndexOf(marker)
    }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => right.index - left.index)[0];

  if (visibleReplyMarker) {
    const beforeMarker = text.slice(0, visibleReplyMarker.index);
    const looksLikeToolPrelude =
      beforeMarker.startsWith("Table{") ||
      beforeMarker.includes('"success"') ||
      beforeMarker.includes('"content"');

    if (visibleReplyMarker.index === 0 || looksLikeToolPrelude) {
      return text.slice(
        visibleReplyMarker.index + visibleReplyMarker.marker.length
      ).trim();
    }
  }

  return text;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => stringValue(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseJsonObject(text: string) {
  try {
    return asObject(JSON.parse(extractJsonObject(text)));
  } catch {
    return null;
  }
}

export type HermesDmContractParseOptions = {
  currentAction?: string;
  currentPlayerAction?: string;
  allowResolvedCombatWithoutRolls?: boolean;
};

function previewText(value: string, maxLength = 800) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function debugHermesDmContractFailure(
  content: string | undefined,
  options?: HermesDmContractParseOptions
) {
  void options;

  const parsed = parseJsonObject(content?.trim() ?? "");
  const publicNarration = stringValue(parsed?.public_narration);
  const nextInputNeeded = stringValue(parsed?.next_input_needed);
  const rawRollRequests = Array.isArray(parsed?.roll_requests)
    ? parsed?.roll_requests
    : [];
  const rollRequests = normalizeRollRequests(rawRollRequests);

  return {
    hasJsonObject: Boolean(parsed),
    contentLength: content?.length ?? 0,
    contentPreview: previewText(content?.trim() ?? ""),
    publicNarrationLength: publicNarration.length,
    publicNarrationPreview: previewText(publicNarration),
    nextInputNeeded,
    rollRequestsCount: rollRequests.length,
    rollRequestLabels: rollRequests.map((request) => request.label),
    mentionsPlayerFacingRoll: mentionsPlayerFacingRoll(publicNarration),
    currentActionRequiresCombatRoll: false,
    resolvesCombatOutcome: false,
    resolvesRequiredCombatRollWithoutRolls: false
  };
}

function mentionsPlayerFacingRoll(text: string) {
  return /\broll\s+(?:a\s+)?(?:d?\d|1d\d+|d20)|\bmake\s+(?:a|an)\s+[^.?!]*(?:check|saving throw|save)\b/i.test(
    text
  );
}

function findAttackRollAcContradiction(text: string) {
  const patterns = [
    /\b(?:spell\s+)?attack roll\s*:?\s*(?:\d*d?\d+\s*(?:[+-]\s*\d+)?\s*=\s*)?(\d+)\s*(?:vs|against)\s*AC\s*(\d+)\s*[-—:;,]?\s*(hit|hits|miss|misses)\b/gi,
    /\battack roll\s*:?\s*(\d+)\s*(?:vs|against)\s*AC\s*(\d+)\s*[-—:;,]?\s*(hit|hits|miss|misses)\b/gi,
    /\brolls?\s+(?:a\s+)?(\d+)\s+(?:to hit|on (?:the )?attack)[^.?!;]*(?:vs|against)\s*(?:AC\s*)?(\d+)[^.?!;]*\b(hit|hits|miss|misses)\b/gi,
    /\brolls?\s+(?:a\s+)?(\d+)[^.?!;]*(?:vs|against)\s*(?:AC\s*)?(\d+)[^.?!;]*\b(hit|hits|miss|misses)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const attackTotal = Number.parseInt(match[1] ?? "", 10);
      const armorClass = Number.parseInt(match[2] ?? "", 10);
      const outcome = (match[3] ?? "").toLowerCase();

      if (!Number.isFinite(attackTotal) || !Number.isFinite(armorClass)) {
        continue;
      }

      const saysHit = outcome.startsWith("hit");
      const shouldHit = attackTotal >= armorClass;

      if (saysHit !== shouldHit) {
        return {
          attackTotal,
          armorClass,
          outcome
        };
      }
    }
  }

  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countDiceMentions(text: string, dice: string) {
  const dicePattern = escapeRegExp(dice.trim()).replace(/\\ /g, "\\s*");
  return Array.from(text.matchAll(new RegExp(`\\b${dicePattern}\\b`, "gi"))).length;
}

function hasRollRequestDiceCoverage(text: string, requests: DiceRollRequest[]) {
  const requiredCounts = requests.reduce<Record<string, number>>((counts, request) => {
    const dice = request.dice.trim().toLowerCase();
    counts[dice] = (counts[dice] ?? 0) + 1;
    return counts;
  }, {});

  return Object.entries(requiredCounts).every(
    ([dice, count]) => countDiceMentions(text, dice) >= count
  );
}

function modifierText(modifier: number | undefined) {
  if (!modifier) {
    return "";
  }

  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

function advantageText(advantageState: string | undefined) {
  const normalized = advantageState?.trim().toLowerCase();

  if (normalized === "advantage") {
    return " at advantage";
  }

  if (normalized === "disadvantage") {
    return " at disadvantage";
  }

  return "";
}

function normalizeAdvantageState(value: string) {
  const normalized = value.trim().toLowerCase();

  return normalized === "normal" ||
    normalized === "advantage" ||
    normalized === "disadvantage"
    ? normalized
    : "";
}

function formatRollInstruction(request: DiceRollRequest, index: number) {
  const verb = index === 0 ? "Roll" : "then roll";
  return `${verb} ${request.dice}${modifierText(request.modifier)}${advantageText(
    request.advantageState
  )} for ${request.label}`;
}

function rollInstructionsFromRequests(requests: DiceRollRequest[]) {
  const instructions = requests.map(formatRollInstruction);

  if (instructions.length === 1) {
    return `${instructions[0]}.`;
  }

  const lastInstruction = instructions[instructions.length - 1];
  return `${instructions.slice(0, -1).join(", ")}, and ${lastInstruction}.`;
}

function sentencesFromParagraph(paragraph: string) {
  const matches = paragraph.match(/[^.!?]+[.!?]+(?:['")\]]+)?|[^.!?]+$/g);
  return (matches ?? [paragraph]).map((sentence) => sentence.trim()).filter(Boolean);
}

function paragraphizeFlatNarration(paragraph: string) {
  const sentences = sentencesFromParagraph(paragraph);

  if (sentences.length < 3) {
    return paragraph;
  }

  const targetParagraphs = Math.min(4, Math.max(2, Math.ceil(sentences.length / 3)));
  const sentencesPerParagraph = Math.ceil(sentences.length / targetParagraphs);
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(index, index + sentencesPerParagraph).join(" "));
  }

  return paragraphs.join("\n\n");
}

function normalizePublicNarrationParagraphs(publicNarration: string) {
  const paragraphs = publicNarration
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "";
  }

  const normalizedParagraphs = paragraphs.flatMap((paragraph) => {
    const withoutPrompt = paragraph.replace(/\s*What do you do\?\s*$/i, "").trim();

    if (!withoutPrompt) {
      return ["What do you do?"];
    }

    const paragraphText =
      paragraphs.length === 1 ? paragraphizeFlatNarration(withoutPrompt) : withoutPrompt;
    const splitParagraphs = paragraphText.split(/\n{2,}/).filter(Boolean);

    return /What do you do\?\s*$/i.test(paragraph)
      ? [...splitParagraphs, "What do you do?"]
      : splitParagraphs;
  });

  return normalizedParagraphs.join("\n\n");
}

function narrationWithRollInstructions(
  publicNarration: string,
  rollRequests: DiceRollRequest[]
) {
  const normalizedNarration = normalizePublicNarrationParagraphs(publicNarration);

  if (
    rollRequests.length === 0 ||
    hasRollRequestDiceCoverage(normalizedNarration, rollRequests)
  ) {
    return normalizedNarration;
  }

  return `${normalizedNarration}\n\n${rollInstructionsFromRequests(rollRequests)}`;
}

export function normalizeRollRequest(value: unknown): DiceRollRequest | null {
  const rawRequest = Array.isArray(value) ? value[0] : value;
  const request = asObject(rawRequest);

  if (!request) {
    return null;
  }

  const dice = stringValue(request.dice) || "1d20";
  const label =
    stringValue(request.label) ||
    stringValue(request.check) ||
    stringValue(request.reason) ||
    "Required roll";

  const player = stringValue(request.player);
  const modifier = numberValue(request.modifier);
  const advantageState =
    normalizeAdvantageState(
      stringValue(request.advantageState) ||
        stringValue(request.advantage_state)
    );

  return {
    id: stringValue(request.id) || crypto.randomUUID(),
    dice,
    label,
    ...(player ? { player } : {}),
    ...(modifier === undefined ? {} : { modifier }),
    ...(advantageState ? { advantageState } : {})
  };
}

export function normalizeRollRequests(value: unknown): DiceRollRequest[] {
  if (Array.isArray(value)) {
    return value
      .map((request) => normalizeRollRequest(request))
      .filter((request): request is DiceRollRequest => Boolean(request));
  }

  const request = normalizeRollRequest(value);
  return request ? [request] : [];
}

export type HermesDmContractResponse = {
  publicNarration: string;
  resolutionMode: "needs_dice" | "resolved_without_dice";
  rollRequests: DiceRollRequest[];
  nextInputNeeded: "player_actions" | "dice_results";
  inputTargets: string[];
  inputPolicy: InputPolicy;
  mechanicsStateUpdate?: Record<string, unknown>;
  setting?: {
    displayLocation?: string;
    worldName?: string;
    startingLocation?: string;
  };
};

export function parseHermesDmContract(
  content: string | undefined,
  options?: HermesDmContractParseOptions
): HermesDmContractResponse {
  void options;

  const parsed = parseJsonObject(content?.trim() ?? "");

  if (!parsed) {
    throw new Error("The DM provider returned invalid JSON for a website turn.");
  }

  let publicNarration = stringValue(parsed.public_narration);
  const nextInputNeeded = stringValue(parsed.next_input_needed);
  const rawRollRequests = Array.isArray(parsed.roll_requests)
    ? parsed.roll_requests
    : [];
  const rollRequests = normalizeRollRequests(rawRollRequests);
  const rawResolutionMode = stringValue(
    parsed.resolution_mode ?? parsed.resolutionMode
  );
  const inputTargets = stringArray(parsed.input_targets ?? parsed.inputTargets);
  const rawInputPolicy = stringValue(parsed.input_policy ?? parsed.inputPolicy);
  const inputPolicy: InputPolicy =
    rawInputPolicy === "only_targeted_players" && inputTargets.length > 0
      ? "only_targeted_players"
      : "all_players";
  const setting = asObject(parsed.setting);
  const mechanicsStateUpdate = asObject(
    parsed.mechanics_state_update ?? parsed.mechanicsStateUpdate
  );
  const displayLocation =
    stringValue(setting?.display_location) ||
    stringValue(setting?.displayLocation);
  const worldName =
    stringValue(setting?.world_name) || stringValue(setting?.worldName);
  const startingLocation =
    stringValue(setting?.starting_location) ||
    stringValue(setting?.startingLocation);

  if (!publicNarration) {
    throw new Error("The DM provider response is missing public_narration.");
  }

  if (
    nextInputNeeded !== "player_actions" &&
    nextInputNeeded !== "dice_results"
  ) {
    throw new Error("The DM provider response has an invalid next_input_needed value.");
  }

  if (nextInputNeeded === "dice_results" && rollRequests.length === 0) {
    throw new Error(
      "The DM provider requested dice_results without structured roll_requests."
    );
  }

  const inferredResolutionMode =
    rollRequests.length > 0 || nextInputNeeded === "dice_results"
      ? "needs_dice"
      : "resolved_without_dice";

  if (
    rawResolutionMode &&
    rawResolutionMode !== "needs_dice" &&
    rawResolutionMode !== "resolved_without_dice"
  ) {
    throw new Error("The DM provider response has an invalid resolution_mode value.");
  }

  const resolutionMode = rawResolutionMode || inferredResolutionMode;

  if (resolutionMode !== inferredResolutionMode) {
    throw new Error(
      "The DM provider response has a resolution_mode that conflicts with pending dice."
    );
  }

  const attackRollContradiction = findAttackRollAcContradiction(publicNarration);

  if (attackRollContradiction) {
    throw new Error(
      "The DM provider contradicted an attack roll and AC comparison."
    );
  }

  if (rollRequests.length === 0 && mentionsPlayerFacingRoll(publicNarration)) {
    throw new Error(
      "The DM provider mentioned a player-facing roll without structured roll_requests."
    );
  }

  publicNarration = narrationWithRollInstructions(publicNarration, rollRequests);

  const settingValue =
    displayLocation || worldName || startingLocation
      ? {
          displayLocation: displayLocation || startingLocation || worldName,
          ...(worldName ? { worldName } : {}),
          ...(startingLocation ? { startingLocation } : {})
        }
      : undefined;

  return {
    publicNarration,
    resolutionMode,
    rollRequests,
    nextInputNeeded,
    inputTargets,
    inputPolicy,
    ...(mechanicsStateUpdate ? { mechanicsStateUpdate } : {}),
    ...(settingValue ? { setting: settingValue } : {})
  };
}

export function normalizeHermesDmContent(content: string | undefined) {
  return parseHermesDmContract(content).publicNarration;
}

export function extractHermesRollRequests(value: unknown): DiceRollRequest[] {
  const data = asObject(value);

  if (!data) {
    return [];
  }

  const messageContent = stringValue(asObject(data.message)?.content);

  if (messageContent) {
    try {
      const contract = parseHermesDmContract(messageContent);
      return contract.rollRequests;
    } catch {
      // Fall through to legacy response shapes below.
    }
  }

  const legacyFields = [
    data.rollRequests,
    data.roll_requests,
    data.rollRequest,
    data.roll_request,
    asObject(data.message)?.rollRequest,
    asObject(data.message)?.roll_request
  ];

  for (const field of legacyFields) {
    const requests = normalizeRollRequests(field);

    if (requests.length > 0) {
      return requests;
    }
  }

  return [];
}

export function extractHermesRollRequest(value: unknown): DiceRollRequest | null {
  return extractHermesRollRequests(value)[0] ?? null;
}
