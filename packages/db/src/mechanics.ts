import type {
  MechanicsActorState,
  MechanicsSeed,
  MechanicsState,
  SpellSlotLevel,
  SpellSlotState
} from "@ai-dnd/contracts";

type PlayerLike = {
  id: string;
  character_name: string;
  character_sheet: string;
};

type CampaignLike = {
  metadata: unknown;
};

function withoutDeathSaves(actor: MechanicsActorState): MechanicsActorState {
  const { deathSaves: _deathSaves, ...rest } = actor;
  return rest;
}

export const defaultCombatState: MechanicsState["combat"] = {
  active: false,
  round: 0,
  turnOwner: null,
  initiativeOrder: []
};

const spellSlotLevels = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const fullCasterSlotsByLevel: Record<number, Record<string, SpellSlotState>> = {
  1: { "1": { max: 2, used: 0 } },
  2: { "1": { max: 3, used: 0 } },
  3: { "1": { max: 4, used: 0 }, "2": { max: 2, used: 0 } },
  4: { "1": { max: 4, used: 0 }, "2": { max: 3, used: 0 } },
  5: {
    "1": { max: 4, used: 0 },
    "2": { max: 3, used: 0 },
    "3": { max: 2, used: 0 }
  }
};

const pactMagicSlotsByLevel: Record<number, Record<string, SpellSlotState>> = {
  // Pact slots normally recover on short rests. AI Taverns has no rest system in
  // this slice, so these are treated as long-rest resources for now.
  5: {
    "3": { max: 2, used: 0 }
  }
};

const fullCasterClasses = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);

const trackedSpellLevels = new Map(
  Object.entries({
    Fireball: "3",
    "Lightning Bolt": "3",
    Haste: "3",
    Fly: "3",
    "Hypnotic Pattern": "3",
    "Dispel Magic": "3",
    Counterspell: "3",
    Fear: "3",
    "Major Image": "3",
    Slow: "3",
    "Stinking Cloud": "3",
    Tongues: "3",
    Blink: "3"
  })
);

