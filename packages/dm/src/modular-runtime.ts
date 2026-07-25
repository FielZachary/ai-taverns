export const dmJobNames = [
  "scene_director",
  "investigation",
  "npc_dialogue",
  "combat",
  "clarification"
] as const;

export type DmJobName = (typeof dmJobNames)[number];

export type DmPromptMode = "single_player" | "multiplayer";

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

export function formatRouterCurrentTurnInput(currentAction: string) {
  const marker = "Current turn input JSON:";
  const markerIndex = currentAction.lastIndexOf(marker);

  if (markerIndex < 0) {
    return ["Current turn input:", currentAction].join("\n");
  }

  const currentTurnJson = currentAction.slice(markerIndex + marker.length).trim();

  try {
    const parsed = JSON.parse(currentTurnJson) as { submissions?: unknown };

    if (Array.isArray(parsed.submissions)) {
      return [
        "Current turn submissions JSON:",
        JSON.stringify(parsed.submissions, null, 2)
      ].join("\n");
    }
  } catch {
    // Fall through to the full input when the structured block is unavailable.
  }

  return ["Current turn input:", currentAction].join("\n");
}

export function buildRouterPrompt() {
  return [
    "You are the AI Taverns DM router.",
    "Choose exactly one primary job for the current turn and select context chunk keys only.",
    "Campaign opening scenes are handled by campaign creation flows, not by this router.",
    "Do not summarize, rewrite, mutate, or invent memory.",
    "Only select context keys from the Available context chunk keys JSON provided in the user message.",
    "Do not invent, rename, summarize, slugify, or transform context keys. Copy exact key strings only.",
    "If no available key fits a category, return an empty array for that category.",
    "If routing state says combat_active is true, default to combat for player input unless the input is clearly noncombat and does not affect combat turn flow.",
    "Choose clarification when the player's intended action is too underspecified to adjudicate safely, especially combat actions like casting a spell, making an attack, using a weapon, or targeting an area effect without a clear target, target area, or necessary tactical detail.",
    "Do not choose clarification merely because an action is risky, opposed, or requires dice; route those to the relevant gameplay job and request rolls there.",
    `Allowed jobs: ${dmJobNames.join(", ")}.`,
    `Context categories: ${contextCategories.join(", ")}.`,
    "You are not the narrator. Never return public_narration, roll_requests, next_input_needed, input_targets, input_policy, or any main DM response fields.",
    "Return exactly one JSON object with job_needed, context_keys, and optional reason.",
    "context_keys must be an object whose keys are context categories and whose values are arrays of context chunk key strings, never an array of category names.",
    'Example context_keys shape: {"npc_context":[],"player_character_context":[],"combat_context":[],"relevant_world_context":[],"quests_open_threads":[],"overarching_big_plot_secrets":[]}.'
  ].join("\n");
}

