export const dmJobNames = [
  "campaign_starter",
  "scene_director",
  "investigation",
  "npc_dialogue",
  "combat",
  "clarification"
] as const;

export type DmJobName = (typeof dmJobNames)[number];

export const contextCategories = [
  "npc_context",
  "player_character_context",
  "combat_context",
  "relevant_world_context",
  "quests_open_threads",
  "overarching_big_plot_secrets"
] as const;

export type ContextCategory = (typeof contextCategories)[number];

export type RouterContextKeys = Record<ContextCategory, string[]>;

export type ValidatedRouterOutput = {
  jobNeeded: DmJobName;
  contextKeys: RouterContextKeys;
  reason?: string;
  fallbackUsed: boolean;
  errors: string[];
};

export type ContextChunk = {
  id: string;
  category: ContextCategory;
  title: string;
  visibility: "player_safe" | "dm_only";
  priority: number;
  bodyMarkdown: string;
  updatedAt?: string;
};

export type ContextRetrievalReport = {
  chunks: ContextChunk[];
  omitted: {
    id: string;
    category: ContextCategory;
    reason: "missing" | "disallowed" | "duplicate" | "budget_exceeded";
  }[];
};

export type MainDmOutput = {
  publicNarration: string;
  rollRequests: unknown[];
  nextInputNeeded: "player_actions" | "dice_results" | "clarification" | "none";
  combatEvents: unknown[];
  proposedContextUpdates: unknown[];
};

export type CombatActorState = {
  currentHp?: number;
  maxHp?: number;
  resources?: Record<string, unknown>;
  conditions?: string[];
};

export type CombatValidationContext = {
  actors: Record<string, CombatActorState>;
};

export type ValidationResult<T> = {
  accepted: T[];
  discarded: {
    item: unknown;
    reasons: string[];
  }[];
};

export type MemoryPatch = {
  operation: "append" | "replace_section" | "create_chunk" | "archive_chunk";
  contextId?: string;
  contextType?: ContextCategory;
  title?: string;
  visibility?: "player_safe" | "dm_only";
  markdown?: string;
};

const fallbackContextKeys = contextCategories.reduce(
  (keys, category) => ({ ...keys, [category]: [] }),
  {} as RouterContextKeys
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  return firstBrace >= 0 && lastBrace > firstBrace
    ? trimmed.slice(firstBrace, lastBrace + 1)
    : trimmed;
}

export function parseJsonRecord(text: string | undefined) {
  try {
    const parsed = JSON.parse(extractJsonObject(text ?? ""));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ]
    : [];
}

export function validateRouterOutput(
  text: string | undefined,
  fallbackJob: DmJobName = "scene_director"
): ValidatedRouterOutput {
  const parsed = parseJsonRecord(text);
  const errors: string[] = [];
  const rawJob = typeof parsed?.job_needed === "string" ? parsed.job_needed : "";
  const jobNeeded = dmJobNames.includes(rawJob as DmJobName)
    ? (rawJob as DmJobName)
    : fallbackJob;

  if (!parsed) {
    errors.push("router output must be parseable JSON");
  }

  if (rawJob && jobNeeded !== rawJob) {
    errors.push("job_needed must be a known DM job");
  }

  if (!rawJob) {
    errors.push("job_needed is required");
  }

  const rawContextKeys = isRecord(parsed?.context_keys)
    ? parsed.context_keys
    : {};

  if (!isRecord(parsed?.context_keys)) {
    errors.push("context_keys must be an object");
  }

  const contextKeys = contextCategories.reduce((keys, category) => {
    const value = rawContextKeys[category];
    const normalized = normalizeStringArray(value);

    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some((item) => typeof item !== "string" || !item.trim()))
    ) {
      errors.push(`${category} context keys must be strings`);
    }

    return { ...keys, [category]: normalized };
  }, {} as RouterContextKeys);

  const result: ValidatedRouterOutput = {
    jobNeeded,
    contextKeys: errors.length > 0 ? { ...fallbackContextKeys, ...contextKeys } : contextKeys,
    fallbackUsed: errors.length > 0,
    errors
  };

  if (typeof parsed?.reason === "string") {
    result.reason = parsed.reason;
  }

  return result;
}