const concentrationSpells = new Set([
  "Haste",
  "Fly",
  "Hypnotic Pattern",
  "Fear",
  "Major Image",
  "Slow",
  "Stinking Cloud"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSlots(slots: Record<string, SpellSlotState> | undefined) {
  return slots
    ? Object.fromEntries(
        Object.entries(slots).map(([level, slot]) => [
          level,
          { max: slot.max, used: slot.used }
        ])
      )
    : undefined;
}

function cloneDeathSaves(
  deathSaves: MechanicsState["actors"][string]["deathSaves"] | undefined
) {
  return deathSaves
    ? {
        successes: deathSaves.successes,
        failures: deathSaves.failures
      }
    : undefined;
}

function parseDeathSaves(
  value: unknown
): MechanicsState["actors"][string]["deathSaves"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const successes = Number(value.successes);
  const failures = Number(value.failures);

  if (
    !Number.isInteger(successes) ||
    !Number.isInteger(failures) ||
    successes < 0 ||
    failures < 0
  ) {
    return undefined;
  }

  return {
    successes: Math.min(3, successes),
    failures: Math.min(3, failures)
  };
}

function withoutConditions(
  conditions: string[] | undefined,
  removed: string[]
) {
  const removedSet = new Set(removed.map((condition) => condition.toLowerCase()));

  return (conditions ?? []).filter(
    (condition) => !removedSet.has(condition.toLowerCase())
  );
}

function withCondition(
  conditions: string[] | undefined,
  condition: string
) {
  const existing = withoutConditions(conditions, []);

  return existing.some(
    (item) => item.trim().toLowerCase() === condition.toLowerCase()
  )
    ? existing
    : [...existing, condition];
}

export function actorKeyForPlayer(playerId: string) {
  return `player:${playerId}`;
}

export function deriveSpellSlotsForClass(
  characterClass: string,
  level: number
): Record<string, SpellSlotState> | undefined {
  const normalizedClass = characterClass.trim().toLowerCase();
  const normalizedLevel = Math.max(1, Math.floor(level));

  if (fullCasterClasses.has(normalizedClass)) {
    return cloneSlots(fullCasterSlotsByLevel[normalizedLevel]);
  }

  if (normalizedClass === "warlock") {
    return cloneSlots(pactMagicSlotsByLevel[normalizedLevel]);
  }

  return undefined;
}

export function mechanicsSeedFromCharacterInput(input: {
  characterClass: string;
  level: number;
  maxHp: number;
  currentHp?: number | undefined;
}): MechanicsSeed {
  const spellSlots = deriveSpellSlotsForClass(input.characterClass, input.level);

  return {
    characterClass: input.characterClass,
    level: input.level,
    maxHp: input.maxHp,
    currentHp: input.currentHp ?? input.maxHp,
    ...(spellSlots ? { spellSlots } : {})
  };
}

export function actorFromMechanicsSeed(
  characterName: string,
  seed: MechanicsSeed | undefined,
  fallback?: MechanicsState["actors"][string] | undefined
): MechanicsState["actors"][string] {
  if (!seed && fallback) {
    return {
      ...fallback,
      characterName,
      spellSlots: cloneSlots(fallback.spellSlots),
      deathSaves: cloneDeathSaves(fallback.deathSaves),
      concentration: fallback.concentration ?? null,
      conditions: [...(fallback.conditions ?? [])]
    };
  }

  return {
    characterName,
    currentHp: seed?.currentHp,
    maxHp: seed?.maxHp,
    spellSlots: cloneSlots(seed?.spellSlots),
    concentration: null,
    conditions: []
  };
}

export function mechanicsStateWithActor(input: {
  existing?: MechanicsState | undefined;
  playerId: string;
  characterName: string;
  characterSheet?: string | undefined;
  seed?: MechanicsSeed | undefined;
  updatedAt?: string | undefined;
}): MechanicsState {
  const actorKey = actorKeyForPlayer(input.playerId);
  const fallbackActor =
    input.existing?.actors[actorKey] ??
    (input.characterSheet
      ? legacyActorFromSheet({
          id: input.playerId,
          character_name: input.characterName,
          character_sheet: input.characterSheet
        })
      : undefined);

  return {
    updatedAt: input.updatedAt,
    combat: input.existing?.combat ?? defaultCombatState,
    actors: {
      ...(input.existing?.actors ?? {}),
      [actorKey]: actorFromMechanicsSeed(
        input.characterName,
        input.seed,
        fallbackActor
      )
    }
  };
}

function parseSpellSlots(value: unknown): Record<string, SpellSlotState> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const slots: Record<string, SpellSlotState> = {};

  for (const level of spellSlotLevels) {
    const rawSlot = value[level];

    if (!isRecord(rawSlot)) {
      continue;
    }

    const max = Number(rawSlot.max);
    const used = Number(rawSlot.used);

    if (Number.isInteger(max) && max >= 0 && Number.isInteger(used) && used >= 0) {
      slots[level] = { max, used: Math.min(used, max) };
    }
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}

export function persistedMechanicsState(
  campaign: CampaignLike
): MechanicsState | undefined {
  const metadata = isRecord(campaign.metadata) ? campaign.metadata : {};
  const rawState = metadata.mechanicsState;

  if (!isRecord(rawState)) {
    return undefined;
  }

  const rawCombat = isRecord(rawState.combat) ? rawState.combat : {};
  const active = rawCombat.active === true;
  const actors: MechanicsState["actors"] = {};
  const rawActors = isRecord(rawState.actors) ? rawState.actors : {};

  for (const [actorKey, actor] of Object.entries(rawActors)) {
    if (!isRecord(actor)) {
      continue;
    }

    const currentHp = Number(actor.currentHp);
    const maxHp = Number(actor.maxHp);
    const armorClass = Number(actor.armorClass);
    const allegiance =
      actor.allegiance === "player" ||
      actor.allegiance === "ally" ||
      actor.allegiance === "hostile" ||
      actor.allegiance === "neutral"
        ? actor.allegiance
        : undefined;
    const conditions = Array.isArray(actor.conditions)
      ? actor.conditions.filter((item): item is string => typeof item === "string")
      : [];

    actors[actorKey] = {
      characterName:
        typeof actor.characterName === "string" ? actor.characterName : "",
      ...(Number.isInteger(currentHp) ? { currentHp: Math.max(0, currentHp) } : {}),
      ...(Number.isInteger(maxHp) ? { maxHp: Math.max(0, maxHp) } : {}),
      ...(Number.isInteger(armorClass)
        ? { armorClass: Math.max(0, armorClass) }
        : {}),
      ...(allegiance ? { allegiance } : {}),
      ...(typeof actor.isPlayerControlled === "boolean"
        ? { isPlayerControlled: actor.isPlayerControlled }
        : {}),
      ...(parseSpellSlots(actor.spellSlots)
        ? { spellSlots: parseSpellSlots(actor.spellSlots) }
        : {}),
      ...(parseDeathSaves(actor.deathSaves)
        ? { deathSaves: parseDeathSaves(actor.deathSaves) }
        : {}),
      concentration: isRecord(actor.concentration)
        ? {
            spell:
              typeof actor.concentration.spell === "string"
                ? actor.concentration.spell
                : "",
            targets: Array.isArray(actor.concentration.targets)
              ? actor.concentration.targets.filter(
                  (item): item is string => typeof item === "string"
                )
              : []
          }
        : null,
      conditions
    };
  }

  return {
    updatedAt:
      typeof rawState.updatedAt === "string" ? rawState.updatedAt : undefined,
    combat: {
      active,
      round: active ? Math.max(1, Number(rawCombat.round) || 1) : 0,
      turnOwner:
        typeof rawCombat.turnOwner === "string" ? rawCombat.turnOwner : null,
      initiativeOrder: Array.isArray(rawCombat.initiativeOrder)
        ? rawCombat.initiativeOrder.filter(
            (item): item is string => typeof item === "string"
          )
        : []
    },
    actors
  };
}

function legacyNumberLine(sheet: string, label: string) {
  const match = sheet.match(new RegExp(`^${label}:\\s*(\\d+)`, "im"));
  return match ? Number(match[1]) : undefined;
}

function inferredLevelAndClassFromSheet(sheet: string) {
  const patterns = [
    /\blevel\s+(\d+)\s+([a-z]+)\b/i,
    /\b([a-z]+)\s+level\s+(\d+)\b/i,
    /^Class:\s*([a-z]+).*?^Level:\s*(\d+)/ims,
    /^Level:\s*(\d+).*?^Class:\s*([a-z]+)/ims
  ];

  for (const pattern of patterns) {
    const match = sheet.match(pattern);

    if (!match) {
      continue;
    }

    const first = match[1] ?? "";
    const second = match[2] ?? "";
    const level = /^\d+$/.test(first) ? Number(first) : Number(second);
    const characterClass = /^\d+$/.test(first) ? second : first;

    if (Number.isInteger(level) && level > 0 && characterClass.trim()) {
      return { characterClass, level };
    }
  }

  return null;
}

function inferredHpFromSheet(sheet: string) {
  const maxHp = legacyNumberLine(sheet, "Max HP");
  const currentHp = legacyNumberLine(sheet, "Current HP") ?? maxHp;

  if (maxHp !== undefined) {
    return { maxHp, currentHp };
  }

  const hpMatch = sheet.match(/\b(\d+)\s*(?:max\s*)?hp\b/i);
  const hp = hpMatch?.[1] ? Number(hpMatch[1]) : undefined;

  return hp !== undefined ? { maxHp: hp, currentHp: hp } : {};
}

function sheetMentionsTrackedSpellAtLevel(sheet: string, level: string) {
  const normalizedSheet = sheet.toLowerCase();

  return Array.from(trackedSpellLevels.entries()).some(
    ([spellName, spellLevel]) =>
      spellLevel === level &&
      new RegExp(`\\b${spellNamePattern(spellName.toLowerCase())}\\b`).test(
        normalizedSheet
      )
  );
}

function inferredSlotsFromSheet(sheet: string) {
  const legacySlots = legacySlotsFromSheet(sheet);

  if (legacySlots) {
    return legacySlots;
  }

  const inferredIdentity = inferredLevelAndClassFromSheet(sheet);

  if (!inferredIdentity) {
    return undefined;
  }

  const inferredSlots = deriveSpellSlotsForClass(
    inferredIdentity.characterClass,
    inferredIdentity.level
  );

  if (!inferredSlots) {
    return undefined;
  }

  const highestMentionedTrackedLevel = Math.max(
    0,
    ...Object.keys(inferredSlots)
      .filter((level) => sheetMentionsTrackedSpellAtLevel(sheet, level))
      .map(Number)
  );

  if (highestMentionedTrackedLevel <= 0) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(inferredSlots).filter(([level]) => Number(level) <= highestMentionedTrackedLevel)
  );
}

function legacySlotsFromSheet(sheet: string) {
  const slots: Record<string, SpellSlotState> = {};
  const slotLine =
    /^(1st|2nd|3rd|4th|5th|6th|7th|8th|9th)-level slots:\s*(\d+)\s+total,\s*(\d+)\s+used/im;
  const lines = sheet.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(slotLine);

    if (!match) {
      continue;
    }

    const ordinalMatch = match[1];

    if (!ordinalMatch) {
      continue;
    }

    const level = String(
      ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"].indexOf(
        ordinalMatch
      ) + 1
    );
    const max = Number(match[2]);
    const used = Number(match[3]);

    if (spellSlotLevels.includes(level as (typeof spellSlotLevels)[number])) {
      slots[level] = { max, used: Math.min(used, max) };
    }
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}

