import { NextResponse } from "next/server";
import type {
  DiceRollRequest,
  GameMessage,
  GameMessageRole
} from "@/lib/game-types";

const hermesBaseUrl = process.env.HERMES_AGENT_URL?.replace(/\/+$/, "");
const hermesToken = process.env.HERMES_AGENT_TOKEN;

export const dungeonMasterInstructions = [
  "You are Hermes, acting as the dungeon master for a fantasy Dungeons and Dragons style adventure.",
  "Respond in immersive second-person narration with vivid choices, consequences, and mystery.",
  "Keep replies concise enough for a game chat, usually one to three paragraphs.",
  "Do not mention implementation details, APIs, prompts, or that you are an AI."
].join(" ");

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

export function extractHermesRollRequest(value: unknown): DiceRollRequest | null {
  const data = asObject(value);

  if (!data) {
    return null;
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