export function buildRouterPrompt() {
  return [
    "You are the AI Taverns DM router.",
    "Choose exactly one primary job for the current turn and select context chunk keys only.",
    "Do not summarize, rewrite, mutate, or invent memory.",
    `Allowed jobs: ${dmJobNames.join(", ")}.`,
    `Context categories: ${contextCategories.join(", ")}.`,
    "Return exactly one JSON object with job_needed, context_keys, and optional reason."
  ].join("\n");
}

export function jobPrompt(job: DmJobName) {
  const shared = [
    "Return strict JSON only.",
    "Minimum output fields: public_narration, roll_requests, next_input_needed, combat_events, proposed_context_updates.",
    "Only public_narration is player-visible.",
    "Models may choose, narrate, infer, and propose; the server retrieves, validates, stores, and mutates."
  ];

  const jobs: Record<DmJobName, string[]> = {
    campaign_starter: [
      "Create the opening playable campaign frame with immediate pressure and a clear first objective.",
      "Do not begin with vague lore or exposition."
    ],
    scene_director: [
      "Run normal gameplay outside combat.",
      "Narrate consequences, visible clues, hazards, opportunities, and meaningful choices without forcing player decisions."
    ],
    investigation: [
      "Handle discovery, mysteries, hidden information, and clue progression.",
      "Reveal clues gradually and avoid dead ends on failed rolls."
    ],
    npc_dialogue: [
      "Handle direct conversation with NPCs.",
      "Keep NPC voice, motives, secrets, leverage, and social consequences coherent."
    ],
    combat: [
      "Run tactical combat encounters.",
      "Never silently modify HP, resources, conditions, initiative, or inventory.",
      "State changes must be explicit combat_events accepted by the server.",
      "Make useful numbers visible in narration: damage, DCs, saves, initiative, HP/resource outcomes."
    ],
    clarification: [
      "Ask one concise clarifying question.",
      "Do not advance the scene, resolve the action, invent consequences, or change game state."
    ]
  };

  return [`AI Taverns DM job: ${job}`, ...jobs[job], ...shared].join("\n");
}

export function buildMemoryUpdaterPrompt() {
  return [
    "You are the AI Taverns memory/context updater.",
    "Propose sparse patches after the player-facing turn has resolved.",
    "Return strict JSON with patches, new_context_chunks, and remove_context_chunks.",
    "Allowed operations: append, replace_section, create_chunk, archive_chunk.",
    "Do not rewrite whole campaign memory or treat minor narration as durable memory."
  ].join("\n");
}

export function renderContextChunks(chunks: ContextChunk[]) {
  if (chunks.length === 0) {
    return "No selected context chunks were retrieved.";
  }

  return chunks
    .map((chunk) =>
      [
        `<context_chunk id="${chunk.id}" type="${chunk.category}" visibility="${chunk.visibility}">`,
        `# ${chunk.title}`,
        "",
        chunk.bodyMarkdown.trim(),
        "</context_chunk>"
      ].join("\n")
    )
    .join("\n\n");
}

export function validateMainDmOutput(text: string | undefined): MainDmOutput {
  const parsed = parseJsonRecord(text);

  if (!parsed) {
    throw new Error("main DM output must be parseable JSON");
  }

  const publicNarration = parsed.public_narration;
  const nextInputNeeded = parsed.next_input_needed;

  if (typeof publicNarration !== "string" || !publicNarration.trim()) {
    throw new Error("main DM output is missing public_narration");
  }

  if (
    nextInputNeeded !== "player_actions" &&
    nextInputNeeded !== "dice_results" &&
    nextInputNeeded !== "clarification" &&
    nextInputNeeded !== "none"
  ) {
    throw new Error("main DM output has invalid next_input_needed");
  }

  return {
    publicNarration: publicNarration.trim(),
    rollRequests: Array.isArray(parsed.roll_requests) ? parsed.roll_requests : [],
    nextInputNeeded,
    combatEvents: Array.isArray(parsed.combat_events) ? parsed.combat_events : [],
    proposedContextUpdates: Array.isArray(parsed.proposed_context_updates)
      ? parsed.proposed_context_updates
      : []
  };
}

