import { NextResponse } from "next/server";
import type { DiceRollRequest } from "@/lib/game-types";
export { dungeonMasterInstructions } from "@/lib/dm-prompt-layers";

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

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function titleFromSessionId(sessionId: string) {
  const aiDndSessionMatch = sessionId.match(/^ai-dnd-(\d+)$/);

  if (aiDndSessionMatch) {
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

function mentionsPlayerFacingRoll(text: string) {
  return /\broll\s+(?:a\s+)?(?:d?\d|1d\d+|d20)|\bmake\s+(?:a|an)\s+[^.?!]*(?:check|saving throw|save)\b/i.test(
    text
  );
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

  return {
    id: stringValue(request.id) || crypto.randomUUID(),
    dice,
    label,
    player: stringValue(request.player) || undefined,
    modifier: numberValue(request.modifier),
    advantageState:
      stringValue(request.advantageState) ||
      stringValue(request.advantage_state) ||
      undefined
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
  rollRequests: DiceRollRequest[];
  nextInputNeeded: "player_actions" | "dice_results";
  setting?: {
    displayLocation?: string;
    worldName?: string;
    startingLocation?: string;
  };
};

export function parseHermesDmContract(
  content: string | undefined
): HermesDmContractResponse {
  const parsed = parseJsonObject(content?.trim() ?? "");

  if (!parsed) {
    throw new Error("The DM provider returned invalid JSON for a website turn.");
  }

  const publicNarration = stringValue(parsed.public_narration);
  const nextInputNeeded = stringValue(parsed.next_input_needed);
  const rawRollRequests = Array.isArray(parsed.roll_requests)
    ? parsed.roll_requests
    : [];
  const rollRequests = normalizeRollRequests(rawRollRequests);
  const setting = asObject(parsed.setting);
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

  if (rollRequests.length === 0 && mentionsPlayerFacingRoll(publicNarration)) {
    throw new Error(
      "The DM provider mentioned a player-facing roll without structured roll_requests."
    );
  }

  return {
    publicNarration,
    rollRequests,
    nextInputNeeded,
    setting:
      displayLocation || worldName || startingLocation
        ? {
            displayLocation: displayLocation || startingLocation || worldName,
            worldName: worldName || undefined,
            startingLocation: startingLocation || undefined
          }
        : undefined
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
