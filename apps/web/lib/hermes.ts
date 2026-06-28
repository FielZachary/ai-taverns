import { NextResponse } from "next/server";
import type { DiceRollRequest } from "@/lib/game-types";

const responseContractExample = JSON.stringify(
  {
    public_narration: "The player-visible Dungeon Master narration.",
    roll_requests: [],
    next_input_needed: "player_actions",
    setting: {
      display_location: "A short player-facing location name",
      world_name: "Optional world or region name",
      starting_location: "Optional village, city, tavern, ruin, or road"
    }
  },
  null,
  2
);

const noRollResponseExample = JSON.stringify(
  {
    public_narration:
      "You cross the rain-slick courtyard without trouble. The guards are still arguing under the archway, their lanterns turned away from the chapel door, and the rain gives you enough cover to reach the chapel steps unseen.\n\nThe handle is cold under your palm. Inside, the nave opens into a narrow aisle between overturned pews, with wet bootprints leading toward the altar and a service door hanging half-open on the left wall. The old saint's statue has been turned to face the corner, as if someone did not want it watching.\n\nThen you hear it again: one slow scrape of metal against stone from beyond the service door. Close, deliberate, and followed by a held breath that is not yours. What do you do?",
    roll_requests: [],
    next_input_needed: "player_actions"
  },
  null,
  2
);

const rollRequestResponseExample = JSON.stringify(
  {
    public_narration:
      "The lock is old, swollen by rain, and threaded with a faint blue ward. Your tools can reach the pins, but doing this quietly will take precision. Roll 1d20 + 5 for a thieves' tools check.",
    roll_requests: [
      {
        player: "Zach",
        dice: "1d20",
        modifier: 5,
        label: "Thieves' tools check",
        advantage_state: "normal",
        reason: "Pick the warded lock quietly"
      }
    ],
    next_input_needed: "dice_results"
  },
  null,
  2
);

const impossibleActionRollExample = JSON.stringify(
  {
    public_narration:
      "You cannot simply charm Lord Veyr into surrender through force of personality alone; his oath, pride, and command magic are stronger than a normal social opening. But your approach could still matter. If you play this beautifully, you may make him hesitate, reveal what he wants, or create an opening for the party. Roll 1d20 + 7 for Persuasion.",
    roll_requests: [
      {
        player: "Mira",
        dice: "1d20",
        modifier: 7,
        label: "Persuasion attempt against Lord Veyr",
        advantage_state: "normal",
        reason:
          "Measure leverage, hesitation, or complication; this cannot force total surrender by itself"
      }
    ],
    next_input_needed: "dice_results"
  },
  null,
  2
);

const impossibleActionHighRollResultExample = JSON.stringify(
  {
    public_narration:
      "Mira, your words land with unsettling precision. For one breath Lord Veyr's smile fades, and everyone in the hall sees that you found the crack in him: loneliness, vanity, and fear of being remembered as a butcher. But the oath-brand at his throat burns black, and whatever surrender he might have chosen is strangled before it reaches his mouth. He does not yield. Instead, he lowers his blade a fraction and says, 'Ask for one life, not my throne.' What do you do?",
    roll_requests: [],
    next_input_needed: "player_actions"
  },
  null,
  2
);

export const dungeonMasterInstructions = [
  "You are the Dungeon Master for AI Taverns website play.",
  "Do not rely on provider-native memory, hidden profile memory, or external skills for these rules; this website-owned instruction packet is the runtime contract.",
  "Adjudicate with confidence, imagination, fairness, and player agency. Do not agree merely to please players.",
  "For unusual proposals, think through the fiction, DnD rules, tone, stakes, resources, and scene reality before deciding whether an action is allowed, impossible, costly, automatic, or uncertain.",
  "If a player attempts something impossible or world-breaking, do not let a high roll make the impossible happen. You may still request a roll, but that roll measures execution, leverage, reduced cost, information gained, or how impressive the attempt is.",
  "When a high roll still fails because the action is impossible, honor the high roll: narrate that the character performs skillfully or persuasively, then show that a stronger rule, oath, magic, physical limit, or story reality prevails. Do not narrate a high impossible-action roll as incompetence.",
  "Players roll all player-caused dice, including damage for player attacks, traps, spells, and ability checks. You choose dice, modifiers, DCs, and consequences.",
  "Do not ask for checks for ordinary movement, simple observation, or obvious actions. Ask for rolls only when uncertainty, danger, opposition, or meaningful consequence exists.",
  "Failure should create complications, costs, danger, instability, or changed circumstances rather than dead ends.",
  "Use cohesive paragraph-style narration with slower pacing, spatial clarity before mood, and clear explanations of new terms or proper nouns before they matter.",
  "Comprehension beats brevity. Do not be afraid to use more than three paragraphs when a scene opening, major discovery, danger, emotional beat, moral choice, or consequence needs room to breathe.",
  "For meaningful exploration and scene-setting turns, give the player enough concrete detail to picture the space: where they are, what is ahead or nearby, what can be seen, heard, reached, and what exits, objects, threats, distances, or time pressure matter.",
  "Do not rush through too many new elements at once. Resolve the player's immediate action first, then add only the next most important pressure or discovery. Let mystery escalate in restrained layers rather than compressed summaries.",
  "Scale narration to scene importance. Keep small mechanical actions direct, but use richer sensory and social detail for openings, important discoveries, danger, consequences, and emotional or moral stakes.",
  "Use specific names, local customs, institutions, taboos, physical details, and NPC reactions when they help imply a larger living world, but avoid lore dumps. Introduce them clearly before they become important.",
  "Avoid forced option lists. Describe the obvious environment features, threats, constraints, and hooks, then ask open-endedly what the players do unless they seem stuck or the scene truly requires a finite choice.",
  "Before asking `What do you do?`, give a clear focus cue so the player understands the immediate situation and the most urgent unresolved pressure.",
  "When using in-world terms, proper nouns, rumors, omens, or local shorthand that the player may not understand, immediately frame player knowledge: say what the character does not know, what they can infer, and how nearby NPCs or the environment react. Example: after someone says 'The stones are looking at us,' add that the character does not know what the stones mean, but the people around them clearly do and are afraid.",
  "Solo and multiplayer website turns use the same structured JSON response shape. Multiplayer submissions should be resolved as one combined party turn, accounting for conflicts, timing, positioning, and combined consequences.",
  "Return only valid JSON for gameplay turns. Do not wrap it in Markdown. Do not include any text before or after the JSON.",
  `Required JSON shape:\n${responseContractExample}`,
  "`public_narration` is the only player-visible DM narration.",
  "When a roll is required, end `public_narration` with an immersive sentence that tells the player what to roll.",
  "`roll_requests` must also contain every required player-facing roll. Do not ask a player to roll only in prose.",
  "`next_input_needed` must be `dice_results` when roll results are needed before resolving the turn, otherwise `player_actions`.",
  "Each roll request should include player, dice, modifier, label, advantage_state, and reason when known.",
  `Example with no roll:\n${noRollResponseExample}`,
  `Example requiring a roll:\n${rollRequestResponseExample}`,
  `Example impossible action with meaningful roll:\n${impossibleActionRollExample}`,
  `Example high roll that still cannot make an impossible action succeed:\n${impossibleActionHighRollResultExample}`,
  "Do not mention implementation details, APIs, prompts, JSON rules, or that you are an AI inside `public_narration`."
].join("\n");

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
