"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dice5,
  Minus,
  Plus,
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
import { DiceRollReveal3D } from "@/components/playing/DiceRollReveal3D";

type CampaignMode = "single_player" | "multiplayer";
type MultiplayerIntent = "create" | "join";
type FlowTransitionState = "idle" | "exiting" | "entering";

type JoinPreview = {
  code: string;
  campaignTitle: string;
  availableSlots: number;
  hasBegun: boolean;
};

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
type CompleteAbilityScores = Record<AbilityKey, number>;
type AbilityScores = Record<AbilityKey, number | null>;
type SpeciesAbilityBonuses = Partial<Record<AbilityKey, number>>;
type SkillName = (typeof skillDefinitions)[number]["name"];
type CharacterBuildMode = "quick" | "custom";
type StatGenerationMode = "roll" | "point_buy";
type SpellLevelLabel = "Cantrip" | "1st level" | "2nd level" | "3rd level";
type SpellGroup = {
  level: SpellLevelLabel;
  base: string[];
  dlc?: string[];
};
type DlcSpellVisibility = Partial<Record<SpellLevelLabel, boolean>>;
type SpellSelectionRule = {
  cantrips: number;
  fixedLeveledSpells?: number;
  preparedAbility?: AbilityKey;
  preparedLevelBonus?: number;
  availableLevels: SpellLevelLabel[];
  spellSlotsText: string;
};
type SpellSelectionLimits = {
  cantrips: number;
  leveledSpells: number;
  availableLevels: SpellLevelLabel[];
  spellSlotsText: string;
};
type SpellSelectionCounts = Record<SpellLevelLabel, number> & {
  leveledSpells: number;
};
type ActiveStatRoll = {
  id: string;
  expression: string;
  rolls: number[];
  total: number;
  scores: Partial<AbilityScores>;
};