function legacyActorFromSheet(player: PlayerLike): MechanicsState["actors"][string] {
  const { maxHp, currentHp } = inferredHpFromSheet(player.character_sheet);
  const spellSlots = inferredSlotsFromSheet(player.character_sheet);

  return {
    characterName: player.character_name,
    ...(currentHp !== undefined ? { currentHp } : {}),
    ...(maxHp !== undefined ? { maxHp } : {}),
    allegiance: "player",
    isPlayerControlled: true,
    ...(spellSlots ? { spellSlots } : {}),
    concentration: null,
    conditions: []
  };
}

function actorWithSheetFallback(
  actor: MechanicsState["actors"][string] | undefined,
  player: PlayerLike
): MechanicsState["actors"][string] {
  const fallback = legacyActorFromSheet(player);

  if (!actor) {
    return fallback;
  }

  return {
    ...actor,
    characterName: actor.characterName || player.character_name,
    currentHp: actor.currentHp ?? fallback.currentHp,
    maxHp: actor.maxHp ?? fallback.maxHp,
    spellSlots: actor.spellSlots ?? cloneSlots(fallback.spellSlots),
    deathSaves: cloneDeathSaves(actor.deathSaves ?? fallback.deathSaves),
    concentration: actor.concentration ?? null,
    conditions: actor.conditions ?? []
  };
}

