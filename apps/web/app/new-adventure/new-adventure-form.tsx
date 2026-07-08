"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ScrollText,
  Sparkles,
  Swords,
  Users
} from "lucide-react";
import {
  campaignGenrePresets,
  customCampaignGenre
} from "@/lib/campaign-genres";
import {
  createCampaign as createCampaignViaApi,
  joinCampaign as joinCampaignViaApi,
  previewCampaignJoin
} from "@/lib/campaign-api";
import { defaultCharacterSheet } from "@/components/playing/PlayerPanel";

type CampaignMode = "single_player" | "multiplayer";
type MultiplayerIntent = "create" | "join";

type JoinPreview = {
  code: string;
  campaignTitle: string;
  availableSlots: number;
  hasBegun: boolean;
};

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
type AbilityScores = Record<AbilityKey, number>;
type SkillName = (typeof skillDefinitions)[number]["name"];
type CharacterBuildMode = "quick" | "custom";
type QuickBuildFantasy = (typeof quickBuildFantasyOptions)[number]["id"];

const playerIdStorageKey = "ai-dnd.playerId";
const characterLevel = 5;
const proficiencyBonus = 3;
const createSteps = ["Mode", "Campaign", "Character", "Review"];
const joinSteps = ["Mode", "Game Code", "Character", "Review"];
const joinCodePattern = /[A-HJ-NP-Z2-9]{6}/;
const campaignCreationLoadingSteps = [
  "Choosing where the story begins",
  "Finding the first spark",
  "Writing your opening scene",
  "Setting the table"
];
const customCharacterCreationSteps = [
  "Build",
  "Class",
  "Species",
  "Background",
  "Abilities",
  "Class Choices",
  "Skills",
  "Proficiencies",
  "Equipment",
  "Spells",
  "Identity",
  "Sheet"
];
const quickCharacterCreationSteps = [
  "Build",
  "Class",
  "Archetype",
  "Species",
  "Identity",
  "Sheet"
];
const campaignGenres = [...campaignGenrePresets, customCampaignGenre];
const abilityDefinitions = [
  { key: "str", label: "Strength" },
  { key: "dex", label: "Dexterity" },
  { key: "con", label: "Constitution" },
  { key: "int", label: "Intelligence" },
  { key: "wis", label: "Wisdom" },
  { key: "cha", label: "Charisma" }
] as const;
const skillDefinitions = [
  { name: "Acrobatics", ability: "dex" },
  { name: "Animal Handling", ability: "wis" },
  { name: "Arcana", ability: "int" },
  { name: "Athletics", ability: "str" },
  { name: "Deception", ability: "cha" },
  { name: "History", ability: "int" },
  { name: "Insight", ability: "wis" },
  { name: "Intimidation", ability: "cha" },
  { name: "Investigation", ability: "int" },
  { name: "Medicine", ability: "wis" },
  { name: "Nature", ability: "int" },
  { name: "Perception", ability: "wis" },
  { name: "Performance", ability: "cha" },
  { name: "Persuasion", ability: "cha" },
  { name: "Religion", ability: "int" },
  { name: "Sleight of Hand", ability: "dex" },
  { name: "Stealth", ability: "dex" },
  { name: "Survival", ability: "wis" }
] as const;
const quickBuildFantasyOptions = [
  {
    id: "Guardian",
    label: "Guardian",
    summary: "Durable, reliable, and built to keep the party alive.",
    subclassIndex: 0,
    featureIndex: 0,
    equipmentIndex: 0,
    spellOffset: 0
  },
  {
    id: "Striker",
    label: "Striker",
    summary: "Direct, dangerous, and tuned for decisive action.",
    subclassIndex: 1,
    featureIndex: 1,
    equipmentIndex: 1,
    spellOffset: 2
  },
  {
    id: "Tactician",
    label: "Tactician",
    summary: "Perceptive, flexible, and strongest when solving problems cleverly.",
    subclassIndex: 2,
    featureIndex: 2,
    equipmentIndex: 0,
    spellOffset: 4
  }
] as const;
const classOptions = [
  {
    id: "Barbarian",
    summary: "A fierce front-line survivor who turns danger into momentum.",
    hitDie: 12,
    saveProficiencies: ["str", "con"],
    skillChoices: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    defaultSkills: ["Athletics", "Intimidation"],
    subclassLabel: "Primal Path",
    subclassOptions: ["Path of the Berserker", "Path of the Totem Warrior", "Path of Wild Magic"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Strength", "+2 Constitution", "+1 Strength and +1 Constitution"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Simple weapons, martial weapons"
    },
    equipmentKits: [
      {
        id: "Greataxe bruiser",
        armorClass: 15,
        weapons: ["Greataxe: +6 to hit, 1d12+3 slashing", "Handaxe: +6 to hit, 1d6+3 slashing, thrown 20/60 ft"],
        gear: ["Greataxe", "2 handaxes", "Explorer's pack", "4 javelins", "10 GP"]
      },
      {
        id: "Shield breaker",
        armorClass: 17,
        weapons: ["Battleaxe: +6 to hit, 1d8+3 slashing", "Javelin: +6 to hit, 1d6+3 piercing, thrown 30/120 ft"],
        gear: ["Scale mail", "Battleaxe", "Shield", "4 javelins", "Explorer's pack", "10 GP"]
      }
    ],
    spells: []
  },
  {
    id: "Bard",
    summary: "A charismatic spellcaster who wins with wit, music, and nerve.",
    hitDie: 8,
    saveProficiencies: ["dex", "cha"],
    skillChoices: skillDefinitions.map((skill) => skill.name),
    defaultSkills: ["Performance", "Persuasion", "Deception"],
    subclassLabel: "Bard College",
    subclassOptions: ["College of Lore", "College of Valor", "College of Glamour"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Charisma", "+1 Dexterity and +1 Charisma", "+1 Constitution and +1 Charisma"],
    proficiencies: {
      armor: "Light armor",
      weapons: "Simple weapons, hand crossbows, longswords, rapiers, shortswords"
    },
    equipmentKits: [
      {
        id: "Silver-tongued duelist",
        armorClass: 15,
        weapons: ["Rapier: +5 to hit, 1d8+2 piercing", "Dagger: +5 to hit, 1d4+2 piercing, thrown 20/60 ft"],
        gear: ["Leather armor", "Rapier", "Dagger", "Lute", "Entertainer's pack", "15 GP"]
      }
    ],
    spells: ["Vicious Mockery", "Prestidigitation", "Healing Word", "Charm Person", "Dissonant Whispers", "Faerie Fire", "Invisibility", "Suggestion", "Hypnotic Pattern"]
  },
  {
    id: "Cleric",
    summary: "A divine caster who protects allies and carries sacred purpose.",
    hitDie: 8,
    saveProficiencies: ["wis", "cha"],
    skillChoices: ["History", "Insight", "Medicine", "Persuasion", "Religion"],
    defaultSkills: ["Religion", "Insight"],
    subclassLabel: "Divine Domain",
    subclassOptions: ["Life Domain", "Light Domain", "War Domain"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Wisdom", "+1 Constitution and +1 Wisdom", "+1 Wisdom and +1 Charisma"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Simple weapons"
    },
    equipmentKits: [
      {
        id: "Shielded healer",
        armorClass: 18,
        weapons: ["Mace: +5 to hit, 1d6+2 bludgeoning", "Sacred Flame: DC 14 Dexterity save, 2d8 radiant"],
        gear: ["Scale mail", "Shield", "Mace", "Holy symbol", "Priest's pack", "15 GP"]
      }
    ],
    spells: ["Guidance", "Sacred Flame", "Cure Wounds", "Bless", "Guiding Bolt", "Healing Word", "Spiritual Weapon", "Lesser Restoration", "Revivify"]
  },
  {
    id: "Druid",
    summary: "A primal spellcaster tied to beasts, weather, and old places.",
    hitDie: 8,
    saveProficiencies: ["int", "wis"],
    skillChoices: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"],
    defaultSkills: ["Nature", "Survival"],
    subclassLabel: "Druid Circle",
    subclassOptions: ["Circle of the Land", "Circle of the Moon", "Circle of Stars"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Wisdom", "+1 Constitution and +1 Wisdom", "+1 Dexterity and +1 Wisdom"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears"
    },
    equipmentKits: [
      {
        id: "Wild guardian",
        armorClass: 16,
        weapons: ["Quarterstaff: +5 to hit, 1d6+2 bludgeoning", "Produce Flame: +6 to hit, 2d8 fire"],
        gear: ["Leather armor", "Shield", "Quarterstaff", "Druidic focus", "Explorer's pack", "10 GP"]
      }
    ],
    spells: ["Produce Flame", "Guidance", "Entangle", "Goodberry", "Healing Word", "Speak with Animals", "Moonbeam", "Pass without Trace", "Call Lightning"]
  },
  {
    id: "Fighter",
    summary: "A trained warrior who solves problems with discipline and steel.",
    hitDie: 10,
    saveProficiencies: ["str", "con"],
    skillChoices: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
    defaultSkills: ["Athletics", "Perception"],
    subclassLabel: "Martial Archetype",
    subclassOptions: ["Champion", "Battle Master", "Eldritch Knight"],
    featureLabel: "Fighting Style",
    featureOptions: ["Defense", "Dueling", "Great Weapon Fighting", "Archery", "Protection"],
    proficiencies: {
      armor: "Light armor, medium armor, heavy armor, shields",
      weapons: "Simple weapons, martial weapons"
    },
    equipmentKits: [
      {
        id: "Sword and shield",
        armorClass: 19,
        weapons: ["Longsword: +6 to hit, 1d8+3 slashing", "Javelin: +6 to hit, 1d6+3 piercing, thrown 30/120 ft"],
        gear: ["Chain mail", "Shield", "Longsword", "2 javelins", "Dungeoneer's pack", "10 GP"]
      },
      {
        id: "Archer",
        armorClass: 16,
        weapons: ["Longbow: +7 to hit, 1d8+4 piercing, range 150/600 ft", "Shortsword: +7 to hit, 1d6+4 piercing"],
        gear: ["Leather armor", "Longbow", "20 arrows", "2 shortswords", "Explorer's pack", "10 GP"]
      }
    ],
    spells: []
  },
  {
    id: "Monk",
    summary: "A focused martial artist who moves quickly and strikes precisely.",
    hitDie: 8,
    saveProficiencies: ["str", "dex"],
    skillChoices: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    defaultSkills: ["Acrobatics", "Insight"],
    subclassLabel: "Monastic Tradition",
    subclassOptions: ["Way of the Open Hand", "Way of Shadow", "Way of Mercy"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Dexterity", "+1 Dexterity and +1 Wisdom", "+2 Wisdom"],
    proficiencies: {
      armor: "None",
      weapons: "Simple weapons, shortswords"
    },
    equipmentKits: [
      {
        id: "Wandering ascetic",
        armorClass: 16,
        weapons: ["Unarmed Strike: +6 to hit, 1d6+3 bludgeoning", "Shortsword: +6 to hit, 1d6+3 piercing"],
        gear: ["Shortsword", "10 darts", "Explorer's pack", "10 GP"]
      }
    ],
    spells: []
  },
  {
    id: "Paladin",
    summary: "An oathbound champion with armor, conviction, and divine power.",
    hitDie: 10,
    saveProficiencies: ["wis", "cha"],
    skillChoices: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
    defaultSkills: ["Athletics", "Persuasion"],
    subclassLabel: "Sacred Oath",
    subclassOptions: ["Oath of Devotion", "Oath of Vengeance", "Oath of the Ancients"],
    featureLabel: "Fighting Style",
    featureOptions: ["Defense", "Dueling", "Great Weapon Fighting", "Protection"],
    proficiencies: {
      armor: "Light armor, medium armor, heavy armor, shields",
      weapons: "Simple weapons, martial weapons"
    },
    equipmentKits: [
      {
        id: "Oathbound defender",
        armorClass: 19,
        weapons: ["Longsword: +6 to hit, 1d8+3 slashing", "Javelin: +6 to hit, 1d6+3 piercing, thrown 30/120 ft"],
        gear: ["Chain mail", "Shield", "Longsword", "5 javelins", "Holy symbol", "Priest's pack", "10 GP"]
      }
    ],
    spells: ["Bless", "Cure Wounds", "Command", "Shield of Faith", "Wrathful Smite", "Lesser Restoration", "Aid"]
  },
  {
    id: "Ranger",
    summary: "A wilderness scout who hunts threats before they reach the firelight.",
    hitDie: 10,
    saveProficiencies: ["str", "dex"],
    skillChoices: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"],
    defaultSkills: ["Survival", "Perception"],
    subclassLabel: "Ranger Archetype",
    subclassOptions: ["Hunter", "Beast Master", "Gloom Stalker"],
    featureLabel: "Fighting Style",
    featureOptions: ["Archery", "Defense", "Dueling", "Two-Weapon Fighting"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Simple weapons, martial weapons"
    },
    equipmentKits: [
      {
        id: "Trail hunter",
        armorClass: 16,
        weapons: ["Longbow: +7 to hit, 1d8+4 piercing, range 150/600 ft", "Shortsword: +7 to hit, 1d6+4 piercing"],
        gear: ["Scale mail", "Longbow", "20 arrows", "2 shortswords", "Explorer's pack", "10 GP"]
      }
    ],
    spells: ["Hunter's Mark", "Goodberry", "Cure Wounds", "Absorb Elements", "Pass without Trace", "Spike Growth"]
  },
  {
    id: "Rogue",
    summary: "A precise infiltrator who thrives on timing, secrets, and leverage.",
    hitDie: 8,
    saveProficiencies: ["dex", "int"],
    skillChoices: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"],
    defaultSkills: ["Stealth", "Sleight of Hand", "Investigation", "Perception"],
    subclassLabel: "Roguish Archetype",
    subclassOptions: ["Thief", "Assassin", "Arcane Trickster"],
    featureLabel: "Expertise",
    featureOptions: ["Stealth and Thieves' Tools", "Investigation and Perception", "Persuasion and Deception"],
    proficiencies: {
      armor: "Light armor",
      weapons: "Simple weapons, hand crossbows, longswords, rapiers, shortswords"
    },
    equipmentKits: [
      {
        id: "Shadow operator",
        armorClass: 15,
        weapons: ["Rapier: +7 to hit, 1d8+4 piercing", "Shortbow: +7 to hit, 1d6+4 piercing, range 80/320 ft"],
        gear: ["Leather armor", "Rapier", "Shortbow", "20 arrows", "Thieves' tools", "Burglar's pack", "10 GP"]
      }
    ],
    spells: []
  },
  {
    id: "Sorcerer",
    summary: "An innate spellcaster whose magic comes from blood, fate, or anomaly.",
    hitDie: 6,
    saveProficiencies: ["con", "cha"],
    skillChoices: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
    defaultSkills: ["Arcana", "Persuasion"],
    subclassLabel: "Sorcerous Origin",
    subclassOptions: ["Draconic Bloodline", "Wild Magic", "Clockwork Soul"],
    featureLabel: "Metamagic",
    featureOptions: ["Careful Spell and Twinned Spell", "Quickened Spell and Subtle Spell", "Distant Spell and Empowered Spell"],
    proficiencies: {
      armor: "None",
      weapons: "Daggers, darts, slings, quarterstaffs, light crossbows"
    },
    equipmentKits: [
      {
        id: "Arcane striker",
        armorClass: 15,
        weapons: ["Fire Bolt: +7 to hit, 2d10 fire", "Dagger: +5 to hit, 1d4+2 piercing, thrown 20/60 ft"],
        gear: ["Arcane focus", "2 daggers", "Explorer's pack", "15 GP"]
      }
    ],
    spells: ["Fire Bolt", "Mage Hand", "Mage Armor", "Magic Missile", "Shield", "Burning Hands", "Misty Step", "Mirror Image", "Fireball"]
  },
  {
    id: "Warlock",
    summary: "A pact-bound caster with strange power and stranger obligations.",
    hitDie: 8,
    saveProficiencies: ["wis", "cha"],
    skillChoices: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"],
    defaultSkills: ["Arcana", "Deception"],
    subclassLabel: "Otherworldly Patron",
    subclassOptions: ["The Fiend", "The Archfey", "The Great Old One"],
    featureLabel: "Pact Boon",
    featureOptions: ["Pact of the Blade", "Pact of the Chain", "Pact of the Tome"],
    proficiencies: {
      armor: "Light armor",
      weapons: "Simple weapons"
    },
    equipmentKits: [
      {
        id: "Occult envoy",
        armorClass: 15,
        weapons: ["Eldritch Blast: +7 to hit, 2 beams, 1d10 force each", "Dagger: +5 to hit, 1d4+2 piercing, thrown 20/60 ft"],
        gear: ["Leather armor", "Arcane focus", "Dagger", "Scholar's pack", "10 GP"]
      }
    ],
    spells: ["Eldritch Blast", "Mage Hand", "Hex", "Armor of Agathys", "Hellish Rebuke", "Misty Step", "Invisibility", "Hunger of Hadar"]
  },
  {
    id: "Wizard",
    summary: "A learned spellcaster who studies patterns the world tries to hide.",
    hitDie: 6,
    saveProficiencies: ["int", "wis"],
    skillChoices: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
    defaultSkills: ["Arcana", "Investigation"],
    subclassLabel: "Arcane Tradition",
    subclassOptions: ["School of Evocation", "School of Divination", "School of Abjuration"],
    featureLabel: "Level 4 improvement",
    featureOptions: ["+2 Intelligence", "+1 Constitution and +1 Intelligence", "+1 Dexterity and +1 Intelligence"],
    proficiencies: {
      armor: "None",
      weapons: "Daggers, darts, slings, quarterstaffs, light crossbows"
    },
    equipmentKits: [
      {
        id: "Prepared scholar",
        armorClass: 15,
        weapons: ["Fire Bolt: +7 to hit, 2d10 fire", "Quarterstaff: +2 to hit, 1d6-1 bludgeoning"],
        gear: ["Quarterstaff", "Spellbook", "Arcane focus", "Scholar's pack", "10 GP"]
      }
    ],
    spells: ["Fire Bolt", "Prestidigitation", "Mage Armor", "Magic Missile", "Shield", "Detect Magic", "Misty Step", "Web", "Fireball"]
  }
] as const;
const speciesOptions = [
  "Human",
  "Elf",
  "Dwarf",
  "Halfling",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
  "Dragonborn"
] as const;
const backgroundOptions = [
  "Acolyte",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Sailor",
  "Soldier",
  "Urchin"
] as const;
const backgroundSkills: Record<(typeof backgroundOptions)[number], SkillName[]> = {
  Acolyte: ["Insight", "Religion"],
  Charlatan: ["Deception", "Sleight of Hand"],
  Criminal: ["Deception", "Stealth"],
  Entertainer: ["Acrobatics", "Performance"],
  "Folk Hero": ["Animal Handling", "Survival"],
  "Guild Artisan": ["Insight", "Persuasion"],
  Hermit: ["Medicine", "Religion"],
  Noble: ["History", "Persuasion"],
  Outlander: ["Athletics", "Survival"],
  Sage: ["Arcana", "History"],
  Sailor: ["Athletics", "Perception"],
  Soldier: ["Athletics", "Intimidation"],
  Urchin: ["Sleight of Hand", "Stealth"]
};
const toolOptions = [
  "Thieves' tools",
  "Herbalism kit",
  "Disguise kit",
  "Forgery kit",
  "Navigator's tools",
  "Dice set",
  "Lute",
  "Smith's tools"
] as const;
const languageOptions = [
  "Elvish",
  "Dwarvish",
  "Halfling",
  "Gnomish",
  "Orc",
  "Draconic",
  "Infernal",
  "Celestial"
] as const;
const alignmentOptions = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil"
] as const;
const defaultAbilityScoresByClass: Record<CharacterClass, AbilityScores> = {
  Barbarian: { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
  Bard: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 17 },
  Cleric: { str: 12, dex: 10, con: 15, int: 10, wis: 17, cha: 13 },
  Druid: { str: 10, dex: 14, con: 15, int: 10, wis: 17, cha: 8 },
  Fighter: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
  Monk: { str: 10, dex: 17, con: 14, int: 8, wis: 16, cha: 10 },
  Paladin: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  Ranger: { str: 10, dex: 17, con: 14, int: 10, wis: 16, cha: 8 },
  Rogue: { str: 8, dex: 17, con: 14, int: 14, wis: 12, cha: 10 },
  Sorcerer: { str: 8, dex: 14, con: 15, int: 10, wis: 10, cha: 17 },
  Warlock: { str: 8, dex: 14, con: 15, int: 10, wis: 12, cha: 17 },
  Wizard: { str: 8, dex: 14, con: 15, int: 17, wis: 12, cha: 10 }
};
type CharacterClass = (typeof classOptions)[number]["id"];
type CharacterSpecies = (typeof speciesOptions)[number];
type CharacterBackground = (typeof backgroundOptions)[number];
type Alignment = (typeof alignmentOptions)[number];

const quickBuildBackgroundByClass: Record<CharacterClass, CharacterBackground> = {
  Barbarian: "Outlander",
  Bard: "Entertainer",
  Cleric: "Acolyte",
  Druid: "Hermit",
  Fighter: "Soldier",
  Monk: "Hermit",
  Paladin: "Noble",
  Ranger: "Outlander",
  Rogue: "Criminal",
  Sorcerer: "Hermit",
  Warlock: "Sage",
  Wizard: "Sage"
};

function formatList(items: readonly string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function getAverageHp(hitDie: number, constitutionModifier: number) {
  return hitDie + constitutionModifier + (characterLevel - 1) * (Math.floor(hitDie / 2) + 1 + constitutionModifier);
}

function hasSaveProficiency(
  saveProficiencies: readonly string[],
  ability: AbilityKey
) {
  return saveProficiencies.some((proficiency) => proficiency === ability);
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeGameCodeInput(value: string) {
  const compactValue = value.replace(/[^a-z0-9]/gi, "").toUpperCase();

  if (compactValue.length <= 6) {
    return compactValue;
  }

  return (
    value.toUpperCase().match(joinCodePattern)?.[0] ?? compactValue.slice(0, 6)
  );
}

export function NewAdventureForm() {
  const [stepIndex, setStepIndex] = useState(0);
  const [characterStepIndex, setCharacterStepIndex] = useState(0);
  const [mode, setMode] = useState<CampaignMode>("single_player");
  const [multiplayerIntent, setMultiplayerIntent] =
    useState<MultiplayerIntent>("create");
  const [gameCode, setGameCode] = useState("");
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [campaignGenre, setCampaignGenre] = useState(campaignGenres[0].id);
  const [customWorldName, setCustomWorldName] = useState("");
  const [customWorldDescription, setCustomWorldDescription] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterBuildMode, setCharacterBuildMode] =
    useState<CharacterBuildMode>("custom");
  const [quickBuildFantasy, setQuickBuildFantasy] =
    useState<QuickBuildFantasy>("Guardian");
  const [characterClass, setCharacterClass] = useState<CharacterClass>("Fighter");
  const [characterSpecies, setCharacterSpecies] = useState<CharacterSpecies>("Human");
  const [characterBackground, setCharacterBackground] = useState<CharacterBackground>("Folk Hero");
  const [abilityScores, setAbilityScores] = useState<AbilityScores>(defaultAbilityScoresByClass.Fighter);
  const [subclass, setSubclass] = useState("Champion");
  const [classFeatureChoice, setClassFeatureChoice] = useState("Defense");
  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>(["Athletics", "Perception"]);
  const [selectedTool, setSelectedTool] = useState<(typeof toolOptions)[number]>("Dice set");
  const [selectedLanguage, setSelectedLanguage] = useState<(typeof languageOptions)[number]>("Elvish");
  const [equipmentKitId, setEquipmentKitId] = useState("Sword and shield");
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [alignment, setAlignment] = useState<Alignment>("Neutral Good");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationLoadingStep, setCreationLoadingStep] = useState(0);
  const isJoinFlow = mode === "multiplayer" && multiplayerIntent === "join";
  const steps = isJoinFlow ? joinSteps : createSteps;
  const isLastStep = stepIndex === steps.length - 1;
  const isCharacterStep = stepIndex === 2;
  const requiresCharacterName = mode === "single_player" || isJoinFlow;
  const characterCreationSteps =
    characterBuildMode === "quick"
      ? quickCharacterCreationSteps
      : customCharacterCreationSteps;
  const isQuickBuild = characterBuildMode === "quick";
  const isLastCharacterStep =
    characterStepIndex === characterCreationSteps.length - 1;
  const modeLabel = mode === "single_player" ? "Singleplayer" : "Multiplayer";
  const normalizedGameCode = normalizeGameCodeInput(gameCode);
  const hasRequiredIdentity =
    Boolean(characterName.trim()) && (!isJoinFlow || Boolean(playerName.trim()));
  const selectedGenre = campaignGenres.find((genre) => genre.id === campaignGenre) ?? campaignGenres[0];
  const isCustomGenre = campaignGenre === "custom";
  const campaignDisplayName = isCustomGenre
    ? customWorldName.trim() || "Custom World"
    : `${selectedGenre.label} Adventure`;
  const selectedClass = classOptions.find((option) => option.id === characterClass) ?? classOptions[4];
  const selectedEquipmentKit = selectedClass.equipmentKits.find((kit) => kit.id === equipmentKitId) ?? selectedClass.equipmentKits[0];
  const backgroundSkillList = backgroundSkills[characterBackground] ?? [];
  const proficientSkills = Array.from(new Set([...selectedSkills, ...backgroundSkillList]));
  const constitutionModifier = getModifier(abilityScores.con);
  const maxHp = getAverageHp(selectedClass.hitDie, constitutionModifier);
  const passivePerception = 10 + getModifier(abilityScores.wis) + (proficientSkills.includes("Perception") ? proficiencyBonus : 0);
  const spellcastingAbility = characterClass === "Wizard" ? "int" : characterClass === "Cleric" || characterClass === "Druid" || characterClass === "Ranger" ? "wis" : "cha";
  const spellcastingModifier = getModifier(abilityScores[spellcastingAbility]);
  const spellSaveDc = 8 + proficiencyBonus + spellcastingModifier;
  const spellAttackBonus = proficiencyBonus + spellcastingModifier;
  const hasSpells = selectedClass.spells.length > 0;
  const selectedQuickBuildFantasy =
    quickBuildFantasyOptions.find((option) => option.id === quickBuildFantasy) ??
    quickBuildFantasyOptions[0];
  const characterSheetPreview = useMemo(() => {
    const abilityLines = abilityDefinitions.map(({ key, label }) => {
      const modifier = getModifier(abilityScores[key]);
      return `${label}: ${abilityScores[key]} (${formatModifier(modifier)})`;
    });
    const savingThrowLines = abilityDefinitions.map(({ key, label }) => {
      const isProficient = hasSaveProficiency(selectedClass.saveProficiencies, key);
      const modifier = getModifier(abilityScores[key]) + (isProficient ? proficiencyBonus : 0);
      const proficiencyText = isProficient ? ", proficient" : "";
      return `${label}: ${formatModifier(modifier)}${proficiencyText}`;
    });
    const skillLines = skillDefinitions.map((skill) => {
      const isProficient = proficientSkills.includes(skill.name);
      const modifier = getModifier(abilityScores[skill.ability]) + (isProficient ? proficiencyBonus : 0);
      return `${skill.name}: ${formatModifier(modifier)}${isProficient ? ", proficient" : ""}`;
    });
    const spells = hasSpells
      ? [
          `Spellcasting Ability: ${abilityDefinitions.find((ability) => ability.key === spellcastingAbility)?.label}`,
          `Spell Save DC: ${spellSaveDc}`,
          `Spell Attack Bonus: ${formatModifier(spellAttackBonus)}`,
          "Spell Slots: 4 first-level, 3 second-level, 2 third-level",
          `Known / Prepared: ${formatList(selectedSpells)}`
        ]
      : ["None"];
    const name = characterName.trim() || "Unnamed adventurer";

    return [
      `Character Name: ${name}`,
      `Player Name: ${
        mode === "single_player"
          ? name
          : isJoinFlow
            ? playerName.trim() || "Player"
            : "Table Owner"
      }`,
      `Build Mode: ${characterBuildMode === "custom" ? "Custom Build" : "Quick Build"}`,
      characterBuildMode === "quick"
        ? `Character Archetype: ${selectedQuickBuildFantasy.label}`
        : null,
      `Level: ${characterLevel}`,
      `Class: ${selectedClass.id}`,
      `Subclass: ${subclass}`,
      `Species: ${characterSpecies}`,
      `Background: ${characterBackground}`,
      `Alignment: ${alignment}`,
      "",
      "Core Stats",
      `Armor Class: ${selectedEquipmentKit.armorClass}`,
      `Initiative: ${formatModifier(getModifier(abilityScores.dex))}`,
      "Speed: 30 ft",
      `Proficiency Bonus: ${formatModifier(proficiencyBonus)}`,
      `Max HP: ${maxHp}`,
      `Current HP: ${maxHp}`,
      "Temporary HP: 0",
      `Hit Dice: ${characterLevel}d${selectedClass.hitDie}`,
      "",
      "Ability Scores",
      ...abilityLines,
      "",
      "Saving Throws",
      ...savingThrowLines,
      "",
      "Skills",
      ...skillLines,
      `Passive Perception: ${passivePerception}`,
      "",
      "Proficiencies and Languages",
      `Armor: ${selectedClass.proficiencies.armor}`,
      `Weapons: ${selectedClass.proficiencies.weapons}`,
      `Tools: ${selectedTool}`,
      `Languages: Common, ${selectedLanguage}`,
      "",
      "Attacks",
      ...selectedEquipmentKit.weapons,
      "",
      "Features and Traits",
      `${selectedClass.subclassLabel}: ${subclass}`,
      `${selectedClass.featureLabel}: ${classFeatureChoice}`,
      `Background Skills: ${formatList(backgroundSkillList)}`,
      `${characterSpecies}: standard ${characterSpecies.toLowerCase()} traits, senses, and movement`,
      "",
      "Equipment",
      ...selectedEquipmentKit.gear,
      "",
      "Spells",
      ...spells,
      "",
      "DM Brief",
      `${name} is a Level ${characterLevel} ${alignment} ${characterSpecies} ${selectedClass.id} (${subclass}) with the ${characterBackground} background. Use their proficient skills (${formatList(proficientSkills)}) and key class choices to frame checks, spotlight moments, and opening-scene hooks.`
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  }, [
    abilityScores,
    alignment,
    backgroundSkillList,
    characterBackground,
    characterBuildMode,
    characterName,
    characterSpecies,
    classFeatureChoice,
    hasSpells,
    maxHp,
    isJoinFlow,
    mode,
    passivePerception,
    proficientSkills,
    selectedClass,
    selectedEquipmentKit,
    selectedLanguage,
    selectedQuickBuildFantasy.label,
    selectedSpells,
    selectedTool,
    playerName,
    spellAttackBonus,
    spellSaveDc,
    spellcastingAbility,
    subclass
  ]);
  const stepTitle = useMemo(() => {
    if (stepIndex === 0) {
      return "Choose your game mode";
    }

    if (stepIndex === 1) {
      if (isJoinFlow) {
        return "Enter the game code";
      }

      return "Choose the campaign genre";
    }

    if (stepIndex === 2) {
      if (isLastCharacterStep) {
        return "Review your character";
      }

      if (characterStepIndex === 0) {
        return "Choose your character build";
      }

      if (!isQuickBuild && characterStepIndex === 4) {
        return "Set your Level 5 abilities";
      }

      if (isQuickBuild && characterStepIndex === 2) {
        return "Choose your character archetype";
      }

      return `Choose your ${characterCreationSteps[characterStepIndex].toLowerCase()}`;
    }

    return "Ready the first page";
  }, [
    characterCreationSteps,
    characterStepIndex,
    isJoinFlow,
    isLastCharacterStep,
    isQuickBuild,
    stepIndex
  ]);

  useEffect(() => {
    setCharacterSheet(characterSheetPreview);
  }, [characterSheetPreview]);

  useEffect(() => {
    if (!isCreating || isJoinFlow) {
      setCreationLoadingStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setCreationLoadingStep((currentStep) =>
        Math.min(currentStep + 1, campaignCreationLoadingSteps.length - 1)
      );
    }, 2400);

    return () => window.clearInterval(interval);
  }, [isCreating, isJoinFlow]);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem(playerIdStorageKey);

    if (savedPlayerId) {
      setOwnerClientId(savedPlayerId);
      return;
    }

    const nextPlayerId = createClientId();
    localStorage.setItem(playerIdStorageKey, nextPlayerId);
    setOwnerClientId(nextPlayerId);
  }, []);

  useEffect(() => {
    setJoinPreview(null);
  }, [normalizedGameCode]);

  function handleClassChange(nextClass: CharacterClass) {
    const nextClassData = classOptions.find((option) => option.id === nextClass) ?? classOptions[4];
    setCharacterClass(nextClass);
    setAbilityScores(defaultAbilityScoresByClass[nextClass]);
    setSubclass(nextClassData.subclassOptions[0]);
    setClassFeatureChoice(nextClassData.featureOptions[0]);
    setSelectedSkills([...nextClassData.defaultSkills] as SkillName[]);
    setEquipmentKitId(nextClassData.equipmentKits[0].id);
    setSelectedSpells(nextClassData.spells.slice(0, Math.min(5, nextClassData.spells.length)));

    if (characterBuildMode === "quick") {
      setCharacterBackground(quickBuildBackgroundByClass[nextClass]);
    }
  }

  function applyQuickBuildFantasy(nextFantasy: QuickBuildFantasy) {
    const fantasy =
      quickBuildFantasyOptions.find((option) => option.id === nextFantasy) ??
      quickBuildFantasyOptions[0];
    const subclassChoice =
      selectedClass.subclassOptions[
        Math.min(fantasy.subclassIndex, selectedClass.subclassOptions.length - 1)
      ];
    const featureChoice =
      selectedClass.featureOptions[
        Math.min(fantasy.featureIndex, selectedClass.featureOptions.length - 1)
      ];
    const equipmentChoice =
      selectedClass.equipmentKits[
        Math.min(fantasy.equipmentIndex, selectedClass.equipmentKits.length - 1)
      ];
    const skillChoices = selectedClass.skillChoices.slice(
      0,
      Math.max(2, Math.min(4, selectedClass.defaultSkills.length))
    ) as SkillName[];
    const spellChoices = selectedClass.spells.slice(
      fantasy.spellOffset,
      fantasy.spellOffset + 5
    );

    setQuickBuildFantasy(nextFantasy);
    setCharacterBackground(quickBuildBackgroundByClass[characterClass]);
    setSubclass(subclassChoice);
    setClassFeatureChoice(featureChoice);
    setSelectedSkills(
      skillChoices.length > 0
        ? skillChoices
        : ([...selectedClass.defaultSkills] as SkillName[])
    );
    setEquipmentKitId(equipmentChoice.id);
    setSelectedTool(fantasy.id === "Tactician" ? "Navigator's tools" : "Dice set");
    setSelectedLanguage(fantasy.id === "Guardian" ? "Dwarvish" : fantasy.id === "Striker" ? "Draconic" : "Elvish");
    setSelectedSpells(
      spellChoices.length > 0
        ? spellChoices
        : selectedClass.spells.slice(0, Math.min(5, selectedClass.spells.length))
    );
  }

  function updateAbilityScore(key: AbilityKey, value: string) {
    const parsedValue = Number.parseInt(value, 10);
    const nextValue = Number.isNaN(parsedValue) ? 8 : Math.min(20, Math.max(3, parsedValue));
    setAbilityScores((currentScores) => ({
      ...currentScores,
      [key]: nextValue
    }));
  }

  function toggleSkill(skill: SkillName) {
    setSelectedSkills((currentSkills) => {
      if (currentSkills.includes(skill)) {
        return currentSkills.filter((currentSkill) => currentSkill !== skill);
      }

      return [...currentSkills, skill];
    });
  }

  function toggleSpell(spell: string) {
    setSelectedSpells((currentSpells) => {
      if (currentSpells.includes(spell)) {
        return currentSpells.filter((currentSpell) => currentSpell !== spell);
      }

      return [...currentSpells, spell];
    });
  }

  function canAdvance() {
    if (stepIndex === 1) {
      if (isJoinFlow) {
        return normalizedGameCode.length === 6;
      }

      return Boolean(
        campaignGenre &&
          (!isCustomGenre || customWorldName.trim()) &&
          (!isCustomGenre || customWorldDescription.trim())
      );
    }

    if (stepIndex === 2) {
      if (characterStepIndex === 0) {
        return true;
      }

      if (isQuickBuild) {
        return (
          characterStepIndex !== 4 ||
          !requiresCharacterName ||
          hasRequiredIdentity
        );
      }

      if (characterStepIndex === 6) {
        return selectedSkills.length > 0;
      }

      if (characterStepIndex === 9 && hasSpells) {
        return selectedSpells.length > 0;
      }

      return (
        characterStepIndex !== 10 ||
        !requiresCharacterName ||
        hasRequiredIdentity
      );
    }

    return true;
  }

  async function previewJoinCode() {
    const data = await previewCampaignJoin({
      gameCode: normalizedGameCode
    });

    setJoinPreview(data);
  }

  async function handleNext() {
    setError("");

    if (!canAdvance()) {
      setError(
        stepIndex === 1
          ? isJoinFlow
            ? "Enter the six-character game code before continuing."
            : isCustomGenre
            ? "Name the world and describe it before continuing."
            : "Choose a campaign genre before continuing."
          : requiresCharacterName &&
              ((isQuickBuild && characterStepIndex === 4) ||
                (!isQuickBuild && characterStepIndex === 10))
            ? isJoinFlow
              ? "Add your player and character names before continuing."
              : "Add your character name before continuing."
            : characterStepIndex === 9
              ? "Choose at least one spell before continuing."
              : "Choose at least one option before continuing."
      );
      return;
    }

    if (isJoinFlow && stepIndex === 1) {
      try {
        await previewJoinCode();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "That game code could not be checked."
        );
        return;
      }
    }

    if (isQuickBuild && characterStepIndex === 2) {
      applyQuickBuildFantasy(quickBuildFantasy);
    }

    if (isCharacterStep && !isLastCharacterStep) {
      setCharacterStepIndex((currentStepIndex) =>
        Math.min(currentStepIndex + 1, characterCreationSteps.length - 1)
      );
      return;
    }

    setStepIndex((currentStepIndex) =>
      Math.min(currentStepIndex + 1, steps.length - 1)
    );
  }

  function handleBack() {
    setError("");

    if (isCharacterStep && characterStepIndex > 0) {
      setCharacterStepIndex((currentStepIndex) =>
        Math.max(currentStepIndex - 1, 0)
      );
      return;
    }

    setStepIndex((currentStepIndex) => Math.max(currentStepIndex - 1, 0));
  }

  async function createCampaign() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const campaign = await createCampaignViaApi({
        mode,
        title: campaignDisplayName,
        campaignGenre: selectedGenre.label,
        campaignGenreKind: isCustomGenre ? "custom" : "preset",
        campaignGenrePresetId: isCustomGenre ? undefined : selectedGenre.id,
        customWorldName: isCustomGenre ? customWorldName.trim() : undefined,
        customWorldDescription: isCustomGenre
          ? customWorldDescription.trim()
          : undefined,
        ownerClientId,
        playerName:
          mode === "single_player"
            ? characterName.trim() || "Solo Player"
            : "Table Owner",
        characterName,
        characterSheet
      });

      window.location.assign(
        `/play?campaignId=${encodeURIComponent(campaign.id)}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The campaign could not be created."
      );
      setIsCreating(false);
    }
  }

  async function joinCampaign() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const campaign = await joinCampaignViaApi({
        gameCode: normalizedGameCode,
        clientId: ownerClientId,
        username: playerName.trim(),
        characterName: characterName.trim(),
        characterSheet
      });

      window.location.assign(
        `/play?campaignId=${encodeURIComponent(campaign.id)}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The game could not be joined."
      );
      setIsCreating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLastStep) {
      void (isJoinFlow ? joinCampaign() : createCampaign());
      return;
    }

    void handleNext();
  }

  if (isCreating && !isJoinFlow) {
    const isFinalCreationLoadingStep =
      creationLoadingStep === campaignCreationLoadingSteps.length - 1;

    return (
      <main className="campaign-creation-screen" aria-label="Creating campaign">
        <section className="campaign-creation-center" aria-live="polite">
          <div className="campaign-creation-loader" aria-hidden="true">
            <Sparkles size={26} />
          </div>
          <p
            key={creationLoadingStep}
            className={
              isFinalCreationLoadingStep
                ? "campaign-creation-message-hold"
                : undefined
            }
          >
            {campaignCreationLoadingSteps[creationLoadingStep]}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="new-adventure-page">
      <section className="new-adventure-shell" aria-label="Create a new adventure">
        <div className="new-adventure-heading">
          <p className="eyebrow">New Adventure</p>
          <h1>{stepTitle}</h1>
        </div>

        <form className="new-adventure-form" onSubmit={handleSubmit}>
          <div
            className={`creation-stage ${
              stepIndex === 0 || isCustomGenre ? "creation-stage-roomy" : ""
            }`}
          >
            {stepIndex === 0 ? (
              <>
                <div className="mode-picker" role="radiogroup" aria-label="Campaign mode">
                  <button
                    type="button"
                    className={mode === "single_player" ? "selected" : ""}
                    aria-pressed={mode === "single_player"}
                    onClick={() => setMode("single_player")}
                  >
                    <span className="mode-medallion">
                      <Swords size={34} />
                    </span>
                    <span>
                      <strong>Singleplayer</strong>
                      <small>Private play with AI Taverns as your DM.</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={mode === "multiplayer" ? "selected" : ""}
                    aria-pressed={mode === "multiplayer"}
                    onClick={() => setMode("multiplayer")}
                  >
                    <span className="mode-medallion">
                      <Users size={34} />
                    </span>
                    <span>
                      <strong>Multiplayer</strong>
                      <small>Invite players and resolve party turns together.</small>
                    </span>
                  </button>
                </div>

                {mode === "multiplayer" ? (
                  <fieldset className="option-picker multiplayer-intent-picker">
                    <legend>Multiplayer</legend>
                    <div>
                      <button
                        type="button"
                        className={multiplayerIntent === "create" ? "selected" : ""}
                        aria-pressed={multiplayerIntent === "create"}
                        onClick={() => setMultiplayerIntent("create")}
                      >
                        <strong>Create Game</strong>
                        <small>Start a new table and share its game code.</small>
                      </button>
                      <button
                        type="button"
                        className={multiplayerIntent === "join" ? "selected" : ""}
                        aria-pressed={multiplayerIntent === "join"}
                        onClick={() => setMultiplayerIntent("join")}
                      >
                        <strong>Join Game</strong>
                        <small>Enter a code, build your character, and join the table.</small>
                      </button>
                    </div>
                  </fieldset>
                ) : null}
              </>
            ) : null}

            {stepIndex === 1 && isJoinFlow ? (
              <div className="join-code-panel">
                <label>
                  <span>Game code</span>
                  <input
                    value={gameCode}
                    onChange={(event) =>
                      setGameCode(normalizeGameCodeInput(event.target.value))
                    }
                    placeholder="K7M2QH"
                    autoCapitalize="characters"
                    autoFocus
                  />
                </label>
                {joinPreview ? (
                  <section className="join-preview">
                    <strong>{joinPreview.campaignTitle}</strong>
                    <span>
                      {joinPreview.availableSlots}{" "}
                      {joinPreview.availableSlots === 1 ? "seat" : "seats"} open
                    </span>
                    {joinPreview.hasBegun ? <span>Adventure in progress</span> : null}
                  </section>
                ) : null}
              </div>
            ) : null}

            {stepIndex === 1 && !isJoinFlow ? (
              <>
                <fieldset className="genre-picker">
                  <legend>Campaign genre</legend>
                  <div>
                    {campaignGenres.map((genre) => (
                      <button
                        type="button"
                        className={campaignGenre === genre.id ? "selected" : ""}
                        aria-pressed={campaignGenre === genre.id}
                        key={genre.id}
                        onClick={() => setCampaignGenre(genre.id)}
                      >
                        <strong>{genre.label}</strong>
                        <small>{genre.uiDescription}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div
                  className={`custom-world-field ${
                    isCustomGenre ? "expanded" : ""
                  }`}
                  aria-hidden={!isCustomGenre}
                >
                  <label>
                    <span>World name</span>
                    <input
                      value={customWorldName}
                      onChange={(event) => setCustomWorldName(event.target.value)}
                      placeholder="The Ashen Crownlands"
                      tabIndex={isCustomGenre ? 0 : -1}
                    />
                  </label>
                  <label>
                    <span>World description</span>
                    <textarea
                      value={customWorldDescription}
                      onChange={(event) =>
                        setCustomWorldDescription(event.target.value)
                      }
                      placeholder="A sea of floating islands ruled by oathbound sky courts, where every spell costs a memory..."
                      rows={7}
                      tabIndex={isCustomGenre ? 0 : -1}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {stepIndex === 2 ? (
              <div className="character-builder">
                <ol className="character-creation-steps" aria-label="Character creation progress">
                  {characterCreationSteps.map((step, index) => (
                    <li
                      className={[
                        index === characterStepIndex ? "active" : "",
                        index < characterStepIndex ? "complete" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={step}
                    >
                      <span>
                        {index < characterStepIndex ? <Check size={11} /> : index + 1}
                      </span>
                      <strong>{step}</strong>
                    </li>
                  ))}
                </ol>

                {characterStepIndex === 0 ? (
                  <fieldset className="option-picker build-mode-picker">
                    <legend>Build style</legend>
                    <div>
                      <button
                        type="button"
                        className={characterBuildMode === "quick" ? "selected" : ""}
                        aria-pressed={characterBuildMode === "quick"}
                        onClick={() => setCharacterBuildMode("quick")}
                      >
                        <strong>Quick Build</strong>
                        <small>Start fast with a ready-to-play Level 5 character.</small>
                      </button>
                      <button
                        type="button"
                        className={characterBuildMode === "custom" ? "selected" : ""}
                        aria-pressed={characterBuildMode === "custom"}
                        onClick={() => setCharacterBuildMode("custom")}
                      >
                        <strong>Custom Build</strong>
                        <small>Choose each Level 5 character detail step by step.</small>
                      </button>
                    </div>
                  </fieldset>
                ) : null}

                {characterStepIndex === 1 ? (
                  <fieldset className="option-picker class-picker">
                    <legend>Class</legend>
                    <div>
                      {classOptions.map((option) => (
                        <button
                          type="button"
                          className={characterClass === option.id ? "selected" : ""}
                          aria-pressed={characterClass === option.id}
                          key={option.id}
                          onClick={() => handleClassChange(option.id)}
                        >
                          <strong>{option.id}</strong>
                          <small>{option.summary}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {isQuickBuild && characterStepIndex === 2 ? (
                  <fieldset className="option-picker quick-fantasy-picker">
                    <legend>Character archetype</legend>
                    <div>
                      {quickBuildFantasyOptions.map((option) => (
                        <button
                          type="button"
                          className={quickBuildFantasy === option.id ? "selected" : ""}
                          aria-pressed={quickBuildFantasy === option.id}
                          key={option.id}
                          onClick={() => applyQuickBuildFantasy(option.id)}
                        >
                          <strong>{option.label}</strong>
                          <small>{option.summary}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {(!isQuickBuild && characterStepIndex === 2) ||
                (isQuickBuild && characterStepIndex === 3) ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Species</legend>
                    <div>
                      {speciesOptions.map((option) => (
                        <button
                          type="button"
                          className={characterSpecies === option ? "selected" : ""}
                          aria-pressed={characterSpecies === option}
                          key={option}
                          onClick={() => setCharacterSpecies(option)}
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {!isQuickBuild && characterStepIndex === 3 ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Background</legend>
                    <div>
                      {backgroundOptions.map((option) => (
                        <button
                          type="button"
                          className={characterBackground === option ? "selected" : ""}
                          aria-pressed={characterBackground === option}
                          key={option}
                          onClick={() => setCharacterBackground(option)}
                        >
                          <strong>{option}</strong>
                          <small>{formatList(backgroundSkills[option])}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {!isQuickBuild && characterStepIndex === 4 ? (
                  <section className="ability-score-panel">
                    <div className="character-step-note">
                      <strong>Level 5 scores</strong>
                      <span>These are the final scores after your Level 4 improvement.</span>
                    </div>
                    <div className="ability-score-grid">
                      {abilityDefinitions.map((ability) => (
                        <label key={ability.key}>
                          <span>{ability.label}</span>
                          <input
                            type="number"
                            min={3}
                            max={20}
                            value={abilityScores[ability.key]}
                            onChange={(event) => updateAbilityScore(ability.key, event.target.value)}
                          />
                          <strong>{formatModifier(getModifier(abilityScores[ability.key]))}</strong>
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}

                {!isQuickBuild && characterStepIndex === 5 ? (
                  <div className="character-builder-grid">
                    <fieldset className="option-picker compact-option-picker">
                      <legend>{selectedClass.subclassLabel}</legend>
                      <div>
                        {selectedClass.subclassOptions.map((option) => (
                          <button
                            type="button"
                            className={subclass === option ? "selected" : ""}
                            aria-pressed={subclass === option}
                            key={option}
                            onClick={() => setSubclass(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="option-picker compact-option-picker">
                      <legend>{selectedClass.featureLabel}</legend>
                      <div>
                        {selectedClass.featureOptions.map((option) => (
                          <button
                            type="button"
                            className={classFeatureChoice === option ? "selected" : ""}
                            aria-pressed={classFeatureChoice === option}
                            key={option}
                            onClick={() => setClassFeatureChoice(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : null}

                {!isQuickBuild && characterStepIndex === 6 ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Skills</legend>
                    <div>
                      {selectedClass.skillChoices.map((option) => (
                        <button
                          type="button"
                          className={selectedSkills.includes(option) ? "selected" : ""}
                          aria-pressed={selectedSkills.includes(option)}
                          key={option}
                          onClick={() => toggleSkill(option)}
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                    <p className="character-step-note">
                      Background adds: {formatList(backgroundSkillList)}
                    </p>
                  </fieldset>
                ) : null}

                {!isQuickBuild && characterStepIndex === 7 ? (
                  <div className="character-builder-grid">
                    <fieldset className="option-picker compact-option-picker">
                      <legend>Tool proficiency</legend>
                      <div>
                        {toolOptions.map((option) => (
                          <button
                            type="button"
                            className={selectedTool === option ? "selected" : ""}
                            aria-pressed={selectedTool === option}
                            key={option}
                            onClick={() => setSelectedTool(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="option-picker compact-option-picker">
                      <legend>Extra language</legend>
                      <div>
                        {languageOptions.map((option) => (
                          <button
                            type="button"
                            className={selectedLanguage === option ? "selected" : ""}
                            aria-pressed={selectedLanguage === option}
                            key={option}
                            onClick={() => setSelectedLanguage(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : null}

                {!isQuickBuild && characterStepIndex === 8 ? (
                  <fieldset className="option-picker equipment-picker">
                    <legend>Equipment</legend>
                    <div>
                      {selectedClass.equipmentKits.map((kit) => (
                        <button
                          type="button"
                          className={equipmentKitId === kit.id ? "selected" : ""}
                          aria-pressed={equipmentKitId === kit.id}
                          key={kit.id}
                          onClick={() => setEquipmentKitId(kit.id)}
                        >
                          <strong>{kit.id}</strong>
                          <small>AC {kit.armorClass} | {formatList(kit.gear)}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {!isQuickBuild && characterStepIndex === 9 ? (
                  hasSpells ? (
                    <fieldset className="option-picker compact-option-picker">
                      <legend>Spells</legend>
                      <div>
                        {selectedClass.spells.map((option) => (
                          <button
                            type="button"
                            className={selectedSpells.includes(option) ? "selected" : ""}
                            aria-pressed={selectedSpells.includes(option)}
                            key={option}
                            onClick={() => toggleSpell(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                      <p className="character-step-note">
                        Spell slots and spell attack numbers are calculated for Level 5.
                      </p>
                    </fieldset>
                  ) : (
                    <section className="character-current-pick">
                      <span>Spells</span>
                      <strong>{characterClass} has no spellcasting picks in this build.</strong>
                    </section>
                  )
                ) : null}

                {(!isQuickBuild && characterStepIndex === 10) ||
                (isQuickBuild && characterStepIndex === 4) ? (
                  <div className="identity-panel">
                    <div className="character-identity-fields">
                      {isJoinFlow ? (
                        <label>
                          <span>Player name</span>
                          <input
                            required
                            value={playerName}
                            onChange={(event) => setPlayerName(event.target.value)}
                            placeholder="Your name at the table"
                            autoFocus
                          />
                        </label>
                      ) : null}
                      <label>
                        <span>
                          {isJoinFlow
                            ? "Character name"
                            : mode === "single_player"
                            ? "Character name"
                            : "Owner character name"}
                        </span>
                        <input
                          required={requiresCharacterName}
                          value={characterName}
                          onChange={(event) => setCharacterName(event.target.value)}
                          placeholder={
                            mode === "multiplayer" && !isJoinFlow
                              ? "Optional for now"
                              : "Name your adventurer"
                          }
                          autoFocus={!isJoinFlow}
                        />
                      </label>
                    </div>

                    <fieldset className="option-picker compact-option-picker">
                      <legend>Alignment</legend>
                      <div>
                        {alignmentOptions.map((option) => (
                          <button
                            type="button"
                            className={alignment === option ? "selected" : ""}
                            aria-pressed={alignment === option}
                            key={option}
                            onClick={() => setAlignment(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : null}

                {(!isQuickBuild && characterStepIndex === 11) ||
                (isQuickBuild && characterStepIndex === 5) ? (
                  <>
                    <div className="character-summary-grid">
                      <div>
                        <span>Level</span>
                        <strong>{characterLevel}</strong>
                      </div>
                      <div>
                        <span>Class</span>
                        <strong>{characterClass}</strong>
                      </div>
                      <div>
                        <span>Species</span>
                        <strong>{characterSpecies}</strong>
                      </div>
                      <div>
                        <span>Background</span>
                        <strong>{characterBackground}</strong>
                      </div>
                      <div>
                        <span>Armor Class</span>
                        <strong>{selectedEquipmentKit.armorClass}</strong>
                      </div>
                      <div>
                        <span>Hit Points</span>
                        <strong>{maxHp}</strong>
                      </div>
                    </div>

                    <section className="character-sheet-preview">
                      <div>
                        <Sparkles size={18} />
                        <strong>Generated character sheet</strong>
                      </div>
                      <pre>{characterSheet}</pre>
                    </section>
                  </>
                ) : null}

              </div>
            ) : null}

            {stepIndex === 3 ? (
              <div className="creation-review">
                <ScrollText size={28} />
                <dl>
                  <div>
                    <dt>Mode</dt>
                    <dd>{modeLabel}</dd>
                  </div>
                  <div>
                    <dt>{mode === "single_player" ? "Campaign" : "Table"}</dt>
                    <dd>
                      {isJoinFlow
                        ? joinPreview?.campaignTitle ?? normalizedGameCode
                        : campaignDisplayName}
                    </dd>
                  </div>
                  {!isJoinFlow ? (
                    <div>
                      <dt>Genre</dt>
                      <dd>{selectedGenre.label}</dd>
                    </div>
                  ) : null}
                  {isCustomGenre && !isJoinFlow ? (
                    <div>
                      <dt>World</dt>
                      <dd>{customWorldDescription}</dd>
                    </div>
                  ) : null}
                  {isJoinFlow ? (
                    <div>
                      <dt>Game Code</dt>
                      <dd>{normalizedGameCode}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Build</dt>
                    <dd>
                      {characterBuildMode === "custom"
                        ? "Custom Build"
                        : "Quick Build"}
                    </dd>
                  </div>
                  <div>
                    <dt>{isJoinFlow ? "Player" : "Character"}</dt>
                    <dd>
                      {isJoinFlow && playerName ? `${playerName}: ` : ""}
                      {characterName || "Set later"}{" "}
                      {characterName
                        ? `the Level ${characterLevel} ${characterSpecies} ${characterClass}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Subclass</dt>
                    <dd>{subclass}</dd>
                  </div>
                  <div>
                    <dt>Background</dt>
                    <dd>{characterBackground}</dd>
                  </div>
                  <div>
                    <dt>Alignment</dt>
                    <dd>{alignment}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>

          <div className="new-adventure-error-slot">
            {error ? (
              <p className="new-adventure-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="creation-actions">
            <button
              type="button"
              className="creation-secondary"
              disabled={stepIndex === 0 || isCreating}
              onClick={handleBack}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button type="submit" disabled={isCreating}>
              {isCreating ? (
                isJoinFlow ? "Joining..." : "Creating..."
              ) : isLastStep ? (
                <>
                  {isJoinFlow ? "Join Game" : "Create Campaign"}
                  <Check size={16} />
                </>
              ) : (
                <>
                  {isCharacterStep ? "Next" : "Continue"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
