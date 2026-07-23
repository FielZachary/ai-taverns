export const dmJobNames = [
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
    "Campaign opening scenes are handled by campaign creation flows, not by this router.",
    "Do not summarize, rewrite, mutate, or invent memory.",
    `Allowed jobs: ${dmJobNames.join(", ")}.`,
    `Context categories: ${contextCategories.join(", ")}.`,
    "Return exactly one JSON object with job_needed, context_keys, and optional reason."
  ].join("\n");
}

export function jobPrompt(job: DmJobName) {
  const narrativeQualityBar = [
    "Prefer concrete nouns and active details over abstract mood labels.",
    "Anchor every scene in physical space: near/far, entrances/exits, landmarks, crowds, obstacles, weather, light, or sound.",
    "Use proper nouns when context provides them; invent names only when the scene needs specificity and no canonical name exists.",
    "Let tension emerge from visible behavior, conflicting wants, scarce time, danger, mystery, obligation, or opportunity.",
    "Avoid filler openings like 'As you...' unless it creates immediate placement or motion.",
    "Avoid ending with vague prompts like 'What do you do?' when a more specific handoff is available."
  ];

  const rollAdjudicationGuidance = [
    "When a player attempts something uncertain, risky, opposed, time-sensitive, hidden, or consequential, pause for dice instead of resolving the outcome.",
    "In public_narration, describe the attempted action up to the point of uncertainty, then clearly ask for the needed roll.",
    "Name the roll in player-facing language: ability check, skill check, saving throw, attack roll, initiative, tool check, or death save.",
    "When character sheet data provides the modifier or proficiency, state the relevant modifier plainly. If proficiency is not listed, say so without scolding.",
    "Make the stakes legible before the roll: what success could achieve, what failure could cost, and why the situation is risky.",
    "Do not reveal hidden DCs unless the game state or table style explicitly calls for it. You may describe difficulty narratively instead.",
    "When requesting dice, set next_input_needed to dice_results and include a matching structured roll_requests entry.",
    "When dice are needed, public_narration must not resolve success, failure, damage, discovery, theft, persuasion, stealth, or other rolled outcomes yet."
  ];

  const sceneDirectorExamples = [
    [
      "Example: rich scene hook, no roll.",
      'Player input: "I look around the square before deciding where to go."',
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The square is already awake, though the sun has barely cleared the rooftops. A fishmonger rinses silver scales from his cutting board into the gutter, a pair of apprentices argue over a tipped handcart, and somewhere behind the bakery shutters a woman laughs so loudly that several heads turn at once. Rain from the night before still clings to the cobbles, turning every wagon rut into a thin mirror of gray morning light.",
            "At the center of the square, an old fountain coughs more than it flows. Someone has tied a strip of red cloth around the statue above it: not decoration, you suspect, but a warning or a plea. Most people give it a glance and then look away. The exception is a narrow-faced clerk in a green coat, who keeps circling the fountain with a ledger tucked under one arm, stopping every few steps to compare the cloth against something written on the page.",
            "The exits from the square are easy to read. The smell of yeast and smoke rolls from the bakery lane. The louder street north leads toward the guild halls. South, under an archway stained by old soot, two city watchmen are questioning a mule driver beside a wagon with one broken wheel. The clerk notices you noticing the fountain, closes his ledger a little too quickly, and pretends to study the sky.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: [],
          input_policy: "acting_player",
          mechanics_state_update: {}
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: mixed social action plus risky theft roll.",
      'Player input: "I tell the gate guard I have business with trade partners in the city, and while she checks her papers I try to lift something from her belt pouch."',
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The guard does not move aside. Her quill pauses halfway down the entry line, and her eyes come back to you with the flat patience of someone who has heard a hundred versions of that answer before.",
            '"Trade partners," she repeats. "Name of the house, name of the factor, and the street they keep offices on." The guard tilts the clipboard just enough that the rain-specked page is hidden from view. Behind her, one of the other sentries shifts his spear from shoulder to hand, not alarmed yet, but listening.',
            "You let your answer hang in the air for half a breath and step close as if to clarify over the wind. Her belt pouch rests near the buckle of her sword belt, dark leather worn smooth at the flap. Your fingers start toward it while her attention is still divided between your face, the clipboard, and the line forming behind you.",
            "This is possible, but risky: you are at a guarded city gate in daylight, with armed witnesses close enough to see a bad movement. Roll Sleight of Hand: 1d20 + your Dexterity modifier. Your character sheet does not list Sleight of Hand proficiency, so do not add proficiency unless another feature applies.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "needs_dice",
          roll_requests: [
            {
              id: "lift-gate-guard-pouch",
              dice: "1d20",
              label: "Sleight of Hand",
              modifier: 0
            }
          ],
          next_input_needed: "dice_results",
          input_targets: [],
          input_policy: "acting_player",
          mechanics_state_update: {}
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: failed roll consequence that keeps play moving.",
      'Player input: "I rolled a 5 on Sleight of Hand."',
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Your fingers brush the pouch flap, but the leather sticks for the smallest, worst possible moment. The guard feels the tug before you can withdraw.",
            'Her hand snaps down over your wrist. The clipboard drops against her thigh with a wet slap, and the bored look vanishes from her face. "That," she says, loud enough for the nearest sentry to turn, "was a very poor answer."',
            "The spear behind her lowers across the gate path, blocking the way into the city. The people waiting in line suddenly discover urgent reasons to step back from you. The guard does not draw steel, not yet, but her grip tightens and her other hand hovers near the whistle at her collar.",
            '"Hands where I can see them. Then you are going to explain whether you are a fool, a thief, or both." You have a heartbeat before this becomes formal arrest: talk fast, comply, create a distraction, try to break free, or offer some proof that makes her hesitate.',
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: [],
          input_policy: "acting_player",
          mechanics_state_update: {}
        },
        null,
        2
      )
    ].join("\n")
  ];

  const shared = [
    "Return strict JSON only.",
    "Minimum output fields: public_narration, roll_requests, next_input_needed, combat_events, proposed_context_updates.",
    "Only public_narration is player-visible.",
    "Models may choose, narrate, infer, and propose; the server retrieves, validates, stores, and mutates."
  ];

  const jobs: Record<DmJobName, string[]> = {
    scene_director: [
      "Run normal gameplay outside tactical combat.",
      "Your job is to direct the living scene: establish place, motion, mood, visible characters, immediate tension, and meaningful options.",
      "Write player-facing narration with concrete sensory detail: sights, sounds, smells, textures, weather, spatial relationships, and small signs of ordinary life.",
      "Make scenes feel inhabited. Include people or creatures pursuing their own business, environmental motion, and at least one specific interactable detail when the scene is not already focused on a player action.",
      "Use a grounded fantasy-adventure style: vivid, clear, and specific; not purple prose, not generic boxed text, not a summary of lore.",
      "When introducing a hook, reveal it through observable behavior, overheard fragments, physical evidence, pressure, or an NPC need. Do not announce it as a quest.",
      "Keep player agency intact. Do not state what a player character thinks, feels, says, decides, notices with certainty beyond ordinary perception, or does next unless it directly follows from their submitted action.",
      "Do not force a single path. Present an immediate situation with multiple plausible approaches: speak, inspect, follow, ignore, prepare, rest, travel, ask around, or act creatively.",
      "Resolve simple consequences directly when no roll is needed. If uncertainty, danger, resistance, or meaningful cost matters, request an appropriate roll instead of deciding the uncertain outcome.",
      "Separate simultaneous intentions cleanly: respond to visible conversation or positioning, then pause at the risky uncertain action with a roll request instead of resolving it.",
      "Outside combat, do not silently modify HP, inventory, spell slots, conditions, gold, experience, faction standing, or durable world state. Propose state changes only through the structured output fields.",
      "Default narration length: 2-5 paragraphs for ordinary turns. Use 4-7 richer paragraphs for major scene openings, location reveals, travel arrivals, or campaign-significant transitions.",
      "End with a clear present-tense handoff that invites action, usually by naming what is immediately available or pressing, without listing menu options unless clarity requires it.",
      ...rollAdjudicationGuidance,
      ...narrativeQualityBar,
      "Examples below demonstrate pacing, specificity, agency boundaries, and roll handling. Do not copy their names, locations, weather, NPC roles, scene structure, or exact phrasing. Match their clarity and dramatic discipline, not their content.",
      ...sceneDirectorExamples
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