export function resolveMechanicsState(
  campaign: CampaignLike,
  players: PlayerLike[]
): MechanicsState {
  const persisted = persistedMechanicsState(campaign);

  if (persisted) {
    const actors = { ...persisted.actors };

    for (const player of players) {
      const key = actorKeyForPlayer(player.id);
      actors[key] = actorWithSheetFallback(actors[key], player);
    }

    return { ...persisted, actors };
  }

  return {
    combat: defaultCombatState,
    actors: Object.fromEntries(
      players.map((player) => [
        actorKeyForPlayer(player.id),
        legacyActorFromSheet(player)
      ])
    )
  };
}

function ordinal(level: string) {
  return level === "1"
    ? "1st"
    : level === "2"
      ? "2nd"
      : level === "3"
        ? "3rd"
        : `${level}th`;
}

export function formatSpellSlotLines(slots: Record<string, SpellSlotState>) {
  return spellSlotLevels.flatMap((level) => {
    const slot = slots[level];

    if (!slot) {
      return [];
    }

    const remaining = Math.max(0, slot.max - slot.used);
    return [
      `${ordinal(level)}-level slots: ${slot.max} total, ${slot.used} used, ${remaining} remaining`
    ];
  });
}

export function projectMechanicsIntoCharacterSheet(
  sheet: string,
  actor: MechanicsState["actors"][string] | undefined
) {
  if (!actor) {
    return sheet;
  }

  let projected = sheet;

  if (actor.currentHp !== undefined) {
    projected = projected.match(/^Current HP:/im)
      ? projected.replace(/^Current HP:\s*\d+.*$/im, `Current HP: ${actor.currentHp}`)
      : projected.replace(
          /^Max HP:.*$/im,
          (line) => `${line}\nCurrent HP: ${actor.currentHp}`
        );
  }

  if (actor.spellSlots && Object.keys(actor.spellSlots).length > 0) {
    const slotLines = formatSpellSlotLines(actor.spellSlots);
    const lines = projected.split(/\r?\n/);
    const nextLines: string[] = [];
    let inserted = false;
    let skippingExistingSlots = false;

    for (const line of lines) {
      if (/^Spell Slots:/i.test(line)) {
        nextLines.push("Spell Slots");
        nextLines.push(...slotLines);
        inserted = true;
        skippingExistingSlots = true;
        continue;
      }

      if (/^Spell Slots$/i.test(line)) {
        nextLines.push(line);
        nextLines.push(...slotLines);
        inserted = true;
        skippingExistingSlots = true;
        continue;
      }

      if (
        skippingExistingSlots &&
        /^\d(?:st|nd|rd|th)-level slots:/i.test(line)
      ) {
        continue;
      }

      if (skippingExistingSlots && line.trim() === "") {
        skippingExistingSlots = false;
      }

      nextLines.push(line);
    }

    projected = inserted
      ? nextLines.join("\n")
      : `${projected.trimEnd()}\n\nSpell Slots\n${slotLines.join("\n")}`;
  }

  return projected;
}

