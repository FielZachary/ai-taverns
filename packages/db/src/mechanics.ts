import type {
  MechanicsSeed,
  MechanicsState,
  SpellSlotLevel,
  SpellSlotState
} from "@ai-dnd/contracts";

type PlayerLike = {
  id: string;
  client_id?: string;
  character_name: string;
  character_sheet: string;
};

type CampaignLike = {
  metadata: unknown;
};

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
  seed: MechanicsSeed | undefined
): MechanicsState["actors"][string] {
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
  seed?: MechanicsSeed | undefined;
  updatedAt?: string | undefined;
}): MechanicsState {
  return {
    updatedAt: input.updatedAt,
    combat: input.existing?.combat ?? defaultCombatState,
    actors: {
      ...(input.existing?.actors ?? {}),
      [actorKeyForPlayer(input.playerId)]: actorFromMechanicsSeed(
        input.characterName,
        input.seed
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
    const conditions = Array.isArray(actor.conditions)
      ? actor.conditions.filter((item): item is string => typeof item === "string")
      : [];

    actors[actorKey] = {
      characterName:
        typeof actor.characterName === "string" ? actor.characterName : "",
      ...(Number.isInteger(currentHp) && currentHp >= 0 ? { currentHp } : {}),
      ...(Number.isInteger(maxHp) && maxHp >= 0 ? { maxHp } : {}),
      ...(parseSpellSlots(actor.spellSlots)
        ? { spellSlots: parseSpellSlots(actor.spellSlots) }
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
    ...(spellSlots ? { spellSlots } : {}),
    concentration: null,
    conditions: []
  };
}

function actorWithSheetFallback(
  actor: MechanicsState["actors"][string],
  fallback: MechanicsState["actors"][string]
): MechanicsState["actors"][string] {
  return {
    ...actor,
    characterName: actor.characterName || fallback.characterName,
    currentHp: actor.currentHp ?? fallback.currentHp,
    maxHp: actor.maxHp ?? fallback.maxHp,
    spellSlots: actor.spellSlots ?? fallback.spellSlots,
    concentration: actor.concentration ?? fallback.concentration,
    conditions: actor.conditions ?? fallback.conditions
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
      const sheetFallback = legacyActorFromSheet(player);
      actors[key] = actors[key]
        ? actorWithSheetFallback(actors[key], sheetFallback)
        : sheetFallback;
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
  return /\b(attack|attacks|hit|hits|strike|strikes|swing|swings|slash|slashes|stab|stabs|shoot|shoots|cast|casts|charge|charges|grapple|grapples|shove|shoves|dash|dashes|disengage|disengages|dodge|dodges|hide|hides|spell)\b/i.test(
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
  const actorKeys = [
    actorKeyForPlayer(input.player.id),
    input.player.client_id ? actorKeyForPlayer(input.player.client_id) : undefined
  ].filter((key): key is string => Boolean(key));
  const actor = actorKeys
    .map((actorKey) => input.state.actors[actorKey])
    .find((candidate) => Boolean(candidate));

  if (!actor) {
    return;
  }

  if (input.state.combat.active && input.state.combat.turnOwner) {
    const exactCharacterName = normalizeText(actor.characterName);
    const exactTurnOwner = normalizeText(input.state.combat.turnOwner);
    const isTurnOwner =
      actorKeys.includes(input.state.combat.turnOwner) ||
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
