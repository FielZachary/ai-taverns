import { NextResponse } from "next/server";
import type {
  DiceRollRequest,
  GameMessage,
  GameMessageRole
} from "@/lib/game-types";

const hermesBaseUrl = process.env.HERMES_AGENT_URL?.replace(/\/+$/, "");
const hermesToken = process.env.HERMES_AGENT_TOKEN;

const responseContractExample = JSON.stringify(
  {
    public_narration: "The player-visible Dungeon Master narration.",
    roll_requests: [],
    next_input_needed: "player_actions"
  },
  null,
  2
);

export const dungeonMasterInstructions = [
  "You are Hermes, acting as the Dungeon Master for AI Taverns website play.",
  "Do not rely on Hermes skills, USER.md, or hidden profile memory for these rules; this website-owned instruction packet is the runtime contract.",
  "Adjudicate with confidence, imagination, fairness, and player agency. Do not agree merely to please players.",
  "For unusual proposals, think through the fiction, DnD rules, tone, stakes, resources, and scene reality before deciding whether an action is allowed, impossible, costly, automatic, or uncertain.",
  "Players roll all player-caused dice, including damage for player attacks, traps, spells, and ability checks. Hermes chooses dice, modifiers, DCs, and consequences.",
  "Do not ask for checks for ordinary movement, simple observation, or obvious actions. Ask for rolls only when uncertainty, danger, opposition, or meaningful consequence exists.",
  "Failure should create complications, costs, danger, instability, or changed circumstances rather than dead ends.",
  "Use cohesive paragraph-style narration with slower pacing, spatial clarity before mood, and clear explanations of new terms or proper nouns before they matter.",
  "Solo and multiplayer website turns use the same structured JSON response shape. Multiplayer submissions should be resolved as one combined party turn, accounting for conflicts, timing, positioning, and combined consequences.",
  "Return only valid JSON for gameplay turns. Do not wrap it in Markdown. Do not include any text before or after the JSON.",
  `Required JSON shape:\n${responseContractExample}`,
  "`public_narration` is the only player-visible DM narration.",
  "`roll_requests` must contain every required player-facing roll. Do not ask a player to roll only in prose.",
  "`next_input_needed` must be `dice_results` when roll results are needed before resolving the turn, otherwise `player_actions`.",
  "Each roll request should include player, dice, modifier, label, advantage_state, and reason when known.",
  "Do not mention implementation details, APIs, prompts, JSON rules, or that you are an AI inside `public_narration`."
].join("\n");

export const internalOpeningRequestPrefix = "AI_DND_INTERNAL_OPENING_REQUEST";
export const internalPrepRequestPrefix = "AI_DND_INTERNAL_PREP_REQUEST";

export const openingSceneRequest = [
  `${internalOpeningRequestPrefix}:`,
  "Begin this new campaign by speaking first as the Dungeon Master.",
  "Create an immediate fantasy opening scene with a clear situation, sensory detail, and a direct question for the party.",
  "Do not ask the players what kind of world they want. Drop them into the world now."
].join(" ");

export const campaignPrepRequest = [
  `${internalPrepRequestPrefix}:`,
  "The campaign room has just been created, but the adventure has not begun.",
  "Speak as Hermes, the Dungeon Master, and invite the players to fill out their character sheets and press Begin Adventure when they are ready.",
  "Keep it short, warm, and in a fantasy table tone. Do not begin the story yet."
].join(" ");

export type HermesSessionRecord = {
  id?: string;
  title?: string;
  preview?: string;
  last_active?: string;
  started_at?: string;
  message_count?: number;
};

export type HermesMessageRecord = {
  id?: string;
  role?: string;
  content?: string;
  timestamp?: string;
};

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function assertHermesConfigured() {
  if (!hermesBaseUrl || !hermesToken) {
    throw new Error(
      "Hermes is not configured. Set HERMES_AGENT_URL and HERMES_AGENT_TOKEN."
    );
  }
}