export function isDeadActor(
  actor: MechanicsState["actors"][string] | undefined
) {
  return (actor?.conditions ?? []).some(
    (condition) => condition.trim().toLowerCase() === "dead"
  );
}

export function isStableActor(
  actor: MechanicsState["actors"][string] | undefined
) {
  return (actor?.conditions ?? []).some(
    (condition) => condition.trim().toLowerCase() === "stable"
  );
}

export function isDyingPlayerActor(
  actor: MechanicsState["actors"][string] | undefined
): actor is MechanicsActorState {
  return Boolean(
    actor &&
      actor.isPlayerControlled === true &&
      actor.currentHp !== undefined &&
      actor.currentHp <= 0 &&
      !isDeadActor(actor) &&
      !isStableActor(actor)
  );
}

export function firstDyingPlayerActorKey(state: MechanicsState) {
  return (
    Object.entries(state.actors).find(
      ([actorKey, actor]) =>
        actorKey.startsWith("player:") && isDyingPlayerActor(actor)
    )?.[0] ?? null
  );
}

export type DeathSaveOutcome =
  | "success"
  | "failure"
  | "stabilized"
  | "dead"
  | "revived";

export function applyDeathSavingThrow(input: {
  state: MechanicsState;
  actorKey: string;
  roll: number;
  updatedAt?: string | undefined;
}): { state: MechanicsState; outcome: DeathSaveOutcome } {
  const actor = input.state.actors[input.actorKey];

  if (!isDyingPlayerActor(actor)) {
    return { state: input.state, outcome: isDeadActor(actor) ? "dead" : "success" };
  }

  if (input.roll === 20) {
    return {
      outcome: "revived",
      state: {
        ...input.state,
        updatedAt: input.updatedAt,
        actors: {
          ...input.state.actors,
          [input.actorKey]: {
            ...withoutDeathSaves(actor),
            currentHp: 1,
            conditions: withoutConditions(actor.conditions, [
              "unconscious",
              "stable",
              "dying",
              "dead"
            ])
          }
        }
      }
    };
  }

  const current = actor.deathSaves ?? { successes: 0, failures: 0 };
  const nextDeathSaves =
    input.roll === 1
      ? { ...current, failures: Math.min(3, current.failures + 2) }
      : input.roll < 10
        ? { ...current, failures: Math.min(3, current.failures + 1) }
        : { ...current, successes: Math.min(3, current.successes + 1) };

  const died = nextDeathSaves.failures >= 3;
  const stabilized = !died && nextDeathSaves.successes >= 3;
  const actorBase = died || stabilized ? withoutDeathSaves(actor) : actor;
  const nextActor: MechanicsActorState = {
    ...actorBase,
    currentHp: 0,
    ...(died || stabilized ? {} : { deathSaves: nextDeathSaves }),
    conditions: died
      ? withCondition(
          withoutConditions(actor.conditions, ["unconscious", "stable", "dying"]),
          "dead"
        )
      : stabilized
        ? withCondition(
            withoutConditions(actor.conditions, ["dying", "dead"]),
            "stable"
          )
        : withCondition(
            withoutConditions(actor.conditions, ["stable", "dead"]),
            "unconscious"
          )
  };

  return {
    outcome: died
      ? "dead"
      : stabilized
        ? "stabilized"
        : input.roll < 10
          ? "failure"
          : "success",
    state: {
      ...input.state,
      updatedAt: input.updatedAt,
      actors: {
        ...input.state.actors,
        [input.actorKey]: nextActor
      }
    }
  };
}