function combatEventReasons(
  event: unknown,
  context: CombatValidationContext
) {
  const reasons: string[] = [];

  if (!isRecord(event)) {
    return ["combat event must be an object"];
  }

  const actor = typeof event.actor === "string" ? event.actor : "";
  const target = typeof event.target === "string" ? event.target : "";

  if (actor && !context.actors[actor]) {
    reasons.push("actor key is unknown");
  }

  if (target && !context.actors[target]) {
    reasons.push("target key is unknown");
  }

  for (const [key, value] of Object.entries(event)) {
    if ((key === "to_hp" || key === "from_hp") && typeof value === "number" && value < 0) {
      reasons.push(`${key} must not be below 0`);
    }
  }

  return reasons;
}

export function validateCombatEvents(
  events: unknown[],
  context: CombatValidationContext
): ValidationResult<Record<string, unknown>> {
  return events.reduce<ValidationResult<Record<string, unknown>>>(
    (result, event) => {
      const reasons = combatEventReasons(event, context);

      if (reasons.length > 0 || !isRecord(event)) {
        result.discarded.push({ item: event, reasons });
      } else {
        result.accepted.push(event);
      }

      return result;
    },
    { accepted: [], discarded: [] }
  );
}

function memoryPatchReasons(
  patch: unknown,
  existingContextIds: Set<string>
) {
  const reasons: string[] = [];

  if (!isRecord(patch)) {
    return ["memory patch must be an object"];
  }

  const operation = patch.operation;
  const contextId = typeof patch.context_id === "string"
    ? patch.context_id
    : typeof patch.contextId === "string"
      ? patch.contextId
      : "";
  const markdown = typeof patch.markdown === "string" ? patch.markdown : "";

  if (
    operation !== "append" &&
    operation !== "replace_section" &&
    operation !== "create_chunk" &&
    operation !== "archive_chunk"
  ) {
    reasons.push("operation is not allowed");
  }

  if (
    (operation === "append" ||
      operation === "replace_section" ||
      operation === "archive_chunk") &&
    (!contextId || !existingContextIds.has(contextId))
  ) {
    reasons.push("target context_id does not exist");
  }

  if ((operation === "append" || operation === "replace_section") && !markdown.trim()) {
    reasons.push("markdown is required");
  }

  if (markdown.length > 12000) {
    reasons.push("markdown is too large");
  }

  if (operation === "create_chunk") {
    const contextType = patch.context_type ?? patch.contextType;
    const visibility = patch.visibility;

    if (!contextId || existingContextIds.has(contextId)) {
      reasons.push("new context_id must be unique");
    }

    if (!contextCategories.includes(contextType as ContextCategory)) {
      reasons.push("context_type is invalid");
    }

    if (visibility !== "player_safe" && visibility !== "dm_only") {
      reasons.push("visibility is invalid");
    }

    if (!markdown.trim()) {
      reasons.push("markdown is required");
    }
  }

  return reasons;
}

export function validateMemoryPatches(
  patches: unknown[],
  existingContextIds: Set<string>
): ValidationResult<Record<string, unknown>> {
  return patches.reduce<ValidationResult<Record<string, unknown>>>(
    (result, patch) => {
      const reasons = memoryPatchReasons(patch, existingContextIds);

      if (reasons.length > 0 || !isRecord(patch)) {
        result.discarded.push({ item: patch, reasons });
      } else {
        result.accepted.push(patch);
      }

      return result;
    },
    { accepted: [], discarded: [] }
  );
}