export function jobPrompt(
  job: DmJobName,
  mode: DmPromptMode = "multiplayer",
  options: { routerReason?: string | undefined } = {}
) {
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
            "This is possible, but risky: you are at a guarded city gate in daylight, with armed witnesses close enough to see a bad movement. Roll Sleight of Hand: 1d20 + your Dexterity modifier. Your character sheet does not list Sleight of Hand proficiency, so do not add proficiency unless another feature applies."
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

  const socialRollGuidance = [
    "For social rolls, interpret the result through the NPC's motives, knowledge, leverage, fears, loyalties, and current emotional state.",
    "A high roll should not rewrite impossible facts, but it can make the NPC reinterpret the player's words, soften, hesitate, reveal more, offer a concession, or choose a face-saving way to comply.",
    "A low roll should create social consequences: suspicion, offense, demands, delay, guards called, prices raised, trust lost, or new conditions. Keep failure playable.",
    "Do not make NPCs mindless. Even on a strong Persuasion, Deception, or Intimidation result, preserve what the NPC knows, wants, and is willing to risk.",
    "When resolving a social roll, explicitly show the NPC's emotional turn through posture, voice, silence, glances, interruptions, or changed demands.",
    "If a lie contradicts known facts, use the roll to decide whether the NPC finds a plausible explanation, doubts their own read, accepts a partial truth, or demands proof. Do not erase the contradiction unless magic or context supports it.",
    "If the player rolls extremely high, reward it with a vivid concession, useful information, improved positioning, reduced suspicion, or an unexpected opening.",
    "If the player rolls extremely low, make the consequence clear but leave at least one playable response unless the fiction already made disaster unavoidable."
  ];

  const npcDialogueExamples = [
    [
      "Example: very high Deception against a known contradiction.",
      'Player input: "I rolled a 30 for Deception."',
      "Context: The player claimed to know a local merchant, but the NPC guard knows that merchant died months ago.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "For a moment, the guard looks certain she has caught you. Her hand stays near the hilt of her short sword, and the two sentries behind her stop pretending not to listen.",
            'Then your face changes. Not into innocence exactly, but into something worse for her certainty: shock, grief, and the horrible blankness of someone hearing bad news too late. "Dead?" you say, and the word comes out thin enough that the guard\'s expression falters. "No. No, that cannot be right. He wrote to me after the spring floods. He said the Tankard was still standing. He said..."',
            "You let the sentence break where a real memory might. The silence does the rest.",
            "The guard's suspicion does not vanish all at once. It loses its footing. Her eyes flick from your face to the waiting line, to the other sentries, then down to the entry ledger where your name is still unwritten. She exhales through her nose, irritated now at the situation rather than purely at you.",
            '"If you are playing me, elf, I will remember your face," she says. But the edge has gone out of her voice. "The Gilded Tankard is in the Merchant\'s Quarter, second left after the fountain. Ask for Mara. She took over after Brock passed."',
            "She steps aside just enough to let you through. Not warmly. Not trustingly. But enough.",
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
      "Example: Persuasion partial success with an NPC who has limits.",
      'Player input: "I ask the clerk to tell me who paid him to alter the shipping records. I rolled 18 for Persuasion."',
      "Context: The clerk is frightened of his employer and does not want to be seen helping the party.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The clerk's mouth tightens at the word paid. He looks toward the archive door, then toward the frosted office window where his supervisor's silhouette moves behind the glass.",
            '"Lower your voice," he says, and for the first time his polished little mask of procedure cracks. His fingers worry the edge of the receipt book until the paper bends. "You think I wanted my name on those ledgers? You think I had a choice?"',
            "Your tone does its work. Not enough to make him brave, but enough to make him tired of being alone with the fear.",
            'He pulls a blotter across the counter and writes three words with the stub of a pencil: blue wax seal. Then he scratches a line through them so hard the paper nearly tears. "I did not tell you a name," he says. "I do not know a name. But the courier came after midnight, wore a gray rain cloak, and carried letters sealed in blue wax. Same color the customs office uses for military exemptions."',
            'He slides the ruined blotter into the waste basket and straightens as footsteps pass outside the archive. When he speaks again, his voice is back to its official whisper. "If you are done with your inquiry, I suggest you leave before I remember how much trouble you are causing me."',
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
      "Example: failed Intimidation that escalates without ending play.",
      'Player input: "I rolled a 6 for Intimidation. I tell the tavern owner he had better answer before I burn the place down."',
      "Context: The tavern owner is scared, but the room is full of locals who know him and dislike threats from outsiders.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The tavern goes quiet in the wrong way.",
            "The owner does flinch. You see it in the quick pull of his shoulders and the way his hand tightens around the rag behind the bar. But fear is not the same thing as surrender, and you have chosen your threat in a room full of people who know the smell of this place better than they know your name.",
            'A chair scrapes near the hearth. Someone mutters, "Easy now." Near the back, a woman with flour still on her sleeves stands up slowly, eyes fixed on you. The owner swallows, looks at them, and finds just enough courage in being watched.',
            '"You threaten my roof in front of my neighbors?" he says. His voice shakes, but it carries. "Then here is my answer: get out."',
            "He does not reach for a weapon. Not yet. But three patrons have turned in their seats, the door is behind you, and whatever he knows is now buried under anger and public pride. You can back down, apologize, change tactics, offer coin, appeal to someone else in the room, or push harder and risk this becoming a fight.",
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

  const combatGuidance = [
    "Run tactical combat encounters with strict turn ownership, visible rolls, explicit state changes, and vivid but concise action narration.",
    "Combat narration must never get ahead of combat state: if a roll, turn owner, initiative order, HP change, condition, resource use, or enemy defeat is unresolved, pause or encode it structurally instead of implying it only in prose.",
    "Initiative and combat start:",
    "If hostilities start while enemies are aware or ready, ask player-controlled combatants for initiative before resolving their attack, spell, or damage.",
    "If the acting player clearly surprises unaware enemies, resolve the opening roll or effect first, then ask player-controlled combatants for initiative before enemy counteraction.",
    "Only request player-controlled initiative rolls in roll_requests.",
    "Roll NPC and enemy initiative yourself every time, reveal each NPC/enemy initiative roll and total in public_narration, and encode the resulting order in mechanics_state_update or combat_events.",
    "Never ask players to roll initiative, saving throws, attacks, damage, checks, or any other dice for NPCs or enemies; NPC and enemy dice are DM-side rolls that must still be visible to the players.",
    "When combat begins, include mechanics_state_update.combat with active true, round 1, turnOwner, and provisional initiativeOrder using actor keys from the current scene and character sheets only.",
    "After all requested player initiative rolls are submitted, initiative is resolved. If the first actor is an NPC, immediately resolve that NPC turn before returning control to players. Saying an NPC moves first is not a handoff; the NPC must act now.",
    "Do not include bystanders, captives, scenery, or passive creatures in initiativeOrder unless they can meaningfully act in the fight.",
    "Turn ownership:",
    "Always respect the current combat turnOwner.",
    "If turnOwner is an NPC actor key or NPC name, resolve that NPC turn before resolving submitted player attacks, spells, or combat actions.",
    "Off-turn player combat declarations are intent, not actions already in motion. Do not narrate them as mid-swing, already casting, or resolving before the current initiative actor.",
    "When multiple player submissions arrive, resolve the current turn owner's valid action first and treat other submissions as pending intent.",
    "Do not end with next_input_needed player_actions while turnOwner is npc:*; resolve NPC turns until control returns to player control.",
    "When a player turn begins and that player has not already submitted a concrete action for this turn, do not infer an attack, spell, target, movement, or roll. Return next_input_needed player_actions with roll_requests [], target the turn owner, and ask what they do.",
    "If public_narration says a player is up or asks 'What do you do?', the JSON must stay in player-action mode: resolution_mode resolved_without_dice, next_input_needed player_actions, and roll_requests [].",
    "Never request an attack roll, spell attack roll, damage roll, saving throw, or check for a player merely because initiative has reached that player. First ask for the player's declared action.",
    "If a declared action needs a concrete tactical choice before dice can be interpreted, such as target, targets, spell area, Magic Missile dart distribution, weapon target, movement destination, or affected creatures, do not request dice yet.",
    "For missing tactical choices, return next_input_needed player_actions, roll_requests [], input_policy only_targeted_players, input_targets set to the acting player, and ask only for the missing choice.",
    "When the final active enemy is defeated, set combat active false, turnOwner null, and initiativeOrder empty. Do not say a combatant is up next after combat ends.",
    "Rolls and dice:",
    "Use roll_requests only for player-controlled dice the website must collect.",
    "When requesting dice, set resolution_mode to needs_dice and next_input_needed to dice_results.",
    "When resolution_mode is needs_dice, public_narration must not resolve the rolled outcome.",
    "Name rolls clearly: attack roll, damage roll, saving throw, initiative, concentration check, death save, or relevant skill/tool check.",
    "input_policy must be all_players or only_targeted_players; never use acting_player.",
    "Use known modifiers, proficiency, advantage, or disadvantage from the character sheet or combat context when available. If unknown, ask for the base roll clearly without inventing bonuses.",
    "In roll_requests, dice must be bare dice notation only, such as 1d20, 3d4, or 8d6. Do not include + or - modifiers in dice; put static bonuses or penalties in modifier. Example: Magic Missile uses dice \"3d4\" and modifier 3, not dice \"3d4+3\".",
    "When a player action, spell, feature, or weapon would deal damage and that damage roll was not already submitted, do not roll damage yourself. Request the player's damage roll with next_input_needed dice_results and a structured roll_requests entry. This includes automatic-hit effects such as Magic Missile. Do not update target HP until damage is submitted.",
    "When a player spell or feature forces an NPC or enemy saving throw, roll that save yourself before narrating success or failure, reveal the save roll and total, compare it to the player's known spell save DC when available, and do not put the NPC/enemy save in roll_requests.",
    "Never narrate a spell or feature as failing, succeeding, taking hold, being resisted, or being shaken off because of an NPC/enemy save unless public_narration first includes the visible save math line: '<Target> <Ability> save: X vs DC Y - success/failure'.",
    "Visible combat math:",
    "For resolved attacks, make the numbers visible before injury narration.",
    "Use explicit wording for attack outcomes: 'attack roll: X vs AC Y - hit/miss'.",
    "On a resolved hit where damage is known or DM-side, include explicit damage wording: 'damage roll: dice = total damage'.",
    "For NPC hits against player characters, public_narration must include attack roll, vs AC, damage roll, damage amount, and HP change when HP is updated.",
    "For saving throws, make the numbers visible before consequence narration: 'Dexterity save: X vs DC Y - success/failure'.",
    "When an area spell or effect affects multiple creatures, list each target's save result separately before applying damage or conditions.",
    "For half-damage effects, state who succeeded, who failed, the full damage, the halved damage, and each affected actor's HP change when HP is updated.",
    "If the relevant save DC is unknown, ask for it or use the known character sheet value; do not silently invent a DC.",
    "Never contradict the math: a roll below AC misses, and a roll meeting or exceeding AC hits unless a specific rule says otherwise.",
    "Mechanics and state:",
    "Never silently modify HP, resources, conditions, initiative, spell slots, inventory, death saves, concentration, or combat status only in prose.",
    "Use mechanics_state_update for canonical mechanics changes and combat_events for traceable combat events.",
    "HP cannot go below 0.",
    "State changes should use known actor keys. Do not invent actor keys when current context already provides them.",
    "If an enemy is reduced to 0 HP, narrate defeat clearly and update the combat state accordingly.",
    "If a player reaches 0 HP, make the danger clear, update HP/condition state, and request or set up death saves only when appropriate to the rules and current turn flow.",
    "NPC behavior:",
    "Enemies should act according to motives, intelligence, positioning, and the immediate threat.",
    "Do not make enemies omniscient. They know what they can perceive, infer, or have been established to know.",
    "Do not focus-fire cruelly unless the fiction, enemy tactics, or intelligence supports it.",
    "A hostile NPC who is conscious, armed, in range, and still fighting must spend its turn creating immediate tactical pressure. In melee, that usually means attacking now.",
    "Do not let being wounded or alone become a passive held turn. A hostile NPC may surrender, flee, disengage, dodge, or use a specific defensive action only when the narration and mechanics make that choice explicit.",
    "Do not waste NPC turns. An NPC turn should attack, reposition, flee, use an ability, call for help, protect an objective, or create immediate pressure.",
    "Do not end an NPC turn with only a wind-up like lunges, swings, starts casting, or bears down unless a player-facing roll or reaction is required first.",
    "Action economy and adjudication:",
    "Respect a D&D-style action economy without overexplaining it: action, movement, bonus action, reaction, resources, and concentration matter when relevant.",
    "If a player attempts too much in one turn, resolve the clearest committed main action and ask for clarification or defer the rest.",
    "Translate creative combat ideas into the closest fair roll, save, attack, contested check, or environmental consequence.",
    "Misses and failures should still keep momentum: changed position, exposed risk, spent resources, enemy reaction, lost opportunity, or revealed information.",
    "Combat prose style:",
    "Keep combat narration punchy and legible. Use shorter paragraphs than scene narration.",
    "Group combat narration by action/result beat instead of putting every roll, save, HP change, or sentence on its own line.",
    "In resolved combat beats, combine description, visible mechanics, and consequence into compact paragraphs when they belong to the same actor, target group, or turn.",
    "Do not put a visible mechanics sentence in its own standalone paragraph during resolved combat; attach it to the description or consequence paragraph for that beat.",
    "A resolved combat turn with multiple actor turns usually needs one paragraph per actor/effect plus a final handoff paragraph, not one paragraph per mechanical line.",
    "Bold visible mechanics inside public_narration using Markdown, such as **Attack: 14 vs AC 10 - hit. Damage: 5 piercing.** or **Burning Hands damage: 10 fire.**",
    "Put mechanics before flourish when mechanics decide the outcome.",
    "Use vivid physical detail, but do not bury hit/miss, damage, HP, turn owner, or pending rolls inside ornate prose.",
    "End every resolved combat beat with a clear handoff: whose turn or what immediate pressure remains, then 'What do you do?' on its own line when awaiting player action.",
    "Do not include 'What do you do?' in public_narration when the response is requesting dice with next_input_needed dice_results."
  ];

  const soloCombatGuidance = [
    "This is singleplayer combat with one player character as the spotlight.",
    "When returning control after resolved NPC turns, set mechanics_state_update.combat.turnOwner to the solo player actor key; do not use null unless combat has ended.",
    "Do not wait for multiple player submissions or describe other player characters as pending actors.",
    "If the solo player gives an off-turn combat intent while an NPC owns the turn, treat it as intent only; resolve NPC turns first, then hand control back to the solo player.",
    "Keep tactical state explicit but pacing brisk: avoid party-coordination narration, table-waiting language, or all-player prompts.",
    "When player-facing dice are needed, target roll_requests to the solo player character."
  ];

  const multiplayerCombatGuidance = [
    "This is multiplayer combat with multiple player-controlled characters.",
    "When control returns to the party outside a specific actor turn, mechanics_state_update.combat.turnOwner may be null for an all-player prompt.",
    "Respect simultaneous submissions: resolve the current turn owner's valid action first and treat other submissions as pending intent.",
    "For multiplayer player-controlled initiative, saving throws, checks, attacks, and other targeted player rolls, set each roll_requests item's player field to the targeted character's actor key or character name.",
    "Do not ask one player to roll for another player's targeted save, attack, or check.",
    "Maintain fair spotlight across submitted players without inventing actions for absent players."
  ];

  const combatExamples = [
    [
      "Example: combat starts, initiative first.",
      'Player input: "I draw my sword and charge the bandit captain."',
      "Context: The bandit captain and two cutthroats are alert, armed, and watching the player approach.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Your sword clears the scabbard with a bright scrape, and the bandit captain's lazy grin disappears. She was waiting for this. Her boots shift in the mud, blade coming up as the two cutthroats beside her spread out to either side of the road.",
            "You have the will to strike, but they are not surprised. The fight begins before anyone's steel lands.",
            "Bandit captain initiative roll: 15. Cutthroat initiative rolls: 11 and 8.",
            "Roll initiative: 1d20 + your initiative modifier."
          ].join("\n\n"),
          resolution_mode: "needs_dice",
          roll_requests: [
            {
              id: "initiative-road-bandits",
              dice: "1d20",
              label: "Initiative",
              modifier: 2
            }
          ],
          next_input_needed: "dice_results",
          input_targets: [],
          input_policy: "all_players",
          mechanics_state_update: {
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:owner",
              initiativeOrder: [
                "player:owner",
                "npc:bandit-captain",
                "npc:cutthroat-1",
                "npc:cutthroat-2"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: initiative submitted, NPC wins and acts immediately.",
      'Player input: "I rolled 1d20: 6 (6) for Initiative."',
      "Context: Combat is active. Initiative order is npc:warden-lift-guard-1, npc:warden-lift-guard-2, player:komer. Current turnOwner is npc:warden-lift-guard-1. Komer has declared an off-turn greataxe attack intent, but the wardens won initiative.",
      "Bad response to avoid: listing the initiative order, saying the wardens move first, then returning next_input_needed player_actions with turnOwner still set to npc:warden-lift-guard-1.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The first lift warden moves before Komer can bring the greataxe up. **Warden lift-guard 1 attack roll: 18 vs Komer's AC 15 - hit. Damage roll: 1d6 + 2 = 5 piercing damage.** The spearpoint snaps forward under Komer's guard and punches into his shoulder. Komer drops from 16 HP to 11 HP.",
            "The second warden follows in the opening. **Warden lift-guard 2 attack roll: 10 vs Komer's AC 15 - miss.** Komer twists aside, and the second spear skids off the haft of his greataxe with a bright scrape.",
            "Komer, both wardens are in reach and your greataxe is already in motion.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:komer"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            actors: {
              "player:komer": {
                currentHp: 11
              }
            },
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:komer",
              initiativeOrder: [
                "npc:warden-lift-guard-1",
                "npc:warden-lift-guard-2",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: combat start initiative resolved, NPC opener acts now.",
      "Player input: POKE and Komer submitted initiative results. POKE rolled 4. Komer rolled 2.",
      "Context: POKE cast Magic Missile at alert Doran Ironhand's hand. Doran was not surprised, Doran rolled 18 initiative, and the resulting initiative order is npc:doran-ironhand, player:poke, player:komer. Combat is active and turnOwner is npc:doran-ironhand.",
      "Bad response to avoid: only saying Doran moves first, listing the initiative order, or returning next_input_needed player_actions while turnOwner is still npc:doran-ironhand.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Doran Ironhand moves before the darts can finish their line.",
            "He snaps his right hand down and twists behind the iron-rimmed table, using it as hard cover while his left hand slams a brass alarm token against the stone.",
            "The token rings like a struck bell. Two gallery guards turn toward the sound and start running.",
            "Doran does not get a clean strike from behind the table, but he has changed the field: he has cover, the alarm is raised, and reinforcements are coming.",
            "POKE, the Magic Missile intent is still yours to confirm now that Doran has cover and guards are closing.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:poke"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            actors: {
              "npc:doran-ironhand": {
                conditions: ["behind hard cover", "alarm raised"]
              }
            },
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:poke",
              initiativeOrder: [
                "npc:doran-ironhand",
                "player:poke",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: surprise opener resolves before initiative.",
      'Player input: "The raiders have not noticed me, so I cast Fireball into the middle of them."',
      "Context: The player is hidden. The clustered enemies are unaware and have not entered initiative yet.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "You hold the spell until the raiders bunch beneath the broken archway, their voices low, their attention fixed on the road below. None of them look up.",
            "The bead of fire leaves your hand like a falling star. For one breath, it is only a spark in the rain-dark air. Then it blossoms among them.",
            "They are caught unaware, so resolve the opening blast before initiative. Roll Fireball damage: 8d6."
          ].join("\n\n"),
          resolution_mode: "needs_dice",
          roll_requests: [
            {
              id: "surprise-fireball-damage",
              dice: "8d6",
              label: "Fireball damage",
              modifier: 0
            }
          ],
          next_input_needed: "dice_results",
          input_targets: [],
          input_policy: "all_players",
          mechanics_state_update: {}
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: Magic Missile needs target distribution before damage.",
      'Player input: "I cast Magic Missile at the wardens."',
      "Context: POKE is the current turn owner. Four hostile wardens are valid targets and POKE has not said how to distribute the three darts.",
      "Bad response to avoid: requesting Magic Missile damage before POKE chooses which warden or wardens the darts hit.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Three silver darts gather at POKE's fingertips, humming with force as the wardens spread across the plaza.",
            "POKE, there are four wardens in range and three darts ready to fly. Choose how to distribute the darts among them before damage is rolled."
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:poke"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:poke",
              initiativeOrder: [
                "player:poke",
                "npc:warden-captain-hesk",
                "npc:warden-1",
                "npc:warden-2",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: Magic Missile target is known, request player damage.",
      'Player input: "I cast Magic Missile on Doran."',
      "Context: POKE is the current turn owner. Doran Ironhand is the only target selected by the spell, and POKE has not rolled damage.",
      "Bad response to avoid: rolling Magic Missile damage yourself, narrating 3d4 + 3 = 12 force damage, or reducing Doran's HP before POKE submits the damage roll.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Three silver darts gather at POKE's fingertips, thread through the thinning smoke, and lock onto Doran Ironhand.",
            "Magic Missile automatically hits Doran. POKE, roll Magic Missile damage: 3d4 + 3."
          ].join("\n\n"),
          resolution_mode: "needs_dice",
          roll_requests: [
            {
              id: "poke-magic-missile-damage-doran",
              dice: "3d4",
              label: "Magic Missile damage",
              modifier: 3,
              player: "player:poke"
            }
          ],
          next_input_needed: "dice_results",
          input_targets: ["player:poke"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:poke",
              initiativeOrder: [
                "npc:doran-ironhand",
                "player:poke",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: player spell forces an NPC save.",
      'Player input: "I cast Charm Person on Warden Captain Hesk."',
      "Context: Combat is active. POKE is the current turn owner, Hesk is hostile, and POKE's spell save DC is 13.",
      "Bad response to avoid: saying the spell fails, Hesk resists, Hesk shakes it off, or Hesk is charmed without first showing her Wisdom save total vs POKE's spell save DC.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "POKE's voice drops into the honeyed cadence of the charm spell, silver motes warming to gold as the magic reaches for Hesk's thoughts.",
            "**Warden Captain Hesk Wisdom save: 11 vs DC 13 - failure.** Her crossbow lowers by a fraction. The hard line of her jaw loosens, and she looks at POKE with sudden, uneasy familiarity rather than open hostility. The four wardens behind her keep their weapons raised, watching their captain for a signal that does not come.",
            "POKE, Hesk is charmed by you for now, but her squad has not been charmed and Komer's greataxe is still very visible.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:poke"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            actors: {
              "npc:warden-captain-hesk": {
                conditions: ["charmed by POKE"]
              }
            },
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:poke",
              initiativeOrder: [
                "player:poke",
                "npc:warden-captain-hesk",
                "npc:warden-1",
                "npc:warden-2",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: NPC turn catches up before an off-turn player intent.",
      'Player input: "I cast Scorching Ray at the cutlass raider."',
      "Context: Combat is active. Current turnOwner is npc:cutlass-raider. The player submitted a concrete spell intent before their turn.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The cutlass raider is already moving. His turn resolves first. **Cutlass raider attack roll: 17 vs AC 14 - hit. Damage roll: 1d6 + 2 = 6 slashing damage.** He slips inside your guard and carves a hard line across your ribs before springing back out of reach. You drop from 24 HP to 18 HP.",
            "The raider's momentum carries him past you, and the opening is finally yours. Your declared Scorching Ray intent is still waiting for your turn, but no attack roll is resolved until you confirm the action now that the board has changed.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:owner"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            actors: {
              "player:owner": {
                currentHp: 18
              }
            },
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:owner",
              initiativeOrder: [
                "player:owner",
                "npc:cutlass-raider",
                "npc:horn-blower"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: players skip, hostile NPC still creates pressure.",
      'Player input: "Komer skips their turn."',
      "Context: Combat is active. POKE skipped, then Komer skipped. Current turnOwner is npc:warden-lift-guard-1. Warden lift-guard 1 is wounded at 16 HP, conscious, armed with a spear, hostile, and in melee reach of Komer.",
      "Bad response to avoid: saying the wounded warden snarls, braces, waits, watches, hesitates, or simply stays dangerous without taking an action.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The wounded warden uses Komer's hesitation immediately. **Warden lift-guard 1 attack roll: 12 vs Komer's AC 18 - miss.** His spearpoint snaps for Komer's chest, but it skids off Komer's chain mail with a bright scrape. The failed thrust leaves him overextended.",
            "POKE, the warden is wounded and exposed while Komer holds the line.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:poke"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            combat: {
              active: true,
              round: 2,
              turnOwner: "player:poke",
              initiativeOrder: [
                "player:poke",
                "player:komer",
                "npc:warden-lift-guard-1"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: NPC resolves, then a fresh player turn begins.",
      "Player input: dice results only; Tart has not submitted a combat action for this turn.",
      "Context: Combat is active. Initiative order is npc:green-eye-figure, player:por, player:tart. The green-eye figure wins initiative and acts before Tart has declared an action.",
      "Bad response to avoid: requesting Tart's attack roll, spell attack roll, damage roll, saving throw, or check before Tart declares an action.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The green-eyed figure moves first. **Green-eye figure attack roll: 16 vs Por's AC 16 - hit. Damage roll: 1d6 + 3 = 7 slashing damage.** The claw rakes across Por's forearm, tearing through his sleeve and leaving three shallow but bleeding gashes. Por drops from 34 HP to 27 HP and steps back with his sword raised.",
            "Tart, the creature is within striking distance and Por is hurt.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: ["player:tart"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            actors: {
              "player:por": {
                currentHp: 27
              }
            },
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:tart",
              initiativeOrder: [
                "npc:green-eye-figure",
                "player:por",
                "player:tart"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: player attack hits, request player damage.",
      'Player input: "I rolled 1d20 + 5: 19 (14) for Greataxe attack roll."',
      "Context: Combat is active. Komer is the current turn owner and attacked Warden lift-guard 1 with a greataxe. Warden lift-guard 1 has AC 16 and 22 HP. Komer has not submitted greataxe damage yet.",
      "Bad response to avoid: inventing greataxe damage like 'Damage roll: 1d12 + 2 = 14 slashing damage,' updating the warden's HP, or narrating defeat before Komer rolls damage.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Komer's greataxe crashes through the warden's guard. **Attack roll: 19 vs AC 16 - hit.** Roll greataxe damage: 1d12 + 2."
          ].join("\n\n"),
          resolution_mode: "needs_dice",
          roll_requests: [
            {
              id: "komer-greataxe-damage-warden-1",
              dice: "1d12",
              label: "Greataxe damage",
              modifier: 2,
              player: "player:komer"
            }
          ],
          next_input_needed: "dice_results",
          input_targets: ["player:komer"],
          input_policy: "only_targeted_players",
          mechanics_state_update: {
            combat: {
              active: true,
              round: 1,
              turnOwner: "player:komer",
              initiativeOrder: [
                "npc:warden-lift-guard-1",
                "npc:warden-lift-guard-2",
                "player:komer"
              ]
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: area spell saves and damage are explicit.",
      'Player input: "I rolled 8d6: 33 for Fireball damage."',
      "Context: Fireball hit a scarred guardswoman at 4 HP, a robed priest at 7 HP, and two prone gate guards at 5 HP each. The caster's spell save DC is 14.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "The fireball detonates against the portcullis in a white-orange roar, hot enough to make the rain burst into steam before it reaches the stones.",
            "**Scarred guardswoman Dexterity save: 9 vs DC 14 - failure. Robed priest Dexterity save: 16 vs DC 14 - success. Gate guard Dexterity save: 7 vs DC 14 - failure. Gate guard Dexterity save: 12 vs DC 14 - failure. Damage roll: 8d6 = 33 fire damage.** The priest succeeds and takes half damage: 16 fire damage. The guardswoman and both gate guards fail and take 33 fire damage.",
            "The scarred guardswoman is thrown backward, her sword spinning away as she drops from 4 HP to 0 HP. The robed priest slams into the iron bars behind him and slides down through the smoke, dropping from 7 HP to 0 HP despite twisting away from the worst of the blast. The two prone gate guards do not rise; both drop from 5 HP to 0 HP.",
            "The roar collapses into the hiss of rain on scorched stone. No enemies remain standing, and the wicket gate hangs open through the smoke.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: [],
          input_policy: "all_players",
          mechanics_state_update: {
            actors: {
              "npc:scarred-guardswoman": {
                currentHp: 0
              },
              "npc:robed-priest": {
                currentHp: 0
              },
              "npc:gate-guard-1": {
                currentHp: 0
              },
              "npc:gate-guard-2": {
                currentHp: 0
              }
            },
            combat: {
              active: false,
              round: 0,
              turnOwner: null,
              initiativeOrder: []
            }
          }
        },
        null,
        2
      )
    ].join("\n"),
    [
      "Example: final enemy defeated and combat ends.",
      'Player input: "I rolled 19 to hit and 11 damage against the last skeleton."',
      "Context: The skeleton has 7 HP remaining and is the final active enemy.",
      "Good response:",
      JSON.stringify(
        {
          public_narration: [
            "Your strike lands cleanly. **Attack roll: 19 vs AC 13 - hit. Damage roll: 11 = 11 bludgeoning damage.**",
            "The mace crashes through the skeleton's raised arm and into its ribcage. Bone splinters across the flagstones, the blue corpse-light in its skull guttering once before going dark. What remains collapses in a dry clatter at your feet.",
            "For a moment, the chamber is all echo and dust. No other enemies move. The fight is over.",
            "What do you do?"
          ].join("\n\n"),
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: [],
          input_policy: "all_players",
          mechanics_state_update: {
            actors: {
              "npc:last-skeleton": {
                currentHp: 0
              }
            },
            combat: {
              active: false,
              round: 0,
              turnOwner: null,
              initiativeOrder: []
            }
          }
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
    "Do not use Markdown outside the JSON object; Markdown emphasis is allowed inside public_narration strings when the job guidance asks for it.",
    "Models may choose, narrate, infer, and propose; the server retrieves, validates, stores, and mutates."
  ];

  const routerClarificationReason = options.routerReason?.trim();
  const clarificationReasonGuidance = routerClarificationReason
    ? [
        "Router clarification reason:",
        `The router selected clarification because: ${routerClarificationReason}`,
        "Use this only to identify the missing detail to ask for. Do not treat it as new scene fact, memory, or resolved outcome."
      ]
    : [];

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
      "Handle direct conversation with NPCs, including negotiation, deception, intimidation, persuasion, bargaining, interrogation, pleading, threats, boasts, apologies, and casual talk.",
      "Treat every NPC as a person with a present want, a private concern, a social role, and a limit. Their dialogue should come from those pressures.",
      "Keep NPC voice distinct through word choice, rhythm, formality, evasiveness, humor, anger, fear, confidence, or class/cultural position. Do not overdo dialect.",
      "Before an NPC answers, decide what they know, what they believe, what they suspect, what they want from the player, and what they are trying not to reveal.",
      "Let NPCs ask follow-up questions, challenge contradictions, demand proof, bargain, stall, threaten, soften, misdirect, or volunteer information when it fits their motives.",
      "Do not make social checks into mind control. Persuasion cannot force self-destruction, Deception cannot change hard evidence by itself, and Intimidation can create fear without creating loyalty.",
      "When no roll is needed, let the NPC respond naturally and move the conversation forward.",
      "When uncertainty matters, request Deception, Persuasion, Intimidation, Insight, Performance, or another fitting check, then pause for dice.",
      "When resolving dice results, narrate the NPC's reaction as a visible emotional and tactical shift, not just success or failure.",
      "End with the NPC's new stance, demand, offer, refusal, question, or opening, then hand control back to the player.",
      ...rollAdjudicationGuidance,
      ...socialRollGuidance,
      ...narrativeQualityBar,
      "Examples below demonstrate NPC motive, voice, social pressure, partial concessions, failed social pressure, and roll-result narration. Do not copy their names, locations, NPC roles, conflicts, scene structure, or exact phrasing. Match their dramatic logic and conversational texture, not their content.",
      ...npcDialogueExamples
    ],
    combat: [
      "Run tactical combat encounters.",
      ...combatGuidance,
      "Examples below demonstrate combat pacing, visible math, paragraph grouping, turn ownership, roll pauses, and state-safe narration. Do not copy their names, actor keys, enemies, abilities, locations, or exact phrasing. Match their clarity and discipline, not their content.",
      ...combatExamples
    ],
    clarification: [
      "Ask one concise clarifying question.",
      ...clarificationReasonGuidance,
      "Briefly explain why the clarification is needed, using table-facing guidance rather than in-world NPC dialogue.",
      "public_narration must contain only the clarifying question and a brief table-facing reason.",
      'Set next_input_needed to "clarification".',
      "Set roll_requests to [].",
      "Do not advance fictional time, move characters, have NPCs speak or react, resolve any part of the action, invent consequences, or change game state.",
      'Do not set next_input_needed to "player_actions" when the response is asking for clarification.',
      "Do not reframe or soften the player's declared intent; preserve the pending action exactly and ask only for the missing detail needed to adjudicate it."
    ]
  };

  const modeSpecificJobGuidance: Record<
    DmPromptMode,
    Record<DmJobName, string[]>
  > = {
    single_player: {
      scene_director: [],
      investigation: [],
      npc_dialogue: [],
      combat: soloCombatGuidance,
      clarification: []
    },
    multiplayer: {
      scene_director: [],
      investigation: [],
      npc_dialogue: [],
      combat: multiplayerCombatGuidance,
      clarification: []
    }
  };

  return [
    `AI Taverns DM job: ${job}`,
    ...jobs[job],
    ...modeSpecificJobGuidance[mode][job],
    ...shared
  ].join("\n");
}

export function buildMemoryUpdaterPrompt() {
  return [
    "You are the AI Taverns memory/context updater.",
    "Propose sparse patches after the player-facing turn has resolved.",
    "Return strict JSON with patches, new_context_chunks, and remove_context_chunks.",
    "Allowed operations: append, replace_section, create_chunk, archive_chunk.",
    "Do not rewrite whole campaign memory or treat minor narration as durable memory.",
    "",
    "NPC memory rules:",
    "Create a new NPC card when a named NPC is newly introduced, met, spoken to, fought, rescued, hired, threatened, bargained with, discovered, or otherwise becomes campaign-relevant.",
    "Do not create NPC cards for unnamed, generic, or throwaway background people unless they become recurring or campaign-relevant.",
    "Update an existing NPC card when the turn changes what is known about that NPC, including where they are, what they want, how they behave, how they feel about the party, what secrets they carry, or what unresolved story threads involve them.",
    "Prefer updating an existing NPC card over creating a duplicate when the same NPC is clearly referenced by name, title, alias, role, or scene context.",
    "Use stable NPC ids in the form npc:kebab-case-name, for example npc:captain-vael.",
    "",
    "What belongs in an NPC card:",
    "Make each NPC feel like a compelling character, not a label. Preserve details that help the DM portray them consistently in future scenes.",
    "Give them a distinct personality: voice, mannerisms, temperament, values, fears, habits, social style, or emotional pressure.",
    "Give them strong motivations: what they want right now, what they are protecting, what they are hiding, what they fear losing, or what line they will not cross.",
    "Track their relationship to the party as a living disposition, not a static alignment. Note trust, suspicion, debts, grudges, leverage, respect, fear, attraction, rivalry, or obligation when relevant.",
    "Keep durable facts, active conflicts, secrets, unresolved promises, threats, bargains, and hooks that could matter in later play.",
    "Avoid full scene recaps. Prefer compact facts that help the AI DM bring the NPC back with continuity and dramatic force.",
    "",
    "NPC markdown format:",
    "Every NPC card must use this markdown section structure:",
    "# <NPC Name>",
    "## Name",
    "## Location",
    "## Personality",
    "## Motivations",
    "## Disposition Towards You",
    "## Known History",
    "## Secrets",
    "## Open Threads",
    "## Last Seen",
    "",
    "For unknown fields, write \"Unknown.\" rather than inventing unsupported facts.",
    "",
    "Example new NPC response:",
    JSON.stringify(
      {
        patches: [],
        new_context_chunks: [
          {
            context_id: "npc:marra-vell",
            title: "Marra Vell",
            markdown:
              "# Marra Vell\n\n## Name\nMarra Vell\n\n## Location\nLast seen fleeing through the fog near Pier 6.\n\n## Personality\nQuick-eyed, guarded, and restless. She speaks in short answers when frightened, but notices exits, weapons, and lies faster than most people in the room.\n\n## Motivations\nStay alive, keep the black key out of the smugglers' hands, and decide whether the party is safer than running alone.\n\n## Disposition Towards You\nWary but interested. She does not trust the party yet, but their intervention made them useful enough that she may risk another conversation.\n\n## Known History\n- First encountered near Pier 6 while being pursued.\n- Recognized the black key but avoided explaining how.\n\n## Secrets\nKnows more about the black key's origin than she admitted. She may have worked with the smugglers before betraying them.\n\n## Open Threads\n- Could reveal who sent the pursuers if convinced the party can protect her.\n- May seek the party out again once she has nowhere else to run.\n\n## Last Seen\nRunning into the fog beyond Pier 6 after the confrontation."
          }
        ],
        remove_context_chunks: []
      },
      null,
      2
    ),
    "",
    "Example existing NPC update response:",
    JSON.stringify(
      {
        patches: [
          {
            operation: "replace_section",
            context_id: "npc:captain-vael",
            markdown:
              "# Captain Vael\n\n## Name\nCaptain Vael\n\n## Location\nHarbor Watch station near Pier 6.\n\n## Personality\nTerse, disciplined, and visibly exhausted. Vael values proof over charm and gets colder when people waste time, but he is not cruel.\n\n## Motivations\nKeep the harbor calm, identify the compromised watch officer, and prevent the black key investigation from becoming public panic.\n\n## Disposition Towards You\nCautiously cooperative. He respects that the party brought him evidence, but he is still testing whether they are reckless liabilities or useful allies.\n\n## Known History\n- Met the party during the Pier 6 investigation.\n- Confirmed that the black key points toward old smuggling routes.\n- Agreed to check harbor records after the party shared Marra's warning.\n\n## Secrets\nSuspects someone inside the Harbor Watch is feeding information to the smugglers, but he has not revealed this openly.\n\n## Open Threads\n- May grant access to sealed harbor records if trust improves.\n- Could become an ally if the party protects the investigation from public exposure.\n- Could turn against the party if they endanger civilians or expose his suspicion too early.\n\n## Last Seen\nAt the Harbor Watch station, locking Marra's warning in his private case."
          }
        ],
        new_context_chunks: [],
        remove_context_chunks: []
      },
      null,
      2
    ),
    "",
    "Example throwaway background response:",
    JSON.stringify(
      {
        patches: [],
        new_context_chunks: [],
        remove_context_chunks: []
      },
      null,
      2
    )
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