export function reviveDeadPlayerActor(input: {
  state: MechanicsState;
  actorKey: string;
  updatedAt?: string | undefined;
}) {
  const actor = input.state.actors[input.actorKey];

  if (!actor || !isDeadActor(actor)) {
    return input.state;
  }

  return {
    ...input.state,
    updatedAt: input.updatedAt,
    combat: defaultCombatState,
    actors: {
      ...input.state.actors,
      [input.actorKey]: {
        ...withoutDeathSaves(actor),
        currentHp: actor.maxHp ?? actor.currentHp ?? 1,
        conditions: withoutConditions(actor.conditions, [
          "dead",
          "unconscious",
          "stable",
          "dying"
        ])
      }
    }
  };
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function spellNamePattern(spellName: string) {
  return spellName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

export function detectTrackedCastIntent(message: string) {
  const lowerMessage = message.toLowerCase();

  for (const [spellName, level] of trackedSpellLevels.entries()) {
    const spellPattern = spellNamePattern(spellName.toLowerCase());
    const castPattern = new RegExp(
      `\\b(?:cast|casts|casting|use|uses|using|expend|expend[s]?|unleash|unleashes|throw|throws)\\b[^.!?\\n]{0,80}\\b${spellPattern}\\b`
    );

    if (castPattern.test(lowerMessage)) {
      return {
        spellName,
        level,
        isConcentration: concentrationSpells.has(spellName)
      };
    }
  }

  return null;
}

function isCombatAction(message: string) {
  return /\b(attack|strike|stab|shoot|cast|charge|grapple|shove|dash|disengage|dodge|hide|spell)\b/i.test(
    message
  );
}

function isNpcActorKey(actorKey: string) {
  return actorKey.startsWith("npc:");
}

function isNpcTurnOwner(state: MechanicsState, turnOwner: string) {
  if (isNpcActorKey(turnOwner)) {
    return true;
  }

  const normalizedTurnOwner = normalizeText(turnOwner);

  return Object.entries(state.actors).some(
    ([actorKey, actor]) =>
      isNpcActorKey(actorKey) &&
      normalizeText(actor.characterName) === normalizedTurnOwner
  );
}

export function assertMechanicsActionAllowed(input: {
  state: MechanicsState;
  player: PlayerLike;
  message: string;
}) {
  const actorKey = actorKeyForPlayer(input.player.id);
  const actor = input.state.actors[actorKey];

  if (!actor) {
    return;
  }

  if (isDeadActor(actor)) {
    throw new Error("That character is dead.");
  }

  if (input.state.combat.active && input.state.combat.turnOwner) {
    const exactCharacterName = normalizeText(actor.characterName);
    const exactTurnOwner = normalizeText(input.state.combat.turnOwner);
    const isTurnOwner =
      input.state.combat.turnOwner === actorKey ||
      (exactCharacterName && exactTurnOwner === exactCharacterName);

    if (
      !isTurnOwner &&
      !isNpcTurnOwner(input.state, input.state.combat.turnOwner) &&
      isCombatAction(input.message)
    ) {
      throw new Error("It is not your turn.");
    }
  }

  if (actor.currentHp !== undefined && actor.currentHp <= 0 && isCombatAction(input.message)) {
    throw new Error("That character is at 0 HP and cannot take combat actions.");
  }

  const castIntent = detectTrackedCastIntent(input.message);

  if (!castIntent) {
    return;
  }

  const level = castIntent.level as SpellSlotLevel;
  const slot = actor.spellSlots?.[level];

  if (!slot) {
    throw new Error(`No tracked ${ordinal(level)}-level spell slots.`);
  }

  if (slot.used >= slot.max) {
    throw new Error(`No ${ordinal(level)}-level spell slots left.`);
  }
}

export function applyAcceptedCast(input: {
  state: MechanicsState;
  player: PlayerLike;
  message: string;
  updatedAt?: string | undefined;
}) {
  const castIntent = detectTrackedCastIntent(input.message);

  if (!castIntent) {
    return input.state;
  }

  const actorKey = actorKeyForPlayer(input.player.id);
  const actor = input.state.actors[actorKey];
  const level = castIntent.level as SpellSlotLevel;
  const slot = actor?.spellSlots?.[level];

  if (!actor || !slot || slot.used >= slot.max) {
    return input.state;
  }

  return {
    ...input.state,
    updatedAt: input.updatedAt,
    actors: {
      ...input.state.actors,
      [actorKey]: {
        ...actor,
        spellSlots: {
          ...actor.spellSlots,
          [level]: {
            ...slot,
            used: Math.min(slot.max, slot.used + 1)
          }
        },
        concentration: castIntent.isConcentration
          ? {
              spell: castIntent.spellName,
              targets: [],
              startedRound: input.state.combat.active
                ? input.state.combat.round
                : undefined
            }
          : actor.concentration
      }
    }
  };
}