const playerIdStorageKey = "ai-dnd.playerId";
const characterLevel = 5;
const proficiencyBonus = 3;
const flowTransitionDurationMs = 240;
const createSteps = ["Mode", "Campaign", "Character", "Review"];
const customCreateSteps = ["Mode", "Campaign", "Custom World", "Character", "Review"];
const multiplayerCreateSteps = ["Mode", "Multiplayer", "Campaign", "Character", "Review"];
const multiplayerCustomCreateSteps = [
  "Mode",
  "Multiplayer",
  "Campaign",
  "Custom World",
  "Character",
  "Review"
];
const joinSteps = ["Mode", "Multiplayer", "Game Code", "Character", "Review"];
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
  "Class Choices",
  "Species",
  "Stats",
  "Spells",
  "Skills",
  "Background",
  "Proficiencies",
  "Equipment",
  "Identity",
  "Sheet"
];
const quickCharacterCreationSteps = [
  "Build",
  "Class",
  "Species",
  "Identity",
  "Sheet"
];
const campaignGenres = [...campaignGenrePresets, customCampaignGenre];
const campaignWorldOptions = [
  campaignGenrePresets[0],
  customCampaignGenre
];
const abilityDefinitions = [
  { key: "str", label: "Strength" },
  { key: "dex", label: "Dexterity" },
  { key: "con", label: "Constitution" },
  { key: "int", label: "Intelligence" },
  { key: "wis", label: "Wisdom" },
  { key: "cha", label: "Charisma" }
] as const;
const emptyAbilityScores: AbilityScores = {
  str: null,
  dex: null,
  con: null,
  int: null,
  wis: null,
  cha: null
};
const pointBuyDefaultScores: CompleteAbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
};
const pointBuyBudget = 27;
const pointBuyCosts: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
};
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
const spellLevelOrder: SpellLevelLabel[] = [
  "Cantrip",
  "1st level",
  "2nd level",
  "3rd level"
];
const fullCasterSpellLevels: SpellLevelLabel[] = [
  "Cantrip",
  "1st level",
  "2nd level",
  "3rd level"
];
const halfCasterSpellLevels: SpellLevelLabel[] = [
  "1st level",
  "2nd level"
];
const spellSelectionRules: Record<string, SpellSelectionRule> = {
  Bard: {
    cantrips: 3,
    fixedLeveledSpells: 8,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  },
  Cleric: {
    cantrips: 4,
    preparedAbility: "wis",
    preparedLevelBonus: characterLevel,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  },
  Druid: {
    cantrips: 3,
    preparedAbility: "wis",
    preparedLevelBonus: characterLevel,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  },
  Paladin: {
    cantrips: 0,
    preparedAbility: "cha",
    preparedLevelBonus: Math.floor(characterLevel / 2),
    availableLevels: halfCasterSpellLevels,
    spellSlotsText: "4 first-level, 2 second-level"
  },
  Ranger: {
    cantrips: 0,
    fixedLeveledSpells: 4,
    availableLevels: halfCasterSpellLevels,
    spellSlotsText: "4 first-level, 2 second-level"
  },
  Sorcerer: {
    cantrips: 5,
    fixedLeveledSpells: 6,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  },
  Warlock: {
    cantrips: 3,
    fixedLeveledSpells: 6,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "2 third-level pact slots"
  },
  Wizard: {
    cantrips: 4,
    preparedAbility: "int",
    preparedLevelBonus: characterLevel,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  }
};
const spellSourceLabels: Record<string, string> = {
  "Absorb Elements": "Xanathar's Guide to Everything",
  "Aganazzar's Scorcher": "Xanathar's Guide to Everything",
  "Air Bubble": "Spelljammer: Astral Adventurer's Guide",
  Antagonize: "The Book of Many Things",
  "Ashardalon's Stride": "Fizban's Treasury of Dragons",
  "Beast Bond": "Xanathar's Guide to Everything",
  "Borrowed Knowledge": "Strixhaven: A Curriculum of Chaos",
  Catapult: "Xanathar's Guide to Everything",
  Catnap: "Xanathar's Guide to Everything",
  "Cause Fear": "Xanathar's Guide to Everything",
  Ceremony: "Xanathar's Guide to Everything",
  "Chaos Bolt": "Xanathar's Guide to Everything",
  "Control Flames": "Xanathar's Guide to Everything",
  "Create Bonfire": "Xanathar's Guide to Everything",
  "Distort Value": "Acquisitions Incorporated",
  "Dragon's Breath": "Xanathar's Guide to Everything",
  "Dust Devil": "Xanathar's Guide to Everything",
  "Earth Tremor": "Xanathar's Guide to Everything",
  Earthbind: "Xanathar's Guide to Everything",
  "Enemies Abound": "Xanathar's Guide to Everything",
  "Erupting Earth": "Xanathar's Guide to Everything",
  "Fast Friends": "Acquisitions Incorporated",
  "Flame Arrows": "Xanathar's Guide to Everything",
  "Flock of Familiars": "Lost Laboratory of Kwalish",
  "Fortune's Favor": "Explorer's Guide to Wildemount",
  "Frost Fingers": "Icewind Dale: Rime of the Frostmaiden",
  Frostbite: "Xanathar's Guide to Everything",
  "Galder's Tower": "Lost Laboratory of Kwalish",
  "Gift of Alacrity": "Explorer's Guide to Wildemount",
  "Gift of Gab": "Acquisitions Incorporated",
  Gust: "Xanathar's Guide to Everything",
  "Healing Spirit": "Xanathar's Guide to Everything",
  "Ice Knife": "Xanathar's Guide to Everything",
  "Immovable Object": "Explorer's Guide to Wildemount",
  "Incite Greed": "Acquisitions Incorporated",
  Infestation: "Xanathar's Guide to Everything",
  "Jim's Glowing Coin": "Acquisitions Incorporated",
  "Jim's Magic Missile": "Acquisitions Incorporated",
  "Kinetic Jaunt": "Strixhaven: A Curriculum of Chaos",
  "Life Transference": "Xanathar's Guide to Everything",
  "Lightning Arrow": "Player's Handbook",
  "Magic Stone": "Xanathar's Guide to Everything",
  "Magnify Gravity": "Explorer's Guide to Wildemount",
  "Maximillian's Earthen Grasp": "Xanathar's Guide to Everything",
  "Melf's Minute Meteors": "Xanathar's Guide to Everything",
  "Mind Spike": "Xanathar's Guide to Everything",
  "Mold Earth": "Xanathar's Guide to Everything",
  "Motivational Speech": "Acquisitions Incorporated",
  "Nathair's Mischief": "Fizban's Treasury of Dragons",
  "Primal Savagery": "Xanathar's Guide to Everything",
  "Pulse Wave": "Explorer's Guide to Wildemount",
  Pyrotechnics: "Xanathar's Guide to Everything",
  "Rime's Binding Ice": "Fizban's Treasury of Dragons",
  "Sapping Sting": "Explorer's Guide to Wildemount",
  "Shadow Blade": "Xanathar's Guide to Everything",
  "Shape Water": "Xanathar's Guide to Everything",
  "Silvery Barbs": "Strixhaven: A Curriculum of Chaos",
  Skywrite: "Xanathar's Guide to Everything",
  Snare: "Xanathar's Guide to Everything",
  "Snilloc's Snowball Swarm": "Xanathar's Guide to Everything",
  "Spray of Cards": "The Book of Many Things",
  "Summon Lesser Demons": "Xanathar's Guide to Everything",
  "Thunder Step": "Xanathar's Guide to Everything",
  Thunderclap: "Xanathar's Guide to Everything",
  "Tidal Wave": "Xanathar's Guide to Everything",
  "Tiny Servant": "Xanathar's Guide to Everything",
  "Toll the Dead": "Xanathar's Guide to Everything",
  "Vortex Warp": "Strixhaven: A Curriculum of Chaos",
  "Wall of Sand": "Xanathar's Guide to Everything",
  "Wall of Water": "Xanathar's Guide to Everything",
  "Warding Wind": "Xanathar's Guide to Everything",
  "Warp Sense": "Planescape: Adventures in the Multiverse",
  "Wither and Bloom": "Strixhaven: A Curriculum of Chaos",
  "Word of Radiance": "Xanathar's Guide to Everything",
  Wristpocket: "Explorer's Guide to Wildemount",
  "Zephyr Strike": "Xanathar's Guide to Everything"
};
const spellCatalog = {
  Bard: [
    {
      level: "Cantrip",
      base: ["Blade Ward", "Dancing Lights", "Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Prestidigitation", "True Strike", "Vicious Mockery"],
      dlc: ["Thunderclap"]
    },
    {
      level: "1st level",
      base: ["Animal Friendship", "Bane", "Charm Person", "Comprehend Languages", "Cure Wounds", "Detect Magic", "Disguise Self", "Dissonant Whispers", "Faerie Fire", "Feather Fall", "Healing Word", "Heroism", "Identify", "Illusory Script", "Longstrider", "Silent Image", "Sleep", "Speak with Animals", "Tasha's Hideous Laughter", "Thunderwave", "Unseen Servant"],
      dlc: ["Distort Value", "Earth Tremor", "Silvery Barbs"]
    },
    {
      level: "2nd level",
      base: ["Animal Messenger", "Blindness/Deafness", "Calm Emotions", "Cloud of Daggers", "Crown of Madness", "Detect Thoughts", "Enhance Ability", "Enthrall", "Heat Metal", "Hold Person", "Invisibility", "Knock", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Magic Mouth", "Phantasmal Force", "See Invisibility", "Shatter", "Silence", "Suggestion", "Zone of Truth"],
      dlc: ["Borrowed Knowledge", "Gift of Gab", "Kinetic Jaunt", "Nathair's Mischief", "Pyrotechnics", "Skywrite", "Spray of Cards", "Warding Wind"]
    },
    {
      level: "3rd level",
      base: ["Bestow Curse", "Clairvoyance", "Dispel Magic", "Fear", "Feign Death", "Glyph of Warding", "Hypnotic Pattern", "Leomund's Tiny Hut", "Major Image", "Nondetection", "Plant Growth", "Sending", "Speak with Dead", "Speak with Plants", "Stinking Cloud", "Tongues"],
      dlc: ["Antagonize", "Catnap", "Enemies Abound", "Fast Friends", "Motivational Speech"]
    }
  ],
  Cleric: [
    {
      level: "Cantrip",
      base: ["Guidance", "Light", "Mending", "Resistance", "Sacred Flame", "Spare the Dying", "Thaumaturgy"],
      dlc: ["Toll the Dead", "Word of Radiance"]
    },
    {
      level: "1st level",
      base: ["Bane", "Bless", "Command", "Create or Destroy Water", "Cure Wounds", "Detect Evil and Good", "Detect Magic", "Detect Poison and Disease", "Guiding Bolt", "Healing Word", "Inflict Wounds", "Protection from Evil and Good", "Purify Food and Drink", "Sanctuary", "Shield of Faith"],
      dlc: ["Ceremony"]
    },
    {
      level: "2nd level",
      base: ["Aid", "Augury", "Blindness/Deafness", "Calm Emotions", "Continual Flame", "Enhance Ability", "Find Traps", "Gentle Repose", "Hold Person", "Lesser Restoration", "Locate Object", "Prayer of Healing", "Protection from Poison", "Silence", "Spiritual Weapon", "Warding Bond", "Zone of Truth"],
      dlc: ["Borrowed Knowledge"]
    },
    {
      level: "3rd level",
      base: ["Animate Dead", "Beacon of Hope", "Bestow Curse", "Clairvoyance", "Create Food and Water", "Daylight", "Dispel Magic", "Feign Death", "Glyph of Warding", "Magic Circle", "Mass Healing Word", "Meld into Stone", "Protection from Energy", "Remove Curse", "Revivify", "Sending", "Speak with Dead", "Spirit Guardians", "Tongues", "Water Walk"],
      dlc: ["Fast Friends", "Incite Greed", "Life Transference", "Motivational Speech"]
    }
  ],
  Druid: [
    {
      level: "Cantrip",
      base: ["Druidcraft", "Guidance", "Mending", "Poison Spray", "Produce Flame", "Resistance", "Shillelagh", "Thorn Whip"],
      dlc: ["Control Flames", "Create Bonfire", "Frostbite", "Gust", "Infestation", "Magic Stone", "Mold Earth", "Primal Savagery", "Shape Water", "Thunderclap"]
    },
    {
      level: "1st level",
      base: ["Animal Friendship", "Charm Person", "Create or Destroy Water", "Cure Wounds", "Detect Magic", "Detect Poison and Disease", "Entangle", "Faerie Fire", "Fog Cloud", "Goodberry", "Healing Word", "Jump", "Longstrider", "Purify Food and Drink", "Speak with Animals", "Thunderwave"],
      dlc: ["Absorb Elements", "Beast Bond", "Earth Tremor", "Ice Knife", "Snare"]
    },
    {
      level: "2nd level",
      base: ["Animal Messenger", "Barkskin", "Beast Sense", "Darkvision", "Enhance Ability", "Find Traps", "Flame Blade", "Flaming Sphere", "Gust of Wind", "Heat Metal", "Hold Person", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Moonbeam", "Pass without Trace", "Protection from Poison", "Spike Growth"],
      dlc: ["Air Bubble", "Dust Devil", "Earthbind", "Healing Spirit", "Skywrite", "Warding Wind", "Wither and Bloom"]
    },
    {
      level: "3rd level",
      base: ["Call Lightning", "Conjure Animals", "Daylight", "Dispel Magic", "Feign Death", "Meld into Stone", "Plant Growth", "Protection from Energy", "Sleet Storm", "Speak with Plants", "Water Breathing", "Water Walk", "Wind Wall"],
      dlc: ["Erupting Earth", "Flame Arrows", "Tidal Wave", "Wall of Water"]
    }
  ],
  Paladin: [
    {
      level: "1st level",
      base: ["Bless", "Command", "Compelled Duel", "Cure Wounds", "Detect Evil and Good", "Detect Magic", "Detect Poison and Disease", "Divine Favor", "Heroism", "Protection from Evil and Good", "Purify Food and Drink", "Searing Smite", "Shield of Faith", "Thunderous Smite", "Wrathful Smite"],
      dlc: ["Ceremony"]
    },
    {
      level: "2nd level",
      base: ["Aid", "Branding Smite", "Find Steed", "Lesser Restoration", "Locate Object", "Magic Weapon", "Protection from Poison", "Zone of Truth"]
    },
    {
      level: "3rd level",
      base: ["Aura of Vitality", "Blinding Smite", "Create Food and Water", "Crusader's Mantle", "Daylight", "Dispel Magic", "Elemental Weapon", "Magic Circle", "Remove Curse", "Revivify"]
    }
  ],
  Ranger: [
    {
      level: "1st level",
      base: ["Alarm", "Animal Friendship", "Cure Wounds", "Detect Magic", "Detect Poison and Disease", "Ensnaring Strike", "Fog Cloud", "Goodberry", "Hail of Thorns", "Hunter's Mark", "Jump", "Longstrider", "Speak with Animals"],
      dlc: ["Absorb Elements", "Beast Bond", "Snare", "Zephyr Strike"]
    },
    {
      level: "2nd level",
      base: ["Animal Messenger", "Barkskin", "Beast Sense", "Cordon of Arrows", "Darkvision", "Find Traps", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Pass without Trace", "Protection from Poison", "Silence", "Spike Growth"],
      dlc: ["Air Bubble", "Healing Spirit"]
    },
    {
      level: "3rd level",
      base: ["Conjure Animals", "Conjure Barrage", "Daylight", "Nondetection", "Plant Growth", "Protection from Energy", "Speak with Plants", "Water Breathing", "Water Walk", "Wind Wall"],
      dlc: ["Ashardalon's Stride", "Flame Arrows", "Lightning Arrow"]
    }
  ],
  Sorcerer: [
    {
      level: "Cantrip",
      base: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
      dlc: ["Control Flames", "Create Bonfire", "Frostbite", "Gust", "Infestation", "Mold Earth", "Shape Water", "Thunderclap"]
    },
    {
      level: "1st level",
      base: ["Burning Hands", "Charm Person", "Chromatic Orb", "Color Spray", "Comprehend Languages", "Detect Magic", "Disguise Self", "Expeditious Retreat", "False Life", "Feather Fall", "Fog Cloud", "Jump", "Mage Armor", "Magic Missile", "Ray of Sickness", "Shield", "Silent Image", "Sleep", "Thunderwave", "Witch Bolt"],
      dlc: ["Absorb Elements", "Catapult", "Chaos Bolt", "Distort Value", "Earth Tremor", "Ice Knife", "Silvery Barbs"]
    },
    {
      level: "2nd level",
      base: ["Alter Self", "Blindness/Deafness", "Blur", "Cloud of Daggers", "Crown of Madness", "Darkness", "Darkvision", "Detect Thoughts", "Enhance Ability", "Enlarge/Reduce", "Gust of Wind", "Hold Person", "Invisibility", "Knock", "Levitate", "Mirror Image", "Misty Step", "Phantasmal Force", "Scorching Ray", "See Invisibility", "Shatter", "Spider Climb", "Suggestion", "Web"],
      dlc: ["Aganazzar's Scorcher", "Air Bubble", "Dragon's Breath", "Dust Devil", "Earthbind", "Kinetic Jaunt", "Maximillian's Earthen Grasp", "Mind Spike", "Nathair's Mischief", "Pyrotechnics", "Rime's Binding Ice", "Shadow Blade", "Snilloc's Snowball Swarm", "Spray of Cards", "Vortex Warp", "Warding Wind", "Warp Sense", "Wither and Bloom"]
    },
    {
      level: "3rd level",
      base: ["Blink", "Clairvoyance", "Counterspell", "Daylight", "Dispel Magic", "Fear", "Fireball", "Fly", "Gaseous Form", "Haste", "Hypnotic Pattern", "Lightning Bolt", "Major Image", "Protection from Energy", "Sleet Storm", "Slow", "Stinking Cloud", "Tongues", "Water Breathing", "Water Walk"],
      dlc: ["Antagonize", "Ashardalon's Stride", "Catnap", "Enemies Abound", "Erupting Earth", "Flame Arrows", "Incite Greed", "Melf's Minute Meteors", "Thunder Step", "Tidal Wave", "Wall of Water"]
    }
  ],
  Warlock: [
    {
      level: "Cantrip",
      base: ["Blade Ward", "Chill Touch", "Eldritch Blast", "Friends", "Mage Hand", "Minor Illusion", "Poison Spray", "Prestidigitation", "True Strike"],
      dlc: ["Create Bonfire", "Frostbite", "Infestation", "Magic Stone", "Thunderclap", "Toll the Dead"]
    },
    {
      level: "1st level",
      base: ["Armor of Agathys", "Arms of Hadar", "Charm Person", "Comprehend Languages", "Expeditious Retreat", "Hellish Rebuke", "Hex", "Illusory Script", "Protection from Evil and Good", "Unseen Servant", "Witch Bolt"],
      dlc: ["Cause Fear", "Distort Value"]
    },
    {
      level: "2nd level",
      base: ["Cloud of Daggers", "Crown of Madness", "Darkness", "Enthrall", "Hold Person", "Invisibility", "Mirror Image", "Misty Step", "Ray of Enfeeblement", "Shatter", "Spider Climb", "Suggestion"],
      dlc: ["Borrowed Knowledge", "Earthbind", "Flock of Familiars", "Mind Spike", "Shadow Blade", "Spray of Cards", "Warp Sense"]
    },
    {
      level: "3rd level",
      base: ["Counterspell", "Dispel Magic", "Fear", "Fly", "Gaseous Form", "Hunger of Hadar", "Hypnotic Pattern", "Magic Circle", "Major Image", "Remove Curse", "Tongues", "Vampiric Touch"],
      dlc: ["Antagonize", "Enemies Abound", "Incite Greed", "Summon Lesser Demons", "Thunder Step"]
    }
  ],
  Wizard: [
    {
      level: "Cantrip",
      base: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
      dlc: ["Control Flames", "Create Bonfire", "Frostbite", "Gust", "Infestation", "Mold Earth", "Sapping Sting", "Shape Water", "Thunderclap", "Toll the Dead"]
    },
    {
      level: "1st level",
      base: ["Alarm", "Burning Hands", "Charm Person", "Chromatic Orb", "Color Spray", "Comprehend Languages", "Detect Magic", "Disguise Self", "Expeditious Retreat", "False Life", "Feather Fall", "Find Familiar", "Fog Cloud", "Grease", "Identify", "Illusory Script", "Jump", "Longstrider", "Mage Armor", "Magic Missile", "Protection from Evil and Good", "Ray of Sickness", "Shield", "Silent Image", "Sleep", "Tasha's Hideous Laughter", "Tenser's Floating Disk", "Thunderwave", "Unseen Servant", "Witch Bolt"],
      dlc: ["Absorb Elements", "Catapult", "Cause Fear", "Distort Value", "Earth Tremor", "Frost Fingers", "Gift of Alacrity", "Ice Knife", "Jim's Magic Missile", "Magnify Gravity", "Silvery Barbs", "Snare"]
    },
    {
      level: "2nd level",
      base: ["Alter Self", "Arcane Lock", "Blindness/Deafness", "Blur", "Cloud of Daggers", "Continual Flame", "Crown of Madness", "Darkness", "Darkvision", "Detect Thoughts", "Enlarge/Reduce", "Flaming Sphere", "Gentle Repose", "Gust of Wind", "Hold Person", "Invisibility", "Knock", "Levitate", "Locate Object", "Magic Mouth", "Magic Weapon", "Melf's Acid Arrow", "Mirror Image", "Misty Step", "Nystul's Magic Aura", "Phantasmal Force", "Ray of Enfeeblement", "Rope Trick", "Scorching Ray", "See Invisibility", "Shatter", "Spider Climb", "Suggestion", "Web"],
      dlc: ["Aganazzar's Scorcher", "Air Bubble", "Borrowed Knowledge", "Dragon's Breath", "Dust Devil", "Earthbind", "Flock of Familiars", "Fortune's Favor", "Gift of Gab", "Immovable Object", "Jim's Glowing Coin", "Kinetic Jaunt", "Maximillian's Earthen Grasp", "Mind Spike", "Nathair's Mischief", "Pyrotechnics", "Rime's Binding Ice", "Shadow Blade", "Skywrite", "Snilloc's Snowball Swarm", "Spray of Cards", "Vortex Warp", "Warding Wind", "Warp Sense", "Wither and Bloom", "Wristpocket"]
    },
    {
      level: "3rd level",
      base: ["Animate Dead", "Bestow Curse", "Blink", "Clairvoyance", "Counterspell", "Dispel Magic", "Fear", "Feign Death", "Fireball", "Fly", "Gaseous Form", "Glyph of Warding", "Haste", "Hypnotic Pattern", "Leomund's Tiny Hut", "Lightning Bolt", "Magic Circle", "Major Image", "Nondetection", "Phantom Steed", "Protection from Energy", "Remove Curse", "Sending", "Sleet Storm", "Slow", "Stinking Cloud", "Tongues", "Vampiric Touch", "Water Breathing"],
      dlc: ["Antagonize", "Ashardalon's Stride", "Catnap", "Enemies Abound", "Erupting Earth", "Fast Friends", "Flame Arrows", "Galder's Tower", "Incite Greed", "Life Transference", "Melf's Minute Meteors", "Pulse Wave", "Summon Lesser Demons", "Thunder Step", "Tidal Wave", "Tiny Servant", "Wall of Sand", "Wall of Water"]
    }
  ]
} satisfies Partial<Record<string, SpellGroup[]>>;
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
    spellGroups: []
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
    spellGroups: spellCatalog.Bard
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
    spellGroups: spellCatalog.Cleric
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
    spellGroups: spellCatalog.Druid
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
    spellGroups: []
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
    spellGroups: []
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
    spellGroups: spellCatalog.Paladin
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
    spellGroups: spellCatalog.Ranger
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
    spellGroups: []
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
    spellGroups: spellCatalog.Sorcerer
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
    spellGroups: spellCatalog.Warlock
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
    spellGroups: spellCatalog.Wizard
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
const defaultAbilityScoresByClass: Record<CharacterClass, CompleteAbilityScores> = {
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

const speciesAbilityBonuses: Record<CharacterSpecies, SpeciesAbilityBonuses> = {
  Human: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
  Elf: { dex: 2 },
  Dwarf: { con: 2 },
  Halfling: { dex: 2 },
  Gnome: { int: 2 },
  "Half-Elf": { cha: 2 },
  "Half-Orc": { str: 2, con: 1 },
  Tiefling: { int: 1, cha: 2 },
  Dragonborn: { str: 2, cha: 1 }
};

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

function spellOptionsFor(
  spellGroups: readonly SpellGroup[],
  dlcVisibility: DlcSpellVisibility = {}
) {
  return spellGroups.flatMap((group) => [
    ...group.base,
    ...(dlcVisibility[group.level] ? group.dlc ?? [] : [])
  ]);
}

function spellSelectionLimitsFor(
  characterClass: string,
  abilityScores: CompleteAbilityScores
): SpellSelectionLimits {
  const rule = spellSelectionRules[characterClass];

  if (!rule) {
    return {
      cantrips: 0,
      leveledSpells: 0,
      availableLevels: [],
      spellSlotsText: "None"
    };
  }

  const leveledSpells =
    rule.fixedLeveledSpells ??
    Math.max(
      1,
      (rule.preparedLevelBonus ?? 0) +
        getModifier(abilityScores[rule.preparedAbility ?? "int"])
    );

  return {
    cantrips: rule.cantrips,
    leveledSpells,
    availableLevels: rule.availableLevels,
    spellSlotsText: rule.spellSlotsText
  };
}

function spellLevelFor(
  spellGroups: readonly SpellGroup[],
  spell: string
): SpellLevelLabel | null {
  return (
    spellGroups.find(
      (group) => group.base.includes(spell) || (group.dlc ?? []).includes(spell)
    )?.level ?? null
  );
}

function selectedSpellCountsFor(
  spellGroups: readonly SpellGroup[],
  selectedSpells: readonly string[]
): SpellSelectionCounts {
  const counts: SpellSelectionCounts = {
    Cantrip: 0,
    "1st level": 0,
    "2nd level": 0,
    "3rd level": 0,
    leveledSpells: 0
  };

  selectedSpells.forEach((spell) => {
    const level = spellLevelFor(spellGroups, spell);

    if (!level) {
      return;
    }

    counts[level] += 1;

    if (level !== "Cantrip") {
      counts.leveledSpells += 1;
    }
  });

  return counts;
}

function isSpellLevelAvailable(
  level: SpellLevelLabel,
  limits: SpellSelectionLimits
) {
  return limits.availableLevels.includes(level);
}

function isSpellSelectionLimitReached(
  spellGroups: readonly SpellGroup[],
  selectedSpells: readonly string[],
  spell: string,
  limits: SpellSelectionLimits
) {
  if (selectedSpells.includes(spell)) {
    return false;
  }

  const level = spellLevelFor(spellGroups, spell);

  if (!level || !isSpellLevelAvailable(level, limits)) {
    return true;
  }

  const counts = selectedSpellCountsFor(spellGroups, selectedSpells);

  if (level === "Cantrip") {
    return counts.Cantrip >= limits.cantrips;
  }

  return counts.leveledSpells >= limits.leveledSpells;
}

function defaultSpellSelectionFor(
  spellGroups: readonly SpellGroup[],
  limits: SpellSelectionLimits
) {
  const cantripGroup = spellGroups.find((group) => group.level === "Cantrip");
  const cantripDefaults = cantripGroup
    ? cantripGroup.base.slice(0, Math.min(2, limits.cantrips))
    : [];
  const defaultTotal = 5;
  const leveledDefaults = spellGroups
    .filter(
      (group) =>
        group.level !== "Cantrip" && isSpellLevelAvailable(group.level, limits)
    )
    .flatMap((group) => group.base)
    .slice(
      0,
      Math.min(limits.leveledSpells, Math.max(0, defaultTotal - cantripDefaults.length))
    );

  return [...cantripDefaults, ...leveledDefaults];
}

function pruneSpellSelection(
  spellGroups: readonly SpellGroup[],
  selectedSpells: readonly string[],
  limits: SpellSelectionLimits
) {
  const nextSpells: string[] = [];
  const counts: SpellSelectionCounts = {
    Cantrip: 0,
    "1st level": 0,
    "2nd level": 0,
    "3rd level": 0,
    leveledSpells: 0
  };

  selectedSpells.forEach((spell) => {
    const level = spellLevelFor(spellGroups, spell);

    if (!level || !isSpellLevelAvailable(level, limits)) {
      return;
    }

    if (level === "Cantrip") {
      if (counts.Cantrip >= limits.cantrips) {
        return;
      }

      counts.Cantrip += 1;
      nextSpells.push(spell);
      return;
    }

    if (counts.leveledSpells >= limits.leveledSpells) {
      return;
    }

    counts[level] += 1;
    counts.leveledSpells += 1;
    nextSpells.push(spell);
  });

  return nextSpells;
}

function formatSelectedSpellLines(
  spellGroups: readonly SpellGroup[],
  selectedSpells: readonly string[]
) {
  return spellLevelOrder
    .map((level) => {
      const group = spellGroups.find((spellGroup) => spellGroup.level === level);

      if (!group) {
        return null;
      }

      const selectedForLevel = [...group.base, ...(group.dlc ?? [])].filter((spell) =>
        selectedSpells.includes(spell)
      );

      return selectedForLevel.length > 0
        ? `${level === "Cantrip" ? "Cantrips" : level}: ${formatList(selectedForLevel)}`
        : null;
    })
    .filter((line): line is string => Boolean(line));
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function classAbilityBonusesFor(
  characterClass: CharacterClass,
  classFeatureChoice: string
) {
  const bonuses: SpeciesAbilityBonuses = {};
  const abilityNames = abilityDefinitions
    .map((ability) => ability.label)
    .join("|");
  const bonusPattern = new RegExp(`\\+(\\d+)\\s+(${abilityNames})`, "g");

  for (const match of classFeatureChoice.matchAll(bonusPattern)) {
    const ability = abilityDefinitions.find(
      (definition) => definition.label === match[2]
    );

    if (ability) {
      bonuses[ability.key] = (bonuses[ability.key] ?? 0) + Number(match[1]);
    }
  }

  return bonuses;
}

function formatAbilityBonusSources(
  species: CharacterSpecies,
  characterClass: CharacterClass,
  classFeatureChoice: string,
  ability: AbilityKey
) {
  const speciesBonus = speciesAbilityBonuses[species][ability] ?? 0;
  const classBonus =
    classAbilityBonusesFor(characterClass, classFeatureChoice)[ability] ?? 0;
  const bonus = speciesBonus + classBonus;

  if (bonus === 0) {
    return {
      bonusText: "+0",
      sourceText: ""
    };
  }

  const sources: string[] = [];

  if (speciesBonus > 0) {
    sources.push(species);
  }

  if (classBonus > 0) {
    sources.push(characterClass);
  }

  const sourceText =
    sources.length === 1
      ? `${sources[0]} bonus`
      : `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]} bonus`;

  return {
    bonusText: formatModifier(bonus),
    sourceText
  };
}

function pointBuyScoreFor(scores: AbilityScores, ability: AbilityKey) {
  return scores[ability] ?? pointBuyDefaultScores[ability];
}

function getPointBuyPointsSpent(scores: AbilityScores) {
  return abilityDefinitions.reduce(
    (total, ability) =>
      total + pointBuyCosts[pointBuyScoreFor(scores, ability.key)],
    0
  );
}

function getModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function getAverageHp(hitDie: number, constitutionModifier: number) {
  return hitDie + constitutionModifier + (characterLevel - 1) * (Math.floor(hitDie / 2) + 1 + constitutionModifier);
}

function predeterminedDiceNotation(dice: string, rolls: number[]) {
  return `${dice.replace(/\s+/g, "")}@${rolls.join(",")}`;
}

function rollFourD6DropLowest() {
  const rolls = Array.from(
    { length: 4 },
    () => Math.floor(Math.random() * 6) + 1
  );
  const total = [...rolls]
    .sort((left, right) => right - left)
    .slice(0, 3)
    .reduce((sum, roll) => sum + roll, 0);

  return {
    rolls,
    total
  };
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
  const [characterClass, setCharacterClass] = useState<CharacterClass>("Fighter");
  const [characterSpecies, setCharacterSpecies] = useState<CharacterSpecies>("Human");
  const [characterBackground, setCharacterBackground] = useState<CharacterBackground>("Folk Hero");
  const [abilityScores, setAbilityScores] = useState<AbilityScores>({
    ...emptyAbilityScores
  });
  const [activeStatRoll, setActiveStatRoll] = useState<ActiveStatRoll | null>(null);
  const [statGenerationMode, setStatGenerationMode] =
    useState<StatGenerationMode>("roll");
  const [subclass, setSubclass] = useState("Champion");
  const [classFeatureChoice, setClassFeatureChoice] = useState("Defense");
  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>(["Athletics", "Perception"]);
  const [selectedTool, setSelectedTool] = useState<(typeof toolOptions)[number]>("Dice set");
  const [selectedLanguage, setSelectedLanguage] = useState<(typeof languageOptions)[number]>("Elvish");
  const [equipmentKitId, setEquipmentKitId] = useState("Sword and shield");
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [dlcSpellVisibility, setDlcSpellVisibility] = useState<DlcSpellVisibility>({});
  const [alignment, setAlignment] = useState<Alignment>("Neutral Good");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationLoadingStep, setCreationLoadingStep] = useState(0);
  const [flowTransition, setFlowTransition] =
    useState<FlowTransitionState>("idle");
  const isFlowTransitioning = flowTransition !== "idle";
  const isJoinFlow = mode === "multiplayer" && multiplayerIntent === "join";
  const isCustomGenre = campaignGenre === "custom";
  const hasCustomWorldStep = !isJoinFlow && isCustomGenre;
  const steps =
    mode === "multiplayer"
      ? isJoinFlow
        ? joinSteps
        : hasCustomWorldStep
        ? multiplayerCustomCreateSteps
        : multiplayerCreateSteps
      : hasCustomWorldStep
      ? customCreateSteps
      : createSteps;
  const isLastStep = stepIndex === steps.length - 1;
  const multiplayerIntentStepIndex = mode === "multiplayer" ? 1 : -1;
  const campaignDetailsStepIndex = mode === "multiplayer" ? 2 : 1;
  const customWorldStepIndex = hasCustomWorldStep ? campaignDetailsStepIndex + 1 : -1;
  const characterStepIndexInFlow = campaignDetailsStepIndex + (hasCustomWorldStep ? 2 : 1);
  const reviewStepIndex = characterStepIndexInFlow + 1;
  const isMultiplayerIntentStep = stepIndex === multiplayerIntentStepIndex;
  const isCampaignDetailsStep = stepIndex === campaignDetailsStepIndex;
  const isCustomWorldStep = stepIndex === customWorldStepIndex;
  const isCharacterStep = stepIndex === characterStepIndexInFlow;
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
  const campaignDisplayName = isCustomGenre
    ? customWorldName.trim() || "Custom World"
    : `${selectedGenre.label} Adventure`;
  const selectedClass = classOptions.find((option) => option.id === characterClass) ?? classOptions[4];
  const defaultAbilityScores = defaultAbilityScoresByClass[characterClass];
  const resolvedAbilityScores = useMemo<CompleteAbilityScores>(
    () => ({
      str: abilityScores.str ?? defaultAbilityScores.str,
      dex: abilityScores.dex ?? defaultAbilityScores.dex,
      con: abilityScores.con ?? defaultAbilityScores.con,
      int: abilityScores.int ?? defaultAbilityScores.int,
      wis: abilityScores.wis ?? defaultAbilityScores.wis,
      cha: abilityScores.cha ?? defaultAbilityScores.cha
    }),
    [abilityScores, defaultAbilityScores]
  );
  const areAllStatsRolled = abilityDefinitions.every(
    ({ key }) => abilityScores[key] !== null
  );
  const pointBuyPointsRemaining =
    pointBuyBudget - getPointBuyPointsSpent(abilityScores);
  const selectedEquipmentKit = selectedClass.equipmentKits.find((kit) => kit.id === equipmentKitId) ?? selectedClass.equipmentKits[0];
  const backgroundSkillList = backgroundSkills[characterBackground] ?? [];
  const proficientSkills = Array.from(new Set([...selectedSkills, ...backgroundSkillList]));
  const constitutionModifier = getModifier(resolvedAbilityScores.con);
  const maxHp = getAverageHp(selectedClass.hitDie, constitutionModifier);
  const passivePerception = 10 + getModifier(resolvedAbilityScores.wis) + (proficientSkills.includes("Perception") ? proficiencyBonus : 0);
  const spellcastingAbility = characterClass === "Wizard" ? "int" : characterClass === "Cleric" || characterClass === "Druid" || characterClass === "Ranger" ? "wis" : "cha";
  const spellcastingModifier = getModifier(resolvedAbilityScores[spellcastingAbility]);
  const spellSaveDc = 8 + proficiencyBonus + spellcastingModifier;
  const spellAttackBonus = proficiencyBonus + spellcastingModifier;
  const hasSpells = selectedClass.spellGroups.length > 0;
  const spellSelectionLimits = useMemo(
    () => spellSelectionLimitsFor(characterClass, resolvedAbilityScores),
    [characterClass, resolvedAbilityScores]
  );
  const availableSpellGroups = useMemo(
    () =>
      selectedClass.spellGroups.filter((group) =>
        isSpellLevelAvailable(group.level, spellSelectionLimits)
      ),
    [selectedClass.spellGroups, spellSelectionLimits]
  );
  const selectedSpellCounts = useMemo(
    () => selectedSpellCountsFor(selectedClass.spellGroups, selectedSpells),
    [selectedClass.spellGroups, selectedSpells]
  );
  const hasValidSpellSelection =
    selectedSpells.length > 0 &&
    selectedSpellCounts.Cantrip <= spellSelectionLimits.cantrips &&
    selectedSpellCounts.leveledSpells <= spellSelectionLimits.leveledSpells;
  const characterSheetPreview = useMemo(() => {
    const abilityLines = abilityDefinitions.map(({ key, label }) => {
      const score = abilityScores[key];

      if (score === null) {
        return `${label}: Roll`;
      }

      const modifier = getModifier(score);
      return `${label}: ${score} (${formatModifier(modifier)})`;
    });
    const savingThrowLines = abilityDefinitions.map(({ key, label }) => {
      const isProficient = hasSaveProficiency(selectedClass.saveProficiencies, key);
      const modifier = getModifier(resolvedAbilityScores[key]) + (isProficient ? proficiencyBonus : 0);
      const proficiencyText = isProficient ? ", proficient" : "";
      return `${label}: ${formatModifier(modifier)}${proficiencyText}`;
    });
    const skillLines = skillDefinitions.map((skill) => {
      const isProficient = proficientSkills.includes(skill.name);
      const modifier = getModifier(resolvedAbilityScores[skill.ability]) + (isProficient ? proficiencyBonus : 0);
      return `${skill.name}: ${formatModifier(modifier)}${isProficient ? ", proficient" : ""}`;
    });
    const selectedSpellLines = formatSelectedSpellLines(
      selectedClass.spellGroups,
      selectedSpells
    );
    const spells = hasSpells
      ? [
          `Spellcasting Ability: ${abilityDefinitions.find((ability) => ability.key === spellcastingAbility)?.label}`,
          `Spell Save DC: ${spellSaveDc}`,
          `Spell Attack Bonus: ${formatModifier(spellAttackBonus)}`,
          `Spell Slots: ${spellSelectionLimits.spellSlotsText}`,
          ...selectedSpellLines
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
      `Level: ${characterLevel}`,
      `Class: ${selectedClass.id}`,
      `Subclass: ${subclass}`,
      `Species: ${characterSpecies}`,
      `Background: ${characterBackground}`,
      `Alignment: ${alignment}`,
      "",
      "Core Stats",
      `Armor Class: ${selectedEquipmentKit.armorClass}`,
      `Initiative: ${formatModifier(getModifier(resolvedAbilityScores.dex))}`,
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
    resolvedAbilityScores,
    selectedClass,
    selectedEquipmentKit,
    selectedLanguage,
    selectedSpells,
    selectedTool,
    playerName,
    spellAttackBonus,
    spellSaveDc,
    spellSelectionLimits,
    spellcastingAbility,
    subclass
  ]);
  const stepTitle = useMemo(() => {
    if (stepIndex === 0) {
      return "Choose your game mode";
    }

    if (stepIndex === 1) {
      if (mode === "multiplayer") {
        return "Choose multiplayer setup";
      }

      return "Choose the campaign world";
    }

    if (isCampaignDetailsStep) {
      if (isJoinFlow) {
        return "Enter the game code";
      }

      return "Choose the campaign world";
    }

    if (isCustomWorldStep) {
      return "Describe your custom world";
    }

    if (isCharacterStep) {
      if (isLastCharacterStep) {
        return "Review your character";
      }

      if (characterStepIndex === 0) {
        return "Choose your character build";
      }

      if (!isQuickBuild && characterStepIndex === 4) {
        return "Roll your Level 5 stats";
      }

      return `Choose your ${characterCreationSteps[characterStepIndex].toLowerCase()}`;
    }

    return "Ready the first page";
  }, [
    characterCreationSteps,
    characterStepIndex,
    isCampaignDetailsStep,
    isCharacterStep,
    isCustomWorldStep,
    isJoinFlow,
    isLastCharacterStep,
    isQuickBuild,
    mode,
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

  useEffect(() => {
    setSelectedSpells((currentSpells) => {
      const prunedSpells = pruneSpellSelection(
        selectedClass.spellGroups,
        currentSpells,
        spellSelectionLimits
      );

      return prunedSpells.length === currentSpells.length &&
        prunedSpells.every((spell, index) => spell === currentSpells[index])
        ? currentSpells
        : prunedSpells;
    });
  }, [selectedClass.spellGroups, spellSelectionLimits]);

  function handleClassChange(nextClass: CharacterClass) {
    const nextClassData = classOptions.find((option) => option.id === nextClass) ?? classOptions[4];
    const nextAbilityScores =
      characterBuildMode === "quick"
        ? { ...defaultAbilityScoresByClass[nextClass] }
        : statGenerationMode === "point_buy"
          ? { ...pointBuyDefaultScores }
          : { ...emptyAbilityScores };
    const nextSpellLimits = spellSelectionLimitsFor(nextClass, {
      str: nextAbilityScores.str ?? defaultAbilityScoresByClass[nextClass].str,
      dex: nextAbilityScores.dex ?? defaultAbilityScoresByClass[nextClass].dex,
      con: nextAbilityScores.con ?? defaultAbilityScoresByClass[nextClass].con,
      int: nextAbilityScores.int ?? defaultAbilityScoresByClass[nextClass].int,
      wis: nextAbilityScores.wis ?? defaultAbilityScoresByClass[nextClass].wis,
      cha: nextAbilityScores.cha ?? defaultAbilityScoresByClass[nextClass].cha
    });
    setCharacterClass(nextClass);
    setAbilityScores(nextAbilityScores);
    setSubclass(nextClassData.subclassOptions[0]);
    setClassFeatureChoice(nextClassData.featureOptions[0]);
    setSelectedSkills([...nextClassData.defaultSkills] as SkillName[]);
    setEquipmentKitId(nextClassData.equipmentKits[0].id);
    setDlcSpellVisibility({});
    setSelectedSpells(defaultSpellSelectionFor(nextClassData.spellGroups, nextSpellLimits));

    if (characterBuildMode === "quick") {
      setCharacterBackground(quickBuildBackgroundByClass[nextClass]);
    }
  }

  function applyQuickBuildDefaults() {
    const skillChoices = selectedClass.skillChoices.slice(
      0,
      Math.max(2, Math.min(4, selectedClass.defaultSkills.length))
    ) as SkillName[];

    setCharacterBackground(quickBuildBackgroundByClass[characterClass]);
    setStatGenerationMode("roll");
    setAbilityScores({ ...defaultAbilityScoresByClass[characterClass] });
    setSubclass(selectedClass.subclassOptions[0]);
    setClassFeatureChoice(selectedClass.featureOptions[0]);
    setSelectedSkills(
      skillChoices.length > 0
        ? skillChoices
        : ([...selectedClass.defaultSkills] as SkillName[])
    );
    setEquipmentKitId(selectedClass.equipmentKits[0].id);
    setSelectedTool("Dice set");
    setSelectedLanguage("Elvish");
    setDlcSpellVisibility({});
    setSelectedSpells(defaultSpellSelectionFor(selectedClass.spellGroups, spellSelectionLimits));
  }

  function applyCustomBuildDefaults() {
    setStatGenerationMode("roll");
    setAbilityScores({ ...emptyAbilityScores });
  }

  function rollStat(key: AbilityKey) {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("roll");
    const { rolls, total } = rollFourD6DropLowest();
    const ability = abilityDefinitions.find((definition) => definition.key === key);

    setActiveStatRoll({
      id: key,
      expression: `${ability?.label ?? "Stat"}: 4d6 drop lowest`,
      rolls,
      total,
      scores: {
        [key]: total
      }
    });
  }

  function rollAllStats() {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("roll");
    const statRolls = abilityDefinitions.map((ability) => ({
      key: ability.key,
      ...rollFourD6DropLowest()
    }));
    const scores = statRolls.reduce<Partial<AbilityScores>>(
      (nextScores, statRoll) => ({
        ...nextScores,
        [statRoll.key]: statRoll.total
      }),
      {}
    );
    const animationRolls = statRolls.flatMap((statRoll) => statRoll.rolls).slice(0, 8);
    const total = statRolls.reduce((sum, statRoll) => sum + statRoll.total, 0);

    setActiveStatRoll({
      id: `all-${Date.now().toString(36)}`,
      expression: "Roll all stats",
      rolls: animationRolls,
      total,
      scores
    });
  }

  function completeStatRoll() {
    if (!activeStatRoll) {
      return;
    }

    setAbilityScores((currentScores) => ({
      ...currentScores,
      ...activeStatRoll.scores
    }));
    setActiveStatRoll(null);
  }

  function switchToPointBuy() {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("point_buy");
    setAbilityScores({ ...pointBuyDefaultScores });
  }

  function switchToRollScores() {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("roll");
    setAbilityScores({ ...emptyAbilityScores });
  }

  function updatePointBuyScore(key: AbilityKey, change: -1 | 1) {
    setAbilityScores((currentScores) => {
      const currentScore = pointBuyScoreFor(currentScores, key);
      const nextScore = Math.min(15, Math.max(8, currentScore + change));

      if (nextScore === currentScore) {
        return currentScores;
      }

      const currentCost = pointBuyCosts[currentScore];
      const nextCost = pointBuyCosts[nextScore];
      const nextPointsSpent =
        getPointBuyPointsSpent(currentScores) - currentCost + nextCost;

      if (nextPointsSpent > pointBuyBudget) {
        return currentScores;
      }

      return {
        ...currentScores,
        [key]: nextScore
      };
    });
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

      if (
        isSpellSelectionLimitReached(
          selectedClass.spellGroups,
          currentSpells,
          spell,
          spellSelectionLimits
        )
      ) {
        return currentSpells;
      }

      return [...currentSpells, spell];
    });
  }

  function toggleDlcSpells(level: SpellLevelLabel) {
    const isCurrentlyVisible = Boolean(dlcSpellVisibility[level]);
    setDlcSpellVisibility((currentVisibility) => ({
      ...currentVisibility,
      [level]: !isCurrentlyVisible
    }));

    if (isCurrentlyVisible) {
      const group = selectedClass.spellGroups.find((spellGroup) => spellGroup.level === level);
      const hiddenSpells = new Set(group?.dlc ?? []);
      setSelectedSpells((currentSpells) =>
        currentSpells.filter((spell) => !hiddenSpells.has(spell))
      );
    }
  }

  function canAdvance() {
    if (isCampaignDetailsStep) {
      if (isJoinFlow) {
        return normalizedGameCode.length === 6;
      }

      return Boolean(campaignGenre);
    }

    if (isCustomWorldStep) {
      return Boolean(customWorldName.trim() && customWorldDescription.trim());
    }

    if (isCharacterStep) {
      if (characterStepIndex === 0) {
        return true;
      }

      if (isQuickBuild) {
        return (
          characterStepIndex !== 3 ||
          !requiresCharacterName ||
          hasRequiredIdentity
        );
      }

      if (characterStepIndex === 4) {
        return areAllStatsRolled;
      }

      if (characterStepIndex === 6) {
        return selectedSkills.length > 0;
      }

      if (characterStepIndex === 5 && hasSpells) {
        return hasValidSpellSelection;
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

  function transitionFlow(updateFlow: () => void) {
    if (isFlowTransitioning) {
      return;
    }

    setFlowTransition("exiting");
    window.setTimeout(() => {
      updateFlow();
      setFlowTransition("entering");
      window.setTimeout(() => {
        setFlowTransition("idle");
      }, flowTransitionDurationMs);
    }, flowTransitionDurationMs);
  }

  async function handleNext() {
    if (isFlowTransitioning) {
      return;
    }

    setError("");

    if (!canAdvance()) {
      setError(
        isCustomWorldStep
          ? "Name the world and describe it before continuing."
          : isCampaignDetailsStep
          ? isJoinFlow
            ? "Enter the six-character game code before continuing."
            : "Choose a campaign world before continuing."
          : requiresCharacterName &&
              ((isQuickBuild && characterStepIndex === 3) ||
                (!isQuickBuild && characterStepIndex === 10))
            ? isJoinFlow
              ? "Add your player and character names before continuing."
              : "Add your character name before continuing."
            : !isQuickBuild && characterStepIndex === 4
              ? "Roll all six stats before continuing."
            : characterStepIndex === 5
              ? "Choose at least one spell before continuing."
              : "Choose at least one option before continuing."
      );
      return;
    }

    if (isJoinFlow && isCampaignDetailsStep) {
      try {
        await previewJoinCode();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "That game code could not be checked."
        );
        return;
      }
    }

    if (isCharacterStep && !isLastCharacterStep) {
      transitionFlow(() =>
        setCharacterStepIndex((currentStepIndex) =>
          Math.min(currentStepIndex + 1, characterCreationSteps.length - 1)
        )
      );
      return;
    }

    transitionFlow(() =>
      setStepIndex((currentStepIndex) =>
        Math.min(currentStepIndex + 1, steps.length - 1)
      )
    );
  }

  function handleBack() {
    if (isFlowTransitioning) {
      return;
    }

    setError("");

    if (isCharacterStep && characterStepIndex > 0) {
      transitionFlow(() =>
        setCharacterStepIndex((currentStepIndex) =>
          Math.max(currentStepIndex - 1, 0)
        )
      );
      return;
    }

    transitionFlow(() =>
      setStepIndex((currentStepIndex) => Math.max(currentStepIndex - 1, 0))
    );
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
    <main className="new-adventure-page" aria-label="Create a new adventure">
      <div className="new-adventure-heading">
        <p className="eyebrow">New Adventure</p>
        <h1>{stepTitle}</h1>
      </div>

      <form className="new-adventure-form" onSubmit={handleSubmit}>
        <div className={`new-adventure-flow new-adventure-flow-${flowTransition}`}>
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
            </>
          ) : null}

          {isMultiplayerIntentStep ? (
            <fieldset className="option-picker multiplayer-intent-picker" aria-label="Multiplayer setup">
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

          {isCampaignDetailsStep && isJoinFlow ? (
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

            {isCampaignDetailsStep && !isJoinFlow ? (
              <fieldset className="genre-picker">
                <legend>Campaign world</legend>
                <div>
                  {campaignWorldOptions.map((genre) => (
                    <button
                      type="button"
                      className={campaignGenre === genre.id ? "selected" : ""}
                      aria-pressed={campaignGenre === genre.id}
                      disabled={genre.id === customCampaignGenre.id}
                      key={genre.id}
                      onClick={() => setCampaignGenre(genre.id)}
                    >
                      <strong>{genre.label}</strong>
                      <small>{genre.uiDescription}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {isCustomWorldStep ? (
              <div className="custom-world-field expanded">
                <label>
                  <span>World name</span>
                  <input
                    value={customWorldName}
                    onChange={(event) => setCustomWorldName(event.target.value)}
                    placeholder="The Ashen Crownlands"
                  />
                </label>
                <label>
                  <span>World description</span>
                  <textarea
                    value={customWorldDescription}
                    onChange={(event) =>
                      setCustomWorldDescription(event.target.value)
                    }
                    rows={7}
                  />
                </label>
              </div>
            ) : null}

            {isCharacterStep ? (
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
                        onClick={() => {
                          setCharacterBuildMode("quick");
                          applyQuickBuildDefaults();
                        }}
                      >
                        <strong>Quick Build</strong>
                        <small>Start fast with a ready-to-play Level 5 character.</small>
                      </button>
                      <button
                        type="button"
                        className={characterBuildMode === "custom" ? "selected" : ""}
                        aria-pressed={characterBuildMode === "custom"}
                        onClick={() => {
                          setCharacterBuildMode("custom");
                          applyCustomBuildDefaults();
                        }}
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

                {(!isQuickBuild && characterStepIndex === 3) ||
                (isQuickBuild && characterStepIndex === 2) ? (
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

                {!isQuickBuild && characterStepIndex === 7 ? (
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
                    <div className="stat-roll-panel-header">
                      <div className="character-step-note">
                        <strong>Level 5 stats</strong>
                        <span>
                          {statGenerationMode === "point_buy"
                            ? "Start at 10 and spend points to tune each stat."
                            : "Roll 4d6, drop the lowest die, and keep the other three."}
                        </span>
                      </div>
                      <div className="stat-mode-actions">
                        <button
                          type="button"
                          className={
                            statGenerationMode === "point_buy"
                              ? "stat-mode-button selected"
                              : "stat-mode-button"
                          }
                          aria-pressed={statGenerationMode === "point_buy"}
                          disabled={Boolean(activeStatRoll)}
                          onClick={
                            statGenerationMode === "point_buy"
                              ? switchToRollScores
                              : switchToPointBuy
                          }
                        >
                          {statGenerationMode === "point_buy"
                            ? "Roll Scores"
                            : "Point Buy"}
                        </button>
                        <button
                          type="button"
                          className="stat-mode-button"
                          disabled={
                            Boolean(activeStatRoll) ||
                            statGenerationMode === "point_buy"
                          }
                          onClick={rollAllStats}
                        >
                          <Dice5 size={18} />
                          Roll All
                        </button>
                      </div>
                    </div>
                    <div className="ability-score-grid stat-generation-body" key={statGenerationMode}>
                      {abilityDefinitions.map((ability) => {
                        const score =
                          statGenerationMode === "point_buy"
                            ? pointBuyScoreFor(abilityScores, ability.key)
                            : abilityScores[ability.key];
                        const abilityBonus = formatAbilityBonusSources(
                          characterSpecies,
                          characterClass,
                          classFeatureChoice,
                          ability.key
                        );
                        const pointBuyScore = pointBuyScoreFor(
                          abilityScores,
                          ability.key
                        );
                        const currentCost = pointBuyCosts[pointBuyScore];
                        const nextCost = pointBuyCosts[pointBuyScore + 1];
                        const canIncreasePointBuyScore =
                          pointBuyScore < 15 &&
                          pointBuyPointsRemaining >= nextCost - currentCost;

                        return (
                          <div className="stat-roll-card" key={ability.key}>
                            <div className="stat-roll-card-header">
                              <span>{ability.label}</span>
                              {statGenerationMode === "point_buy" ? (
                                <div className="stat-adjust-controls">
                                  <button
                                    type="button"
                                    className="stat-adjust-button"
                                    aria-label={`Decrease ${ability.label}`}
                                    disabled={pointBuyScore <= 8}
                                    onClick={() => updatePointBuyScore(ability.key, -1)}
                                  >
                                    <Minus size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="stat-adjust-button"
                                    aria-label={`Increase ${ability.label}`}
                                    disabled={!canIncreasePointBuyScore}
                                    onClick={() => updatePointBuyScore(ability.key, 1)}
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="stat-roll-button"
                                  aria-label={`Roll ${ability.label}`}
                                  disabled={Boolean(activeStatRoll)}
                                  onClick={() => rollStat(ability.key)}
                                >
                                  <Dice5 size={18} />
                                </button>
                              )}
                            </div>
                            <strong>{score ?? "Roll"}</strong>
                            <small>
                              <span>{abilityBonus.bonusText}</span>
                              {abilityBonus.sourceText ? (
                                <span className="stat-roll-bonus-source">
                                  ({abilityBonus.sourceText})
                                </span>
                              ) : null}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {!isQuickBuild && characterStepIndex === 2 ? (
                  <div className="character-builder-stack">
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

                {!isQuickBuild && characterStepIndex === 8 ? (
                  <div className="character-builder-stack">
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

                {!isQuickBuild && characterStepIndex === 9 ? (
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

                {!isQuickBuild && characterStepIndex === 5 ? (
                  hasSpells ? (
                    <fieldset className="option-picker spell-picker">
                      <legend>Spells</legend>
                      <div className="spell-level-list">
                        {availableSpellGroups.map((group) => {
                          const showDlcSpells = Boolean(dlcSpellVisibility[group.level]);
                          const visibleSpells = spellOptionsFor(
                            [group],
                            dlcSpellVisibility
                          );
                          const selectedCount =
                            group.level === "Cantrip"
                              ? selectedSpellCounts.Cantrip
                              : selectedSpellCounts.leveledSpells;
                          const maxCount =
                            group.level === "Cantrip"
                              ? spellSelectionLimits.cantrips
                              : spellSelectionLimits.leveledSpells;

                          return (
                            <section className="spell-level-group" key={group.level}>
                              <div className="spell-level-header">
                                <div>
                                  <h3>{group.level}</h3>
                                  <small>
                                    {selectedCount} / {maxCount}
                                    {group.level === "Cantrip"
                                      ? " cantrips"
                                      : " spells"}
                                  </small>
                                </div>
                                {(group.dlc?.length ?? 0) > 0 ? (
                                  <label className="spell-dlc-toggle">
                                    <input
                                      type="checkbox"
                                      checked={showDlcSpells}
                                      onChange={() => toggleDlcSpells(group.level)}
                                    />
                                    <span>Non PHB Spells</span>
                                  </label>
                                ) : null}
                              </div>
                              <div className="spell-option-grid">
                                {visibleSpells.map((option) => {
                                  const isDlcSpell = (group.dlc ?? []).includes(option);
                                  const isSelected = selectedSpells.includes(option);
                                  const isAtLimit = isSpellSelectionLimitReached(
                                    selectedClass.spellGroups,
                                    selectedSpells,
                                    option,
                                    spellSelectionLimits
                                  );

                                  return (
                                    <button
                                      type="button"
                                      className={[
                                        isSelected ? "selected" : "",
                                        isDlcSpell ? "dlc-spell-option" : ""
                                      ].filter(Boolean).join(" ")}
                                      aria-pressed={isSelected}
                                      disabled={isAtLimit}
                                      key={option}
                                      onClick={() => toggleSpell(option)}
                                    >
                                      <strong>{option}</strong>
                                      {isDlcSpell ? (
                                        <small>{spellSourceLabels[option] ?? "Expanded source"}</small>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
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
                (isQuickBuild && characterStepIndex === 3) ? (
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
                (isQuickBuild && characterStepIndex === 4) ? (
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

            {stepIndex === reviewStepIndex ? (
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

          {isCharacterStep &&
          !isQuickBuild &&
          characterStepIndex === 4 &&
          statGenerationMode === "point_buy" ? (
            <div className="point-buy-remaining" aria-live="polite">
              <strong>{pointBuyPointsRemaining}</strong>
              <span>points remaining</span>
            </div>
          ) : null}

          <div className="creation-actions">
            <button
              type="button"
              className="creation-secondary"
              disabled={stepIndex === 0 || isCreating || isFlowTransitioning}
              onClick={handleBack}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button type="submit" disabled={isCreating || isFlowTransitioning}>
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

      {activeStatRoll ? (
        <DiceRollReveal3D
          key={`${activeStatRoll.id}-${activeStatRoll.rolls.join("-")}`}
          notation={predeterminedDiceNotation(
            `${activeStatRoll.rolls.length}d6`,
            activeStatRoll.rolls
          )}
          expression={activeStatRoll.expression}
          total={activeStatRoll.total}
          onComplete={completeStatRoll}
        />
      ) : null}
    </main>
  );
}