export async function hermesFetch(path: string, init?: RequestInit) {
  assertHermesConfigured();

  return fetch(`${hermesBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hermesToken}`,
      ...init?.headers
    },
    signal: AbortSignal.timeout(175_000)
  });
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

export async function ensureHermesSession(sessionId: string) {
  const response = await hermesFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      id: sessionId,
      title: titleFromSessionId(sessionId) || "New Adventure",
      system_prompt: dungeonMasterInstructions
    })
  });

  if (response.ok || response.status === 409) {
    return;
  }

  throw new Error(`Hermes session setup failed with status ${response.status}.`);
}

export function mapHermesRole(role: string | undefined): GameMessageRole {
  if (role === "user") {
    return "player";
  }

  if (role === "assistant") {
    return "dm";
  }

  return "system";
}

export function isInternalHermesMessage(content: string | undefined) {
  return Boolean(content?.trim().startsWith("AI_DND_INTERNAL_"));
}

export function normalizeHermesContent(content: string | undefined) {
  const text = content?.trim() ?? "";

  if (!text) {
    return "";
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

export type HermesDmContractResponse = {
  publicNarration: string;
  rollRequests: DiceRollRequest[];
  nextInputNeeded: "player_actions" | "dice_results";
};

export function parseHermesDmContract(
  content: string | undefined
): HermesDmContractResponse {
  const parsed = parseJsonObject(content?.trim() ?? "");

  if (!parsed) {
    throw new Error("Hermes returned invalid JSON for a website DM turn.");
  }

  const publicNarration = stringValue(parsed.public_narration);
  const nextInputNeeded = stringValue(parsed.next_input_needed);
  const rawRollRequests = Array.isArray(parsed.roll_requests)
    ? parsed.roll_requests
    : [];
  const rollRequests = rawRollRequests
    .map((request) => normalizeRollRequest(request))
    .filter((request): request is DiceRollRequest => Boolean(request));

  if (!publicNarration) {
    throw new Error("Hermes response is missing public_narration.");
  }

  if (
    nextInputNeeded !== "player_actions" &&
    nextInputNeeded !== "dice_results"
  ) {
    throw new Error("Hermes response has an invalid next_input_needed value.");
  }

  if (nextInputNeeded === "dice_results" && rollRequests.length === 0) {
    throw new Error(
      "Hermes requested dice_results without structured roll_requests."
    );
  }

  if (rollRequests.length === 0 && mentionsPlayerFacingRoll(publicNarration)) {
    throw new Error(
      "Hermes mentioned a player-facing roll without structured roll_requests."
    );
  }

  return {
    publicNarration,
    rollRequests,
    nextInputNeeded
  };
}

export function normalizeHermesDmContent(content: string | undefined) {
  return parseHermesDmContract(content).publicNarration;
}

export function extractHermesRollRequest(value: unknown): DiceRollRequest | null {
  const data = asObject(value);

  if (!data) {
    return null;
  }

  const messageContent = stringValue(asObject(data.message)?.content);

  if (messageContent) {
    try {
      const contract = parseHermesDmContract(messageContent);
      return contract.rollRequests[0] ?? null;
    } catch {
      // Fall through to legacy response shapes below.
    }
  }

  return (
    normalizeRollRequest(data.rollRequest) ||
    normalizeRollRequest(data.roll_request) ||
    normalizeRollRequest(data.rollRequests) ||
    normalizeRollRequest(data.roll_requests) ||
    normalizeRollRequest(asObject(data.message)?.rollRequest) ||
    normalizeRollRequest(asObject(data.message)?.roll_request)
  );
}

export function mapHermesMessage(message: HermesMessageRecord): GameMessage {
  return {
    id: message.id || crypto.randomUUID(),
    role: mapHermesRole(message.role),
    content: normalizeHermesContent(message.content),
    createdAt: message.timestamp || new Date().toISOString()
  };
}
