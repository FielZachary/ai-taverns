"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Check,
  Dice5,
  ImagePlus,
  X,
  Minus,
  Plus,
  RefreshCw,
  ScrollText,
  Wand2
} from "lucide-react";
import {
  campaignGenrePresets,
  customCampaignGenre
} from "@/lib/campaign-genres";
import {
  createCampaign as createCampaignViaApi,
  generateCharacterPortrait,
  generateCharacterBackstory,
  joinCampaign as joinCampaignViaApi,
  joinLobbyInvite,
  previewLobbyInvite,
  previewCampaignJoin,
  uploadCharacterPortrait,
  type CampaignSummary
} from "@/lib/campaign-api";
import { defaultCharacterSheet } from "@/components/playing/PlayerPanel";
import { DiceRollReveal3D } from "@/components/playing/DiceRollReveal3D";
import {
  analyticsGuestId,
  identifyAnalyticsUser,
  trackAnalytics
} from "@/lib/analytics";
import type {
  EldermereCampaignStart,
  MechanicsSeed,
  SpellSlotState
} from "@ai-dnd/contracts";
import artificerClassArt from "../../../../assets/classes art/artificer.png";
import barbarianClassArt from "../../../../assets/classes art/barbarian.png";
import bardClassArt from "../../../../assets/classes art/bard.png";
import bloodHunterClassArt from "../../../../assets/classes art/blood-hunter.png";
import clericClassArt from "../../../../assets/classes art/cleric.png";
import druidClassArt from "../../../../assets/classes art/druid.png";
import fighterClassArt from "../../../../assets/classes art/fighter.png";
import monkClassArt from "../../../../assets/classes art/monk.png";
import paladinClassArt from "../../../../assets/classes art/paladin.png";
import psionClassArt from "../../../../assets/classes art/psion.png";
import rangerClassArt from "../../../../assets/classes art/ranger.png";
import rogueClassArt from "../../../../assets/classes art/rogue.png";
import sorcererClassArt from "../../../../assets/classes art/sorcerer.png";
import warlockClassArt from "../../../../assets/classes art/warlock.png";
import wizardClassArt from "../../../../assets/classes art/wizard.png";
import dragonbornSpeciesArt from "../../../../assets/races art/dragonborn.png";
import dwarfSpeciesArt from "../../../../assets/races art/dwarf.png";
import elfSpeciesArt from "../../../../assets/races art/elf.png";
import gnomeSpeciesArt from "../../../../assets/races art/gnome.png";
import halfElfSpeciesArt from "../../../../assets/races art/half-elf.png";
import halfOrcSpeciesArt from "../../../../assets/races art/half-orc.png";
import halflingSpeciesArt from "../../../../assets/races art/halfling.png";
import humanSpeciesArt from "../../../../assets/races art/human.png";
import tieflingSpeciesArt from "../../../../assets/races art/tiefling.png";

type CampaignMode = "single_player" | "multiplayer";
type MultiplayerIntent = "create" | "join";
type FlowTransitionState = "idle" | "exiting" | "entering";

type JoinPreview = {
  code?: string;
  source: "code" | "invite";
  campaignTitle: string;
  availableSlots: number;
  hasBegun: boolean;
};

type NewAdventureFormProps = {
  initialInviteToken?: string;
  userEmail?: string;
  userId?: string;
};

const defaultCampaignPreparationMessage = "Preparing your campaign";
const campaignPreparationMessages = [
  defaultCampaignPreparationMessage,
  "Integrating your backstory",
  "Creating story direction",
  "Determining NPCs",
  "Ironing out details",
  "Crafting first scene",
  "Writing",
  "Fetching 5E rules",
  "Updating contracts",
  "Double checking NPCs",
  "Improving campaign plan",
  "Repairing story holes",
  "Final touches"
];
const campaignPreparationMessageIntervalMs = 10_000;
const campaignPreparationTransitionMs = 650;

type PreparationLoaderLayoutProps = {
  currentMessage: string;
  exitingMessage?: string;
  note?: string;
};
type NewAdventureEntryState = "preloading" | "transitioning" | "ready";

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
type CompleteAbilityScores = Record<AbilityKey, number>;
type AbilityScores = Record<AbilityKey, number | null>;
type SpeciesAbilityBonuses = Partial<Record<AbilityKey, number>>;
type SkillName = (typeof skillDefinitions)[number]["name"];
type CharacterBuildMode = "quick" | "custom";
type StatGenerationMode = "roll" | "point_buy";
type CharacterArtStyle =
  | "painterly_fantasy"
  | "storybook_illustration"
  | "ink_and_watercolor"
  | "cinematic_concept_art";
type CharacterImageModel = "qwen" | "openai";
type PortraitRoomPlayer = {
  portraitStatus?: "pending" | "ready" | "failed";
  portraitUrl?: string;
};
type PortraitRoomSnapshot = {
  players?: PortraitRoomPlayer[];
};
type PortraitRoomRealtimeEvent =
  | { type: "room_updated"; roomId: string }
  | { type: "room_snapshot"; roomId: string; snapshot: PortraitRoomSnapshot }
  | { type: string; roomId?: string };

function roomSocketUrl(campaign: CampaignSummary) {
  const apiOrigin =
    process.env.NEXT_PUBLIC_FASTIFY_API_ORIGIN?.replace(/\/$/, "") ||
    window.location.origin;
  const url = new URL("/api/room/live", apiOrigin);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("roomId", campaign.id);
  url.searchParams.set("sessionId", campaign.sessionId);

  return url.toString();
}
export type SpellLevelLabel = "Cantrip" | "1st level" | "2nd level" | "3rd level";
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
type SpellRuleProfile = {
  description: string;
  rolls: string;
  school: string;
  duration: string;
  castingTime: string;
  range: string;
};
type ActiveStatRoll = {
  id: string;
  expression: string;
  rolls: number[];
  total: number;
  values: number[];
  targetRollIndex?: number;
};
type EquipmentCategory =
  | "simpleWeapon"
  | "simpleMeleeWeapon"
  | "martialWeapon"
  | "martialMeleeWeapon"
  | "musicalInstrument";
type EquipmentChoiceOption = {
  id: string;
  label: string;
  items?: string[];
  category?: EquipmentCategory;
  quantity?: number;
};
type EquipmentChoiceGroup = {
  id: string;
  label: string;
  options: EquipmentChoiceOption[];
};
type EquipmentChoiceSelection = {
  optionId: string;
  customItem?: string;
};
type EquipmentSelections = Record<string, EquipmentChoiceSelection>;
type ActiveEquipmentModal = {
  groupId: string;
  optionId: string;
  title: string;
  category: EquipmentCategory;
} | null;
type EquipmentRule = {
  choices: EquipmentChoiceGroup[];
  fixed: string[];
};
type EquipmentProfile = {
  armorClass: number;
  attacks: string[];
  currency: string[];
  gear: string[];
  inventory: string[];
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
const customCharacterCreationSteps = [
  "Build",
  "Class",
  "Class Choices",
  "Stats",
  "Species",
  "Spells",
  "Proficiencies",
  "Background",
  "Skills",
  "Equipment",
  "Identity"
];
const quickCharacterCreationSteps = [
  "Build",
  "Class",
  "Stats",
  "Species",
  "Spells",
  "Equipment",
  "Identity"
];
const campaignGenres = [...campaignGenrePresets, customCampaignGenre];
const campaignWorldOptions = [
  campaignGenrePresets[0],
  customCampaignGenre
];
const campaignWorldBannerUrls: Record<string, string> = {
  eldermere: "/new-adventure/eldermere-banner.jpg",
  custom: "/new-adventure/custom-world-banner.jpg"
};
const newAdventureEntryVideoUrl = "/new-adventure/closing-animation-mask.webm";
const optionArtRoot = "/new-adventure/options";
const weaponCategories: EquipmentCategory[] = [
  "simpleWeapon",
  "simpleMeleeWeapon",
  "martialWeapon",
  "martialMeleeWeapon"
];

function optionArtSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function optionArtUrl(category: "tools" | "backgrounds" | "skills" | "weapons", value: string) {
  return encodeURI(`${optionArtRoot}/${category}/${optionArtSlug(value)}.jpg`);
}

function optionArtStyle(url: string) {
  return {
    "--option-art-url": `url("${url}")`
  } as CSSProperties;
}

function artOptionClassName(isSelected?: boolean) {
  return isSelected ? "art-option-card selected" : "art-option-card";
}

function isWeaponCategory(category: EquipmentCategory) {
  return weaponCategories.includes(category);
}

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
const emptyStatRollAssignments: Record<AbilityKey, number | null> = {
  str: null,
  dex: null,
  con: null,
  int: null,
  wis: null,
  cha: null
};
const emptyStatRollValues = Array.from(
  { length: abilityDefinitions.length },
  () => null
) as Array<number | null>;
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
  Artificer: {
    cantrips: 2,
    preparedAbility: "int",
    preparedLevelBonus: Math.floor(characterLevel / 2),
    availableLevels: halfCasterSpellLevels,
    spellSlotsText: "4 first-level, 2 second-level"
  },
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
  },
  Psion: {
    cantrips: 2,
    fixedLeveledSpells: 9,
    availableLevels: fullCasterSpellLevels,
    spellSlotsText: "4 first-level, 3 second-level, 2 third-level"
  }
};
const fullCasterSlotTable: Record<number, Record<string, SpellSlotState>> = {
  5: {
    "1": { max: 4, used: 0 },
    "2": { max: 3, used: 0 },
    "3": { max: 2, used: 0 }
  }
};
const pactMagicSlotTable: Record<number, Record<string, SpellSlotState>> = {
  5: {
    "3": { max: 2, used: 0 }
  }
};
const fullCasterClasses = new Set([
  "Bard",
  "Cleric",
  "Druid",
  "Sorcerer",
  "Wizard"
]);
const spellSourceLabels: Record<string, string> = {
  "Absorb Elements": "Xanathar's Guide to Everything",
  "Aganazzar's Scorcher": "Xanathar's Guide to Everything",
  "Air Bubble": "Spelljammer: Astral Adventurer's Guide",
  Antagonize: "The Book of Many Things",
  "Ashardalon's Stride": "Fizban's Treasury of Dragons",
  "Beast Bond": "Xanathar's Guide to Everything",
  "Booming Blade": "Tasha's Cauldron of Everything",
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
  "Green-Flame Blade": "Tasha's Cauldron of Everything",
  Gust: "Xanathar's Guide to Everything",
  "Healing Spirit": "Xanathar's Guide to Everything",
  "Ice Knife": "Xanathar's Guide to Everything",
  "Immovable Object": "Explorer's Guide to Wildemount",
  "Incite Greed": "Acquisitions Incorporated",
  Infestation: "Xanathar's Guide to Everything",
  "Intellect Fortress": "Unearthed Arcana: The Psion",
  "Jim's Glowing Coin": "Acquisitions Incorporated",
  "Jim's Magic Missile": "Acquisitions Incorporated",
  "Kinetic Jaunt": "Strixhaven: A Curriculum of Chaos",
  "Life Transference": "Xanathar's Guide to Everything",
  "Lightning Arrow": "Player's Handbook",
  "Lightning Lure": "Tasha's Cauldron of Everything",
  "Magic Stone": "Xanathar's Guide to Everything",
  "Magnify Gravity": "Explorer's Guide to Wildemount",
  "Maximillian's Earthen Grasp": "Xanathar's Guide to Everything",
  "Mind Sliver": "Tasha's Cauldron of Everything",
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
  "Summon Astral Entity": "Unearthed Arcana: The Psion",
  "Summon Lesser Demons": "Xanathar's Guide to Everything",
  "Sword Burst": "Tasha's Cauldron of Everything",
  "Tasha's Caustic Brew": "Tasha's Cauldron of Everything",
  "Tasha's Mind Whip": "Unearthed Arcana: The Psion",
  "Telekinetic Crush": "Unearthed Arcana: The Psion",
  "Telekinetic Fling": "Unearthed Arcana: The Psion",
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
const spellEffectSummaries: Record<string, string> = {
  "Acid Splash": "Splashes acid onto one or two nearby foes.",
  "Aid": "Raises allies' toughness and maximum hit points.",
  "Alarm": "Wards an area and alerts you to intruders.",
  "Alter Self": "Changes your body for disguise, movement, or natural attacks.",
  "Animal Friendship": "Calms a beast and makes it regard you as friendly.",
  "Animal Messenger": "Sends a short message through a small beast.",
  "Animate Dead": "Raises a corpse as an undead servant.",
  "Arcane Lock": "Magically seals a door, chest, or similar entry.",
  "Armor of Agathys": "Wraps you in frost that protects and punishes attackers.",
  "Augury": "Asks an omen about whether a plan is wise.",
  "Bane": "Curses enemies so their attacks and saves falter.",
  "Barkskin": "Hardens a creature's skin into bark-like armor.",
  "Beacon of Hope": "Bolsters allies, making healing and resolve stronger.",
  "Beast Sense": "Lets you see and hear through a willing beast.",
  "Bestow Curse": "Afflicts a creature with a debilitating magical curse.",
  "Blade Ward": "Briefly guards you against weapon damage.",
  "Bless": "Boosts allies' attacks and saving throws.",
  "Blindness/Deafness": "Blinds or deafens a creature.",
  "Blink": "Phases you in and out of the Ethereal Plane.",
  "Blur": "Makes you harder to hit with a shimmering outline.",
  "Branding Smite": "Empowers a weapon hit with radiant damage and reveals invisibility.",
  "Burning Hands": "Unleashes a close cone of flame.",
  "Call Lightning": "Calls storm bolts down on a chosen point.",
  "Calm Emotions": "Suppresses strong fear, charm, or hostility.",
  "Charm Person": "Makes a humanoid temporarily regard you as friendly.",
  "Chill Touch": "Deals necrotic damage and hampers healing.",
  "Chromatic Orb": "Hurls an elemental orb of your chosen damage type.",
  "Clairvoyance": "Creates a distant magical sensor for sight or hearing.",
  "Cloud of Daggers": "Fills a small area with whirling blades.",
  "Color Spray": "Blinds nearby creatures with dazzling color.",
  "Command": "Forces a creature to follow a brief one-word order.",
  "Comprehend Languages": "Lets you understand spoken and written languages.",
  "Conjure Animals": "Summons beasts to fight or help.",
  "Conjure Barrage": "Sprays spectral ammunition or weapons in a cone.",
  "Continual Flame": "Creates a lasting magical flame that sheds light.",
  "Counterspell": "Interrupts another creature's spell as it is cast.",
  "Create Food and Water": "Conjures enough food and water for a group.",
  "Create or Destroy Water": "Creates water, destroys water, or alters rain and fog.",
  "Crown of Madness": "Forces a humanoid to strike where you direct.",
  "Cure Wounds": "Restores hit points with a touch.",
  "Dancing Lights": "Creates small moving lights.",
  "Darkness": "Fills an area with magical darkness.",
  "Darkvision": "Grants sight in darkness.",
  "Daylight": "Fills an area with bright magical light.",
  "Detect Evil and Good": "Senses nearby celestials, fiends, undead, and similar forces.",
  "Detect Magic": "Reveals magical auras nearby.",
  "Detect Poison and Disease": "Finds poison, disease, and poisonous creatures nearby.",
  "Detect Thoughts": "Reads surface thoughts and can probe deeper.",
  "Disguise Self": "Creates an illusory disguise around you.",
  "Dispel Magic": "Ends magical effects on a creature, object, or area.",
  "Dissonant Whispers": "Psychically harms a creature and drives it away.",
  "Divine Favor": "Adds radiant power to your weapon strikes.",
  "Druidcraft": "Creates tiny nature signs, sensory effects, or plant tricks.",
  "Eldritch Blast": "Fires force beams at one or more targets.",
  "Elemental Weapon": "Makes a weapon magical and elemental.",
  "Enhance Ability": "Boosts one kind of ability check and grants a related benefit.",
  "Enlarge/Reduce": "Changes a creature or object's size.",
  "Ensnaring Strike": "Turns your next weapon hit into binding vines.",
  "Entangle": "Creates grasping plants that restrain creatures.",
  "Enthrall": "Distracts creatures with compelling words.",
  "Expeditious Retreat": "Lets you move quickly with repeated dashes.",
  "Faerie Fire": "Outlines creatures, revealing them and helping attacks land.",
  "False Life": "Grants temporary hit points with necromantic vigor.",
  "Fear": "Frightens creatures in a cone and makes them flee.",
  "Feather Fall": "Slows falling creatures to a safe descent.",
  "Feign Death": "Makes a willing creature appear dead.",
  "Find Familiar": "Summons a spirit companion in animal form.",
  "Find Steed": "Summons a loyal magical mount.",
  "Find Traps": "Reveals the presence of nearby traps.",
  "Fire Bolt": "Hurls a ranged bolt of fire.",
  "Fireball": "Explodes in a wide burst of fire.",
  "Flame Blade": "Creates a fiery blade in your hand.",
  "Flaming Sphere": "Rolls a burning sphere around the battlefield.",
  "Fly": "Grants magical flight.",
  "Fog Cloud": "Creates a heavy obscuring fog.",
  "Friends": "Gives you brief social advantage over one creature.",
  "Gaseous Form": "Turns a willing creature into mist.",
  "Gentle Repose": "Preserves a corpse and delays undeath.",
  "Glyph of Warding": "Stores a magical trap or spell trigger.",
  "Goodberry": "Creates nourishing berries that heal lightly.",
  "Grease": "Coats the ground and makes creatures slip.",
  "Guidance": "Adds a small divine boost to an ability check.",
  "Guiding Bolt": "Blasts radiant damage and marks the target for an ally.",
  "Gust of Wind": "Pushes creatures with a strong line of wind.",
  "Hail of Thorns": "Makes your next ranged hit burst into thorns.",
  "Haste": "Greatly speeds and sharpens a creature.",
  "Healing Word": "Heals a creature at range with a quick word.",
  "Heat Metal": "Makes metal painfully hot and hard to hold.",
  "Hellish Rebuke": "Burns a creature that just damaged you.",
  "Heroism": "Makes a creature brave and steadily protected.",
  "Hex": "Curses a target for extra damage and weakened checks.",
  "Hold Person": "Paralyzes a humanoid.",
  "Hunger of Hadar": "Opens a dark, damaging void of cold and acid.",
  "Hunter's Mark": "Marks prey so your weapon hits hurt more.",
  "Hypnotic Pattern": "Charms and incapacitates creatures with a dazzling pattern.",
  "Identify": "Reveals what a magic item or spell effect does.",
  "Illusory Script": "Hides a written message behind magical script.",
  "Inflict Wounds": "Delivers heavy necrotic damage by touch.",
  "Invisibility": "Turns a creature invisible until it attacks or casts.",
  "Jump": "Triples a creature's jump distance.",
  "Knock": "Opens locked, barred, or stuck objects loudly.",
  "Leomund's Tiny Hut": "Creates a safe magical shelter dome.",
  "Lesser Restoration": "Ends one common condition, disease, or poison.",
  "Levitate": "Raises a creature or object vertically.",
  "Light": "Makes an object glow brightly.",
  "Lightning Bolt": "Blasts a long line of lightning.",
  "Locate Animals or Plants": "Finds a kind of beast or plant nearby.",
  "Locate Object": "Finds a specific object or kind of object nearby.",
  "Longstrider": "Increases a creature's speed.",
  "Mage Armor": "Protects an unarmored creature with magical force.",
  "Mage Hand": "Creates a small spectral hand for simple tasks.",
  "Magic Circle": "Creates a protective circle against supernatural creatures.",
  "Magic Missile": "Fires force darts that hit automatically.",
  "Magic Mouth": "Stores a spoken message on an object.",
  "Magic Weapon": "Makes a weapon magical and more accurate.",
  "Major Image": "Creates a large sensory illusion.",
  "Mass Healing Word": "Heals several allies at range.",
  "Meld into Stone": "Lets you merge into a stone surface.",
  "Melf's Acid Arrow": "Launches acid that damages now and later.",
  "Mending": "Repairs a small break or tear.",
  "Message": "Whispers a private magical message at range.",
  "Mind Sliver": "Cuts a mind with psychic damage and weakens its next save.",
  "Minor Illusion": "Creates a small sound or image illusion.",
  "Mirror Image": "Creates illusory duplicates that absorb attacks.",
  "Misty Step": "Teleports you a short distance.",
  "Moonbeam": "Burns creatures in a moving column of moonlight.",
  "Nondetection": "Hides a creature or object from divination.",
  "Pass without Trace": "Cloaks a group in shadow for stealth.",
  "Phantasmal Force": "Plants a damaging illusion in a creature's mind.",
  "Phantom Steed": "Creates a fast temporary mount.",
  "Plant Growth": "Enriches plants or creates thick overgrowth.",
  "Poison Spray": "Sprays poison at a nearby creature.",
  "Prayer of Healing": "Heals several allies after a short prayer.",
  "Prestidigitation": "Performs small magical tricks and sensory effects.",
  "Produce Flame": "Creates flame for light or a ranged attack.",
  "Protection from Energy": "Grants resistance to one energy type.",
  "Protection from Evil and Good": "Protects against aberrations, celestials, fiends, undead, and more.",
  "Protection from Poison": "Neutralizes poison and guards against more.",
  "Purify Food and Drink": "Removes poison and disease from food or drink.",
  "Ray of Enfeeblement": "Weakens a creature's weapon damage.",
  "Ray of Frost": "Deals cold damage and slows a target.",
  "Ray of Sickness": "Poisons a creature with a sickening ray.",
  "Remove Curse": "Ends curses on a creature or object.",
  "Resistance": "Adds a small protective boost to a saving throw.",
  "Revivify": "Returns a recently dead creature to life.",
  "Rope Trick": "Creates a hidden extradimensional refuge.",
  "Sacred Flame": "Calls radiant fire onto a target.",
  "Sanctuary": "Makes enemies hesitate before attacking a protected creature.",
  "Scorching Ray": "Fires multiple rays of flame.",
  "Searing Smite": "Sets your next weapon hit ablaze.",
  "See Invisibility": "Lets you see invisible creatures and objects.",
  "Sending": "Sends a short message across any distance.",
  "Shadow Blade": "Creates a weapon of solid shadow.",
  "Shatter": "Blasts an area with concussive sound.",
  "Shield": "Briefly raises your armor against an incoming hit.",
  "Shield of Faith": "Raises a creature's Armor Class.",
  "Shillelagh": "Empowers a club or staff with nature magic.",
  "Shocking Grasp": "Shocks a nearby target and blocks reactions.",
  "Silence": "Creates an area where sound and verbal spells fail.",
  "Silent Image": "Creates a visual illusion.",
  "Silvery Barbs": "Twists luck against one roll and aids an ally.",
  "Sleep": "Magically knocks weaker creatures unconscious.",
  "Sleet Storm": "Creates icy, obscuring, concentration-breaking weather.",
  "Slow": "Hinders creatures' speed, defenses, and actions.",
  "Spare the Dying": "Stabilizes a dying creature.",
  "Speak with Animals": "Lets you communicate with beasts.",
  "Speak with Dead": "Lets a corpse answer a few questions.",
  "Speak with Plants": "Communicates with plants and can shape terrain.",
  "Spider Climb": "Lets a creature climb walls and ceilings.",
  "Spike Growth": "Turns ground into hidden damaging spikes.",
  "Spirit Guardians": "Summons spirits that protect you and harm foes.",
  "Spiritual Weapon": "Creates a floating weapon that strikes for you.",
  "Stinking Cloud": "Creates nauseating gas that disrupts actions.",
  "Suggestion": "Magically pushes a creature toward a reasonable course.",
  "Tasha's Hideous Laughter": "Drops a creature into helpless magical laughter.",
  "Tenser's Floating Disk": "Creates a floating platform that carries gear.",
  "Thaumaturgy": "Creates small divine signs and dramatic effects.",
  "Thorn Whip": "Lashes a target with thorns and pulls it closer.",
  "Thunderous Smite": "Adds thunder damage and can knock a target away.",
  "Thunderwave": "Blasts nearby creatures with thunder force.",
  "Toll the Dead": "Rings necrotic damage into an injured target.",
  "Tongues": "Lets a creature understand and speak any language.",
  "True Strike": "Studies a foe to guide a later attack.",
  "Unseen Servant": "Creates an invisible helper for simple tasks.",
  "Vampiric Touch": "Damages by touch and heals you.",
  "Vicious Mockery": "Psychically insults a foe and hinders its next attack.",
  "Water Breathing": "Lets several creatures breathe underwater.",
  "Water Walk": "Lets creatures move across liquid surfaces.",
  "Web": "Fills an area with restraining webs.",
  "Wind Wall": "Creates a wall of wind that blocks arrows and gas.",
  "Witch Bolt": "Links lightning to a target for repeat damage.",
  "Zone of Truth": "Prevents deliberate lies inside an area."
};

export function spellEffectSummaryFor(spell: string) {
  const knownSummary = spellEffectSummaries[spell];

  if (knownSummary) {
    return knownSummary;
  }

  if (/heal|cure|restoration|revivify|vitality|hope|word/i.test(spell)) {
    return "Restores allies, removes harm, or keeps the party standing.";
  }

  if (/fire|flame|burn|scorcher|scorching|bonfire|bolt/i.test(spell)) {
    return "Deals fiery damage or shapes flames on the battlefield.";
  }

  if (/ice|frost|snow|cold|rime/i.test(spell)) {
    return "Deals cold damage or hinders movement with freezing magic.";
  }

  if (/lightning|thunder|storm|wave|tidal/i.test(spell)) {
    return "Unleashes elemental force to damage, push, or disrupt foes.";
  }

  if (/illusion|image|disguise|invisible|shadow|darkness/i.test(spell)) {
    return "Uses deception, concealment, or false images to reshape a scene.";
  }

  if (/charm|fear|friends|suggestion|command|antagonize/i.test(spell)) {
    return "Pressures a creature's emotions, choices, or behavior.";
  }

  if (/detect|locate|identify|clairvoyance|augury|sense|knowledge/i.test(spell)) {
    return "Reveals hidden information, magic, creatures, or useful omens.";
  }

  if (/summon|conjure|familiar|steed|servant|animate/i.test(spell)) {
    return "Calls or creates a helper, creature, or servant.";
  }

  if (/wall|growth|snare|bind|lock|hold|slow|web|grasp|fortress/i.test(spell)) {
    return "Controls space by restraining, blocking, or slowing enemies.";
  }

  if (/telekinetic|mind|psychic|psion|intellect/i.test(spell)) {
    return "Uses mental force to damage, protect, move, or overwhelm.";
  }

  if (/step|stride|jaunt|fly|jump|longstrider|levitate|walk|breathing/i.test(spell)) {
    return "Improves movement, positioning, or travel options.";
  }

  if (/shield|armor|protection|ward|bond|absorb|resistance/i.test(spell)) {
    return "Protects against attacks, damage, or dangerous effects.";
  }

  if (/weapon|smite|strike|blade|arrow|mark|barrage/i.test(spell)) {
    return "Enhances attacks or turns a weapon hit into a stronger effect.";
  }

  return "Adds a flexible magical option for combat, exploration, or problem-solving.";
}

export function spellArchetypeFor(spell: string) {
  if (/fire|flame|burn|scorch|bonfire|pyrotechnics|heat metal/i.test(spell)) {
    return "fire";
  }

  if (/ice|frost|snow|cold|rime|sleet/i.test(spell)) {
    return "frost";
  }

  if (/lightning|storm|witch bolt|call lightning/i.test(spell)) {
    return "lightning";
  }

  if (/thunder|shatter|silence|dissonant|mockery|laughter/i.test(spell)) {
    return "sound";
  }

  if (/acid|caustic|corros/i.test(spell)) {
    return "acid";
  }

  if (/poison|venom|sickness|infestation|stinking cloud/i.test(spell)) {
    return "poison";
  }

  if (/radiant|sacred|guiding bolt|moonbeam|word of radiance/i.test(spell)) {
    return "radiant";
  }

  if (/daylight|light|continual flame/i.test(spell)) {
    return "light";
  }

  if (/dead|false life|vampiric|wither|inflict|toll|chill|life transference|animate dead|speak with dead|spare the dying/i.test(spell)) {
    return "necrotic";
  }

  if (/mind|psychic|psion|intellect|phantasmal|synaptic|telekinetic/i.test(spell)) {
    return "psychic";
  }

  if (/missile|force|eldritch blast|blast|unseen servant|floating disk/i.test(spell)) {
    return "force";
  }

  if (/heal|cure|restoration|revivify|goodberry|aid|prayer|beacon|vitality|hope/i.test(spell)) {
    return "healing";
  }

  if (/shield|armor|protection|ward|bond|absorb|sanctuary|counterspell|dispel|resistance|fortress/i.test(spell)) {
    return "shield";
  }

  if (/alarm|lock|glyph|snare|binding|circle|private sanctum|nystul/i.test(spell)) {
    return "ward";
  }

  if (/charm|suggestion|friends|heroism|command|enthrall|fast friends|motivation|bless|bane/i.test(spell)) {
    return "charm";
  }

  if (/fear|cause fear|antagonize|wrathful/i.test(spell)) {
    return "fear";
  }

  if (/illusion|image|disguise|invisible|blur|mirror|phantom|hypnotic|color spray/i.test(spell)) {
    return "illusion";
  }

  if (/dark|shadow|hunger of hadar|nondetection/i.test(spell)) {
    return "darkness";
  }

  if (/detect|identify|locate|clairvoyance|augury|thought|sense|comprehend|see invisibility|true strike|zone of truth/i.test(spell)) {
    return "divination";
  }

  if (/tongues|message|sending|speak with/i.test(spell)) {
    return "communication";
  }

  if (/summon|conjure|familiar|steed|servant|spirit guardians/i.test(spell)) {
    return "summoning";
  }

  if (/step|teleport|vortex|misty|warp|jaunt/i.test(spell)) {
    return "teleport";
  }

  if (/fly|jump|longstrider|levitate|haste|slow|walk|spider climb|expeditious|retreat|feather fall|zephyr/i.test(spell)) {
    return "movement";
  }

  if (/plant|thorn|vine|growth|entangle|bark|shillelagh|druidcraft|nature|faerie|pass without trace|spike growth/i.test(spell)) {
    return "nature";
  }

  if (/beast|animal/i.test(spell)) {
    return "beast";
  }

  if (/water|tidal|wave|fog|cloud|breathing|shape water|create or destroy water/i.test(spell)) {
    return "water";
  }

  if (/wind|gust|air|skywrite/i.test(spell)) {
    return "wind";
  }

  if (/earth|stone|mold|erupting|catapult|maximilian|meld/i.test(spell)) {
    return "earth";
  }

  if (/gravity|pulse wave/i.test(spell)) {
    return "gravity";
  }

  if (/curse|hex|enfeeblement|bestow curse/i.test(spell)) {
    return "curse";
  }

  if (/weapon|smite|strike|blade|arrow|mark|barrage|magic stone|magic weapon/i.test(spell)) {
    return "weapon";
  }

  if (/sleep|catnap|tiny hut|rope trick/i.test(spell)) {
    return "sleep";
  }

  if (/silvery|fortune|gift of alacrity|time/i.test(spell)) {
    return "luck-time";
  }

  if (/create|creation|mending|purify|prestidigitation|thaumaturgy|floating disk|tiny servant/i.test(spell)) {
    return "creation";
  }

  if (/alter|enlarge|reduce|gaseous|enhance|darkvision|shape|polymorph|transmut/i.test(spell)) {
    return "transformation";
  }

  if (/alchemy|potion|grease|knock|magic mouth|silent image/i.test(spell)) {
    return "alchemy";
  }

  return "force";
}

export function spellArtPathFor(spell: string) {
  return `/spell-archetypes/${spellArchetypeFor(spell)}.webp`;
}

const specificSpellSchools: Record<string, string> = {
  Aid: "Abjuration",
  Bane: "Enchantment",
  Bless: "Enchantment",
  "Cure Wounds": "Evocation",
  Goodberry: "Transmutation",
  Guidance: "Divination",
  "Healing Word": "Evocation",
  Heroism: "Enchantment",
  "Lesser Restoration": "Abjuration",
  "Mass Healing Word": "Evocation",
  "Prayer of Healing": "Evocation",
  Resistance: "Abjuration",
  Revivify: "Necromancy",
  Sanctuary: "Abjuration",
  "Shield of Faith": "Abjuration",
  "Spare the Dying": "Necromancy"
};

export function spellSchoolFor(spell: string) {
  const specificSchool = specificSpellSchools[spell];

  if (specificSchool) {
    return specificSchool;
  }

  if (/shield|armor|protection|ward|bond|absorb|resistance|fortress|sanctuary/i.test(spell)) {
    return "Abjuration";
  }

  if (/summon|conjure|familiar|steed|servant|teleport|step|jaunt|vortex|misty|floating|disk/i.test(spell)) {
    return "Conjuration";
  }

  if (/detect|identify|locate|clairvoyance|augury|thought|sense|see invisibility|tongues|comprehend/i.test(spell)) {
    return "Divination";
  }

  if (/charm|command|suggestion|fear|bane|bless|friends|laughter|mockery|hold person|enthrall|antagonize|fast friends|heroism/i.test(spell)) {
    return "Enchantment";
  }

  if (/cure|heal|word|fire|bolt|burn|lightning|thunder|ray|blast|shatter|wave|earth|ice|frost|acid|flame|sphere|moonbeam|radiance|sacred|storm|eruption/i.test(spell)) {
    return "Evocation";
  }

  if (/illusion|image|disguise|invisible|shadow|blur|mirror|phantasmal|darkness|nondetection|script/i.test(spell)) {
    return "Illusion";
  }

  if (/animate|dead|false life|vampiric|wither|inflict|curse|enfeeblement|sickness|toll|chill|life transference/i.test(spell)) {
    return "Necromancy";
  }

  if (/alter|enlarge|reduce|haste|slow|fly|gaseous|water|stone|barkskin|darkvision|enhance|spider|longstrider|jump|mending|shape|mold|control/i.test(spell)) {
    return "Transmutation";
  }

  return "Varies";
}

export function spellDurationFor(spell: string, level: SpellLevelLabel | null) {
  if (/mage armor/i.test(spell)) {
    return "8 hours";
  }

  if (/darkvision|water breathing/i.test(spell)) {
    return "8 hours";
  }

  if (/alarm|arcane lock|continual flame|glyph|illusory script|magic mouth|nystul/i.test(spell)) {
    return "Until dispelled";
  }

  if (/detect magic|detect evil|detect poison|clairvoyance|locate|speak with|beast sense|see invisibility/i.test(spell)) {
    return "Concentration, up to 10 minutes";
  }

  if (/bless|bane|hex|hunter|faerie|hold|suggestion|fear|fly|haste|slow|invisibility|blur|web|moonbeam|flaming sphere|spirit guardians|hypnotic|cloud|wall|entangle|silence|darkness|protection from|shield of faith|enlarge|enhance|levitate|heat metal|crown|phantasmal|call lightning|sleet|stinking|vampiric/i.test(spell)) {
    return "Concentration, up to 1 minute";
  }

  if (/goodberry|aid|longstrider|false life|heroism|pass without trace|rope trick|tiny hut|phantom steed/i.test(spell)) {
    return "1 hour or longer";
  }

  if (level === "Cantrip" || /bolt|ray|blast|missile|shatter|fireball|lightning bolt|thunderwave|cure wounds|healing word|inflict|guiding bolt|sacred flame|acid splash|poison spray|thorn whip/i.test(spell)) {
    return "Instantaneous";
  }

  return "Varies by use";
}

export function spellCastingTimeFor(spell: string) {
  if (/counterspell|shield|feather fall|hellish rebuke|absorb elements|silvery barbs/i.test(spell)) {
    return "1 reaction";
  }

  if (/healing word|misty step|spiritual weapon|shield of faith|hex|hunter|smite|divine favor|magic stone|shillelagh|zephyr strike/i.test(spell)) {
    return "1 bonus action";
  }

  if (/find familiar|find steed|identify|alarm|augury|prayer of healing|tiny hut|phantom steed|glyph/i.test(spell)) {
    return "1 minute or longer";
  }

  return "1 action";
}

export function spellRangeFor(spell: string) {
  if (/shield$|armor of agathys|alter self|blink|blur|divine favor|expeditious retreat|false life|gaseous form|mirror image|misty step|shadow blade/i.test(spell)) {
    return "Self";
  }

  if (/burning hands|thunderwave|fear|color spray|cone/i.test(spell)) {
    return "Self-area";
  }

  if (/cure wounds|guidance|resistance|spare the dying|light|mending|shocking grasp|inflict wounds|protection from poison|lesser restoration|remove curse|revivify|barkskin|enhance ability|invisibility|darkvision|fly|haste|water breathing|water walk/i.test(spell)) {
    return "Touch";
  }

  if (/fire bolt|eldritch blast|ray|witch bolt|chill touch|message/i.test(spell)) {
    return "120 feet";
  }

  if (/fireball|lightning bolt|counterspell|dispel magic|hypnotic pattern|major image|slow|sleet storm|stinking cloud|call lightning/i.test(spell)) {
    return "120 feet or more";
  }

  if (/sacred flame|toll the dead|vicious mockery|healing word|guiding bolt|hold person|shatter|spiritual weapon|moonbeam|web|faerie fire|entangle|silence|darkness|command|bane|bless/i.test(spell)) {
    return "60 feet";
  }

  return "Varies";
}

const spellRollDetails: Record<string, string> = {
  "acid splash":
    "Dexterity saving throw against your spell save DC; on a failed save, roll 2d6 acid damage at Level 5.",
  aid: "No roll when cast. Three creatures gain 5 current and maximum hit points; add +5 hit points per slot level above 2nd.",
  bane: "Charisma saving throw against your spell save DC. Affected targets subtract 1d4 from attack rolls and saving throws.",
  bless:
    "No attack or damage roll when cast. Affected creatures add 1d4 to attack rolls and saving throws.",
  "burning hands":
    "Dexterity saving throw against your spell save DC; roll 3d6 fire damage, +1d6 per slot level above 1st.",
  "call lightning":
    "Dexterity saving throw against your spell save DC; roll 3d10 lightning damage each bolt, +1d10 per slot level above 3rd.",
  "chromatic orb":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 3d8 damage, +1d8 per slot level above 1st.",
  "cloud of daggers":
    "No attack roll. Roll 4d4 slashing damage when a creature enters the area or starts its turn there, +2d4 per slot level above 2nd.",
  "color spray":
    "No attack roll or saving throw. Roll 6d10 to determine total hit points affected, +2d10 per slot level above 1st.",
  "cure wounds":
    "Roll 1d8 + your spellcasting modifier for healing, +1d8 per slot level above 1st.",
  "dissonant whispers":
    "Wisdom saving throw against your spell save DC; roll 3d6 psychic damage, +1d6 per slot level above 1st.",
  "earth tremor":
    "Dexterity saving throw against your spell save DC; roll 1d6 bludgeoning damage, +1d6 per slot level above 1st.",
  "eldritch blast":
    "Make two spell attack rolls at Level 5: each beam is d20 + your spell attack bonus. On a hit, roll 1d10 force damage per beam.",
  "false life":
    "Roll 1d4 + 4 temporary hit points, +5 temporary hit points per slot level above 1st.",
  "fire bolt":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d10 fire damage at Level 5.",
  fireball:
    "Dexterity saving throw against your spell save DC; roll 8d6 fire damage, +1d6 per slot level above 3rd.",
  "flame blade":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 3d6 fire damage, +1d6 per two slot levels above 2nd.",
  "flaming sphere":
    "Dexterity saving throw against your spell save DC; roll 2d6 fire damage, +1d6 per slot level above 2nd.",
  "frost fingers":
    "Constitution saving throw against your spell save DC; roll 2d8 cold damage, +1d8 per slot level above 1st.",
  goodberry: "No roll when cast. Creates 10 berries; each berry restores 1 hit point.",
  "guiding bolt":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 4d6 radiant damage, +1d6 per slot level above 1st.",
  "healing word":
    "Roll 1d4 + your spellcasting modifier for healing, +1d4 per slot level above 1st.",
  "hellish rebuke":
    "Dexterity saving throw against your spell save DC; roll 2d10 fire damage, +1d10 per slot level above 1st.",
  "ice knife":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 1d10 piercing damage; then nearby creatures make Dexterity saves against 2d6 cold damage, +1d6 cold per slot level above 1st.",
  "inflict wounds":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 3d10 necrotic damage, +1d10 per slot level above 1st.",
  "lightning bolt":
    "Dexterity saving throw against your spell save DC; roll 8d6 lightning damage, +1d6 per slot level above 3rd.",
  "magic missile":
    "No attack roll or saving throw. Roll 3d4 + 3 force damage for the darts, +1d4 + 1 per slot level above 1st.",
  "melf's acid arrow":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 4d4 acid damage now and 2d4 acid damage at the end of the target's next turn, +1d4 initial damage per slot level above 2nd.",
  "mind sliver":
    "Intelligence saving throw against your spell save DC; on a failed save, roll 2d6 psychic damage at Level 5 and subtract 1d4 from the target's next saving throw.",
  "moonbeam":
    "Constitution saving throw against your spell save DC; roll 2d10 radiant damage, +1d10 per slot level above 2nd.",
  "poison spray":
    "Constitution saving throw against your spell save DC; on a failed save, roll 2d12 poison damage at Level 5.",
  "prayer of healing":
    "Roll 2d8 + your spellcasting modifier for each chosen creature's healing, +1d8 per slot level above 2nd.",
  "produce flame":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d8 fire damage at Level 5.",
  "ray of frost":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d8 cold damage at Level 5.",
  "ray of sickness":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d8 poison damage, +1d8 per slot level above 1st.",
  "sacred flame":
    "Dexterity saving throw against your spell save DC; on a failed save, roll 2d8 radiant damage at Level 5.",
  "scorching ray":
    "Make three spell attack rolls: each ray is d20 + your spell attack bonus. On a hit, roll 2d6 fire damage per ray; add one ray per slot level above 2nd.",
  shatter:
    "Constitution saving throw against your spell save DC; roll 3d8 thunder damage, +1d8 per slot level above 2nd.",
  "shocking grasp":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d8 lightning damage at Level 5.",
  sleep:
    "No saving throw. Roll 5d8 to determine total hit points affected, +2d8 per slot level above 1st.",
  "spiritual weapon":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 1d8 + your spellcasting modifier force damage, +1d8 per two slot levels above 2nd.",
  "thorn whip":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 2d6 piercing damage at Level 5.",
  "thunderwave":
    "Constitution saving throw against your spell save DC; roll 2d8 thunder damage, +1d8 per slot level above 1st.",
  "toll the dead":
    "Wisdom saving throw against your spell save DC; on a failed save, roll 2d8 necrotic damage at Level 5, or 2d12 if the target is missing hit points.",
  "vampiric touch":
    "Make a melee spell attack roll: d20 + your spell attack bonus. On a hit, roll 3d6 necrotic damage, +1d6 per slot level above 3rd, and heal for half the necrotic damage dealt.",
  "vicious mockery":
    "Wisdom saving throw against your spell save DC; on a failed save, roll 2d4 psychic damage at Level 5.",
  "witch bolt":
    "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll 1d12 lightning damage, +1d12 initial damage per slot level above 1st."
};

export function spellRollsFor(spell: string) {
  const exactRollDetails = spellRollDetails[spell.trim().toLowerCase()];

  if (exactRollDetails) {
    return exactRollDetails;
  }

  if (/fire bolt|eldritch blast|ray|guiding bolt|produce flame|thorn whip|shocking grasp|witch bolt|chromatic orb|scorching ray|melf/i.test(spell)) {
    return "Make a spell attack roll: d20 + your spell attack bonus. On a hit, roll the spell's damage dice.";
  }

  if (/sacred flame|toll the dead|mind sliver|acid splash|poison spray|fireball|lightning bolt|shatter|thunderwave|burning hands|fear|hypnotic|hold person|command|bane|charm|suggestion|web|entangle|slow|stinking|sleet|faerie|dissonant|vicious|inflict|blindness/i.test(spell)) {
    return "The target rolls a saving throw against your spell save DC. Roll damage or apply the effect after success or failure is known.";
  }

  if (/cure|healing|goodberry|aid|prayer|mass healing|false life/i.test(spell)) {
    return "Roll the listed healing or temporary hit point dice, then apply your spellcasting modifier when the spell calls for it.";
  }

  if (/magic missile/i.test(spell)) {
    return "No attack roll is needed. Roll the force damage dice for the darts and assign targets before damage is applied.";
  }

  if (/bless|guidance|resistance|bardic|enhance|heroism|shield|armor|protection|invisibility|fly|haste|misty|detect|identify|locate|comprehend/i.test(spell)) {
    return "Usually no attack roll is made when cast. Track concentration when required, and roll only when a later check, save, or attack uses the benefit.";
  }

  return "Resolve with your spell save DC or spell attack bonus only if the DM calls for a roll; otherwise apply the spell's described effect.";
}

export function spellDetailFor(spell: string, level: SpellLevelLabel | null): SpellRuleProfile {
  const summary = spellEffectSummaryFor(spell);
  const school = spellSchoolFor(spell);
  const duration = spellDurationFor(spell, level);
  const castingTime = spellCastingTimeFor(spell);
  const range = spellRangeFor(spell);
  const levelText = level ?? "spell";

  return {
    description: `${spell} is a ${levelText} ${school.toLowerCase()} option. ${summary} Use it when that effect would change the scene clearly: damage an enemy, protect an ally, reveal information, move through danger, or create a tactical opening. The DM may still ask for targets, a point of origin, or visible positioning before resolving it.`,
    rolls: spellRollsFor(spell),
    school,
    duration,
    castingTime,
    range
  };
}
const spellCatalog = {
  Artificer: [
    {
      level: "Cantrip",
      base: ["Fire Bolt", "Guidance", "Mending", "Acid Splash", "Dancing Lights", "Light", "Mage Hand", "Message", "Poison Spray", "Prestidigitation", "Ray of Frost", "Resistance", "Shocking Grasp", "Spare the Dying", "Thorn Whip"],
      dlc: ["Booming Blade", "Create Bonfire", "Frostbite", "Green-Flame Blade", "Lightning Lure", "Magic Stone", "Sword Burst", "Thunderclap"]
    },
    {
      level: "1st level",
      base: ["Alarm", "Cure Wounds", "Detect Magic", "Disguise Self", "Expeditious Retreat", "Faerie Fire", "False Life", "Feather Fall", "Grease", "Identify", "Jump", "Longstrider", "Purify Food and Drink", "Sanctuary"],
      dlc: ["Absorb Elements", "Catapult", "Snare", "Tasha's Caustic Brew"]
    },
    {
      level: "2nd level",
      base: ["Aid", "Alter Self", "Arcane Lock", "Blur", "Continual Flame", "Darkvision", "Enhance Ability", "Enlarge/Reduce", "Heat Metal", "Invisibility", "Lesser Restoration", "Levitate", "Magic Mouth", "Magic Weapon", "Protection from Poison", "Rope Trick", "See Invisibility", "Spider Climb", "Web"],
      dlc: ["Air Bubble", "Kinetic Jaunt", "Pyrotechnics", "Skywrite", "Vortex Warp"]
    }
  ],
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
  Psion: [
    {
      level: "Cantrip",
      base: ["Minor Illusion", "Telekinetic Fling", "Mind Sliver", "Mage Hand", "Blade Ward", "Dancing Lights", "Friends", "Light", "Mending", "Message", "Prestidigitation", "True Strike"]
    },
    {
      level: "1st level",
      base: ["Animal Friendship", "Charm Person", "Command", "Comprehend Languages", "Detect Magic", "Dissonant Whispers", "Feather Fall", "Identify", "Jump", "Longstrider", "Mage Armor", "Silent Image", "Sleep", "Speak with Animals", "Tasha's Hideous Laughter", "Tenser's Floating Disk"]
    },
    {
      level: "2nd level",
      base: ["Animal Messenger", "Blindness/Deafness", "Calm Emotions", "Crown of Madness", "Detect Thoughts", "Enhance Ability", "Enlarge/Reduce", "Enthrall", "Heat Metal", "Hold Person", "Invisibility", "Knock", "Locate Animals or Plants", "Locate Object", "Magic Mouth", "Mind Spike", "Mirror Image", "Phantasmal Force", "See Invisibility", "Shatter", "Silence", "Suggestion", "Zone of Truth"],
      dlc: ["Tasha's Mind Whip"]
    },
    {
      level: "3rd level",
      base: ["Animate Dead", "Bestow Curse", "Clairvoyance", "Dispel Magic", "Fear", "Fly", "Hypnotic Pattern", "Major Image", "Nondetection", "Sending", "Tongues"],
      dlc: ["Intellect Fortress", "Summon Astral Entity", "Telekinetic Crush"]
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
  },
  {
    id: "Artificer",
    summary: "A magical inventor who turns tools, infusions, and clever craft into power.",
    hitDie: 8,
    saveProficiencies: ["con", "int"],
    skillChoices: ["Arcana", "History", "Investigation", "Medicine", "Nature", "Perception", "Sleight of Hand"],
    defaultSkills: ["Arcana", "Investigation"],
    subclassLabel: "Artificer Specialist",
    subclassOptions: ["Alchemist", "Armorer", "Artillerist", "Battle Smith"],
    featureLabel: "Infusions Known",
    featureOptions: ["Enhanced Defense and Enhanced Weapon", "Mind Sharpener and Replicate Magic Item", "Returning Weapon and Homunculus Servant"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Simple weapons, firearms where available",
      tools: "Thieves' tools, tinker's tools, one type of artisan's tools"
    },
    equipmentKits: [
      {
        id: "Battlefield inventor",
        armorClass: 17,
        weapons: ["Light crossbow: +6 to hit, 1d8+3 piercing, range 80/320 ft", "Dagger: +6 to hit, 1d4+3 piercing, thrown 20/60 ft"],
        gear: ["Scale mail", "Shield", "Light crossbow", "20 bolts", "Thieves' tools", "Tinker's tools", "Dungeoneer's pack", "10 GP"]
      },
      {
        id: "Workshop alchemist",
        armorClass: 15,
        weapons: ["Fire Bolt: +7 to hit, 2d10 fire", "Dagger: +6 to hit, 1d4+3 piercing, thrown 20/60 ft"],
        gear: ["Studded leather armor", "Dagger", "Alchemist's supplies", "Thieves' tools", "Dungeoneer's pack", "10 GP"]
      }
    ],
    spellGroups: spellCatalog.Artificer
  },
  {
    id: "Blood Hunter",
    summary: "A grim monster hunter who turns blood rites and hard training against the dark.",
    hitDie: 10,
    saveProficiencies: ["dex", "int"],
    skillChoices: ["Acrobatics", "Arcana", "Athletics", "History", "Insight", "Investigation", "Religion", "Survival"],
    defaultSkills: ["Investigation", "Survival", "Arcana"],
    subclassLabel: "Blood Hunter Order",
    subclassOptions: ["Order of the Ghostslayer", "Order of the Lycan", "Order of the Mutant", "Order of the Profane Soul"],
    featureLabel: "Crimson Rite focus",
    featureOptions: ["Rite of the Flame", "Rite of the Frozen", "Rite of the Storm"],
    proficiencies: {
      armor: "Light armor, medium armor, shields",
      weapons: "Simple weapons, martial weapons",
      tools: "Alchemist's supplies"
    },
    equipmentKits: [
      {
        id: "Witch hunter",
        armorClass: 17,
        weapons: ["Longsword: +6 to hit, 1d8+3 slashing", "Light crossbow: +7 to hit, 1d8+4 piercing, range 80/320 ft"],
        gear: ["Scale mail", "Longsword", "Light crossbow", "20 bolts", "Explorer's pack", "Alchemist's supplies", "10 GP"]
      },
      {
        id: "Cursed duelist",
        armorClass: 16,
        weapons: ["Rapier: +7 to hit, 1d8+4 piercing", "Hand crossbow: +7 to hit, 1d6+4 piercing, range 30/120 ft"],
        gear: ["Studded leather armor", "Rapier", "Hand crossbow", "20 bolts", "Explorer's pack", "Alchemist's supplies", "10 GP"]
      }
    ],
    spellGroups: []
  },
  {
    id: "Psion",
    summary: "A psychic spellcaster who shapes magic through focus, telepathy, and force of mind.",
    hitDie: 6,
    saveProficiencies: ["int", "wis"],
    skillChoices: ["Arcana", "Insight", "Intimidation", "Investigation", "Medicine", "Perception", "Persuasion"],
    defaultSkills: ["Arcana", "Insight"],
    subclassLabel: "Psion Subclass",
    subclassOptions: ["Metamorph", "Psi Warper", "Psykinetic", "Telepath"],
    featureLabel: "Psionic Discipline",
    featureOptions: ["Expanded Awareness and Id Insinuation", "Inerrant Aim and Tactical Mind", "Biofeedback and Psionic Guards"],
    proficiencies: {
      armor: "None",
      weapons: "Simple weapons"
    },
    equipmentKits: [
      {
        id: "Telekinetic traveler",
        armorClass: 15,
        weapons: ["Mind Sliver: DC 15 Intelligence save, 2d6 psychic", "Light crossbow: +5 to hit, 1d8+2 piercing, range 80/320 ft"],
        gear: ["Spear", "2 daggers", "Light crossbow", "20 bolts", "Map case", "Dungeoneer's pack", "6 GP"]
      }
    ],
    spellGroups: spellCatalog.Psion
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
  "Alchemist's supplies",
  "Tinker's tools",
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
const genderOptions = ["Male", "Female", "Non-binary"] as const;
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
  Wizard: { str: 8, dex: 14, con: 15, int: 17, wis: 12, cha: 10 },
  Artificer: { str: 8, dex: 14, con: 16, int: 17, wis: 10, cha: 10 },
  "Blood Hunter": { str: 10, dex: 17, con: 14, int: 15, wis: 12, cha: 8 },
  Psion: { str: 8, dex: 14, con: 15, int: 17, wis: 12, cha: 10 }
};
type CharacterClass = (typeof classOptions)[number]["id"];
type CharacterSpecies = (typeof speciesOptions)[number];
type CharacterBackground = (typeof backgroundOptions)[number];
type Alignment = (typeof alignmentOptions)[number];
type Gender = (typeof genderOptions)[number];

const classArtByClass: Record<CharacterClass, string> = {
  Artificer: artificerClassArt.src,
  Barbarian: barbarianClassArt.src,
  Bard: bardClassArt.src,
  "Blood Hunter": bloodHunterClassArt.src,
  Cleric: clericClassArt.src,
  Druid: druidClassArt.src,
  Fighter: fighterClassArt.src,
  Monk: monkClassArt.src,
  Paladin: paladinClassArt.src,
  Psion: psionClassArt.src,
  Ranger: rangerClassArt.src,
  Rogue: rogueClassArt.src,
  Sorcerer: sorcererClassArt.src,
  Warlock: warlockClassArt.src,
  Wizard: wizardClassArt.src
};

const speciesArtBySpecies: Record<CharacterSpecies, string> = {
  Human: humanSpeciesArt.src,
  Elf: elfSpeciesArt.src,
  Dwarf: dwarfSpeciesArt.src,
  Halfling: halflingSpeciesArt.src,
  Gnome: gnomeSpeciesArt.src,
  "Half-Elf": halfElfSpeciesArt.src,
  "Half-Orc": halfOrcSpeciesArt.src,
  Tiefling: tieflingSpeciesArt.src,
  Dragonborn: dragonbornSpeciesArt.src
};

const equipmentCategoryOptions: Record<EquipmentCategory, string[]> = {
  simpleWeapon: [
    "Club",
    "Dagger",
    "Greatclub",
    "Handaxe",
    "Javelin",
    "Light hammer",
    "Mace",
    "Quarterstaff",
    "Sickle",
    "Spear",
    "Light crossbow",
    "Dart",
    "Shortbow",
    "Sling"
  ],
  simpleMeleeWeapon: [
    "Club",
    "Dagger",
    "Greatclub",
    "Handaxe",
    "Javelin",
    "Light hammer",
    "Mace",
    "Quarterstaff",
    "Sickle",
    "Spear"
  ],
  martialWeapon: [
    "Battleaxe",
    "Flail",
    "Glaive",
    "Greataxe",
    "Greatsword",
    "Halberd",
    "Lance",
    "Longsword",
    "Maul",
    "Morningstar",
    "Pike",
    "Rapier",
    "Scimitar",
    "Shortsword",
    "Trident",
    "War pick",
    "Warhammer",
    "Whip",
    "Blowgun",
    "Hand crossbow",
    "Heavy crossbow",
    "Longbow",
    "Net"
  ],
  martialMeleeWeapon: [
    "Battleaxe",
    "Flail",
    "Glaive",
    "Greataxe",
    "Greatsword",
    "Halberd",
    "Lance",
    "Longsword",
    "Maul",
    "Morningstar",
    "Pike",
    "Rapier",
    "Scimitar",
    "Shortsword",
    "Trident",
    "War pick",
    "Warhammer",
    "Whip"
  ],
  musicalInstrument: [
    "Bagpipes",
    "Drum",
    "Dulcimer",
    "Flute",
    "Horn",
    "Lute",
    "Lyre",
    "Pan flute",
    "Shawm",
    "Viol"
  ]
};

const newAdventureStartupImageUrls = [
  "/new-adventure/flow-bg.png",
  "/new-adventure/singleplayer-banner.webp",
  "/new-adventure/multiplayer-banner.webp",
  ...Object.values(campaignWorldBannerUrls)
];
const newAdventureClassImageUrls = Object.values(classArtByClass);
const newAdventureSpeciesImageUrls = Object.values(speciesArtBySpecies);
const newAdventureBackgroundImageUrls = backgroundOptions.map((option) =>
  optionArtUrl("backgrounds", option)
);
const newAdventureSkillImageUrls = skillDefinitions.map((skill) =>
  optionArtUrl("skills", skill.name)
);
const newAdventureToolImageUrls = toolOptions.map((tool) =>
  optionArtUrl("tools", tool)
);
const newAdventureWeaponImageUrls = Array.from(
  new Set(
    weaponCategories
      .flatMap((category) => equipmentCategoryOptions[category])
      .map((weapon) => optionArtUrl("weapons", weapon))
  )
);
const newAdventureCustomOptionImageUrls = [
  ...newAdventureBackgroundImageUrls,
  ...newAdventureSkillImageUrls,
  ...newAdventureToolImageUrls,
  ...newAdventureWeaponImageUrls
];
const adventureImagePreloadPromises = new Map<string, Promise<void>>();

function uniqueImageUrls(urls: string[]) {
  return Array.from(new Set(urls.filter(Boolean)));
}

function preloadAdventureImage(url: string) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const existingPreload = adventureImagePreloadPromises.get(url);

  if (existingPreload) {
    return existingPreload;
  }

  const preload = new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;
    const timeoutId = window.setTimeout(resolvePreload, 8_000);

    function resolvePreload() {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    }

    image.decoding = "async";
    image.onload = resolvePreload;
    image.onerror = resolvePreload;
    image.src = url;
  });

  adventureImagePreloadPromises.set(url, preload);
  return preload;
}

async function preloadAdventureImages(urls: string[], concurrency = 4) {
  const queue = uniqueImageUrls(urls);
  let nextIndex = 0;

  async function preloadNextImage(): Promise<void> {
    const url = queue[nextIndex];
    nextIndex += 1;

    if (!url) {
      return;
    }

    await preloadAdventureImage(url);
    await preloadNextImage();
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () =>
      preloadNextImage()
    )
  );
}

function scheduleAdventureImagePreload(urls: string[], concurrency = 3) {
  if (typeof window === "undefined") {
    return;
  }

  const preload = () => {
    void preloadAdventureImages(urls, concurrency);
  };
  const windowWithIdleCallback = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
  };

  if (windowWithIdleCallback.requestIdleCallback) {
    windowWithIdleCallback.requestIdleCallback(preload, { timeout: 1_500 });
    return;
  }

  window.setTimeout(preload, 120);
}

const classEquipmentRules: Record<CharacterClass, EquipmentRule> = {
  Artificer: {
    choices: [
      {
        id: "armor",
        label: "Choice 1",
        options: [
          { id: "scale-mail", label: "Scale mail and shield", items: ["Scale mail", "Shield"] },
          { id: "studded-leather", label: "Studded leather armor", items: ["Studded leather armor"] }
        ]
      },
      {
        id: "weapon-1",
        label: "Choice 2",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "tool-1",
        label: "Choice 3",
        options: [
          { id: "tinkers-tools", label: "Tinker's tools", items: ["Tinker's tools"] },
          { id: "alchemists-supplies", label: "Alchemist's supplies", items: ["Alchemist's supplies"] },
          { id: "smiths-tools", label: "Smith's tools", items: ["Smith's tools"] }
        ]
      }
    ],
    fixed: ["Thieves' tools", "Dungeoneer's pack"]
  },
  Barbarian: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "greataxe", label: "Greataxe", items: ["Greataxe"] },
          {
            id: "any-martial-melee",
            label: "Any martial melee weapon",
            category: "martialMeleeWeapon"
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          { id: "two-handaxes", label: "Two handaxes", items: ["2 handaxes"] },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      }
    ],
    fixed: ["Explorer's pack", "4 javelins"]
  },
  Bard: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "rapier", label: "Rapier", items: ["Rapier"] },
          { id: "longsword", label: "Longsword", items: ["Longsword"] },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "pack",
        label: "Choice 2",
        options: [
          { id: "diplomats-pack", label: "Diplomat's pack", items: ["Diplomat's pack"] },
          { id: "entertainers-pack", label: "Entertainer's pack", items: ["Entertainer's pack"] }
        ]
      },
      {
        id: "instrument",
        label: "Choice 3",
        options: [
          { id: "lute", label: "Lute", items: ["Lute"] },
          {
            id: "any-instrument",
            label: "Any other musical instrument",
            category: "musicalInstrument"
          }
        ]
      }
    ],
    fixed: ["Leather armor", "Dagger"]
  },
  Cleric: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "mace", label: "Mace", items: ["Mace"] },
          { id: "warhammer", label: "Warhammer, if proficient", items: ["Warhammer"] }
        ]
      },
      {
        id: "armor",
        label: "Choice 2",
        options: [
          { id: "scale-mail", label: "Scale mail", items: ["Scale mail"] },
          { id: "leather-armor", label: "Leather armor", items: ["Leather armor"] },
          { id: "chain-mail", label: "Chain mail, if proficient", items: ["Chain mail"] }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 3",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "pack",
        label: "Choice 4",
        options: [
          { id: "priests-pack", label: "Priest's pack", items: ["Priest's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["Shield", "Holy symbol"]
  },
  Druid: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "wooden-shield", label: "Wooden shield", items: ["Shield"] },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          { id: "scimitar", label: "Scimitar", items: ["Scimitar"] },
          {
            id: "any-simple-melee",
            label: "Any simple melee weapon",
            category: "simpleMeleeWeapon"
          }
        ]
      }
    ],
    fixed: ["Leather armor", "Explorer's pack", "Druidic focus"]
  },
  Fighter: {
    choices: [
      {
        id: "armor",
        label: "Choice 1",
        options: [
          { id: "chain-mail", label: "Chain mail", items: ["Chain mail"] },
          {
            id: "leather-archer",
            label: "Leather armor, longbow, and 20 arrows",
            items: ["Leather armor", "Longbow", "20 arrows"]
          }
        ]
      },
      {
        id: "weapon-1",
        label: "Choice 2",
        options: [
          {
            id: "martial-and-shield",
            label: "One martial weapon and a shield",
            category: "martialWeapon",
            items: ["Shield"]
          },
          {
            id: "two-martial",
            label: "Two martial weapons",
            category: "martialWeapon",
            quantity: 2
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 3",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          { id: "two-handaxes", label: "Two handaxes", items: ["2 handaxes"] }
        ]
      },
      {
        id: "pack",
        label: "Choice 4",
        options: [
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: []
  },
  Monk: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "shortsword", label: "Shortsword", items: ["Shortsword"] },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "pack",
        label: "Choice 2",
        options: [
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["10 darts"]
  },
  Paladin: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          {
            id: "martial-and-shield",
            label: "One martial weapon and a shield",
            category: "martialWeapon",
            items: ["Shield"]
          },
          {
            id: "two-martial",
            label: "Two martial weapons",
            category: "martialWeapon",
            quantity: 2
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          { id: "five-javelins", label: "Five javelins", items: ["5 javelins"] },
          {
            id: "any-simple-melee",
            label: "Any simple melee weapon",
            category: "simpleMeleeWeapon"
          }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "priests-pack", label: "Priest's pack", items: ["Priest's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["Chain mail", "Holy symbol"]
  },
  Ranger: {
    choices: [
      {
        id: "armor",
        label: "Choice 1",
        options: [
          { id: "scale-mail", label: "Scale mail", items: ["Scale mail"] },
          { id: "leather-armor", label: "Leather armor", items: ["Leather armor"] }
        ]
      },
      {
        id: "weapon-1",
        label: "Choice 2",
        options: [
          { id: "two-shortswords", label: "Two shortswords", items: ["2 shortswords"] },
          {
            id: "two-simple-melee",
            label: "Two simple melee weapons",
            category: "simpleMeleeWeapon",
            quantity: 2
          }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["Longbow", "Quiver", "20 arrows"]
  },
  Rogue: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "rapier", label: "Rapier", items: ["Rapier"] },
          { id: "shortsword", label: "Shortsword", items: ["Shortsword"] }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          {
            id: "shortbow",
            label: "Shortbow, quiver, and 20 arrows",
            items: ["Shortbow", "Quiver", "20 arrows"]
          },
          { id: "shortsword", label: "Shortsword", items: ["Shortsword"] }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "burglars-pack", label: "Burglar's pack", items: ["Burglar's pack"] },
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["Leather armor", "2 daggers", "Thieves' tools"]
  },
  "Blood Hunter": {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          {
            id: "any-martial",
            label: "One martial weapon",
            category: "martialWeapon"
          },
          {
            id: "two-simple",
            label: "Two simple weapons",
            category: "simpleWeapon",
            quantity: 2
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          {
            id: "hand-crossbow",
            label: "Hand crossbow and 20 bolts",
            items: ["Hand crossbow", "20 bolts"]
          }
        ]
      },
      {
        id: "armor",
        label: "Choice 3",
        options: [
          { id: "studded-leather", label: "Studded leather armor", items: ["Studded leather armor"] },
          { id: "scale-mail", label: "Scale mail", items: ["Scale mail"] }
        ]
      }
    ],
    fixed: ["Explorer's pack", "Alchemist's supplies"]
  },
  Sorcerer: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "focus",
        label: "Choice 2",
        options: [
          { id: "component-pouch", label: "Component pouch", items: ["Component pouch"] },
          { id: "arcane-focus", label: "Arcane focus", items: ["Arcane focus"] }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["2 daggers"]
  },
  Warlock: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "focus",
        label: "Choice 2",
        options: [
          { id: "component-pouch", label: "Component pouch", items: ["Component pouch"] },
          { id: "arcane-focus", label: "Arcane focus", items: ["Arcane focus"] }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "scholars-pack", label: "Scholar's pack", items: ["Scholar's pack"] },
          { id: "dungeoneers-pack", label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] }
        ]
      }
    ],
    fixed: ["Leather armor", "Dagger", "2 daggers"]
  },
  Wizard: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "quarterstaff", label: "Quarterstaff", items: ["Quarterstaff"] },
          { id: "dagger", label: "Dagger", items: ["Dagger"] }
        ]
      },
      {
        id: "focus",
        label: "Choice 2",
        options: [
          { id: "component-pouch", label: "Component pouch", items: ["Component pouch"] },
          { id: "arcane-focus", label: "Arcane focus", items: ["Arcane focus"] }
        ]
      },
      {
        id: "pack",
        label: "Choice 3",
        options: [
          { id: "scholars-pack", label: "Scholar's pack", items: ["Scholar's pack"] },
          { id: "explorers-pack", label: "Explorer's pack", items: ["Explorer's pack"] }
        ]
      }
    ],
    fixed: ["Spellbook"]
  },
  Psion: {
    choices: [
      {
        id: "weapon-1",
        label: "Choice 1",
        options: [
          { id: "spear", label: "Spear", items: ["Spear"] },
          {
            id: "any-simple",
            label: "Any simple weapon",
            category: "simpleWeapon"
          }
        ]
      },
      {
        id: "weapon-2",
        label: "Choice 2",
        options: [
          {
            id: "light-crossbow",
            label: "Light crossbow and 20 bolts",
            items: ["Light crossbow", "20 bolts"]
          },
          { id: "two-daggers", label: "Two daggers", items: ["2 daggers"] }
        ]
      }
    ],
    fixed: ["Map case", "Dungeoneer's pack", "6 GP"]
  }
};

const backgroundEquipment: Record<CharacterBackground, string[]> = {
  Acolyte: ["Holy symbol", "Prayer book", "5 sticks of incense", "Vestments", "Common clothes", "15 GP"],
  Charlatan: ["Fine clothes", "Disguise kit", "Con prop", "15 GP"],
  Criminal: ["Crowbar", "Dark common clothes with hood", "15 GP"],
  Entertainer: ["Musical instrument", "Admirer's favor", "Costume", "15 GP"],
  "Folk Hero": ["Artisan's tools", "Shovel", "Iron pot", "Common clothes", "10 GP"],
  "Guild Artisan": ["Artisan's tools", "Guild introduction letter", "Traveler's clothes", "15 GP"],
  Hermit: ["Scroll case of notes", "Winter blanket", "Common clothes", "Herbalism kit", "5 GP"],
  Noble: ["Fine clothes", "Signet ring", "Pedigree scroll", "25 GP"],
  Outlander: ["Staff", "Hunting trap", "Hunting trophy", "Traveler's clothes", "10 GP"],
  Sage: ["Bottle of ink", "Quill", "Small knife", "Unanswered scholarly letter", "Common clothes", "10 GP"],
  Sailor: ["Belaying pin", "50 feet silk rope", "Lucky charm", "Common clothes", "10 GP"],
  Soldier: ["Rank insignia", "Trophy from a fallen enemy", "Gaming set", "Common clothes", "10 GP"],
  Urchin: ["Small knife", "City map", "Pet mouse", "Parent token", "Common clothes", "10 GP"]
};

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

function formatSpeciesAbilityBonus(species: CharacterSpecies) {
  const bonuses = speciesAbilityBonuses[species];
  const bonusEntries = abilityDefinitions
    .filter((ability) => bonuses[ability.key])
    .map((ability) => ({
      label: ability.label,
      value: bonuses[ability.key] ?? 0
    }));

  if (bonusEntries.length === abilityDefinitions.length) {
    const sharedBonus = bonusEntries[0]?.value ?? 0;
    const allBonusesMatch = bonusEntries.every(
      (entry) => entry.value === sharedBonus
    );

    if (allBonusesMatch) {
      return `${formatModifier(sharedBonus)} all stats`;
    }
  }

  return bonusEntries
    .map((entry) => `${formatModifier(entry.value)} ${entry.label}`)
    .join(", ");
}

const quickBuildBackgroundByClass: Record<CharacterClass, CharacterBackground> = {
  Artificer: "Guild Artisan",
  Barbarian: "Outlander",
  Bard: "Entertainer",
  Cleric: "Acolyte",
  Druid: "Hermit",
  Fighter: "Soldier",
  Monk: "Hermit",
  Paladin: "Noble",
  Ranger: "Outlander",
  Rogue: "Criminal",
  "Blood Hunter": "Outlander",
  Sorcerer: "Hermit",
  Warlock: "Sage",
  Wizard: "Sage",
  Psion: "Sage"
};

function formatList(items: readonly string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

function selectedEquipmentOption(
  choice: EquipmentChoiceGroup,
  selections: EquipmentSelections
) {
  const selectedOptionId = selections[choice.id]?.optionId;
  return choice.options.find((option) => option.id === selectedOptionId);
}

function equipmentItemsForOption(
  option: EquipmentChoiceOption,
  selection?: EquipmentChoiceSelection
) {
  const customItem = option.category
    ? selection?.customItem ?? equipmentCategoryOptions[option.category][0]
    : null;
  const customItems =
    customItem && option.quantity && option.quantity > 1
      ? [`${option.quantity} ${customItem}s`]
      : customItem
        ? [customItem]
        : [];

  return [...customItems, ...(option.items ?? [])];
}

function normalizeEquipmentName(item: string) {
  return item
    .replace(/^\d+\s+/, "")
    .replace(/^two\s+/i, "")
    .replace(/^five\s+/i, "")
    .replace(/^four\s+/i, "")
    .replace(/^10\s+/, "")
    .replace(/^20\s+/, "")
    .replace(/s$/i, "")
    .trim()
    .toLowerCase();
}

function hasEquipment(gear: readonly string[], name: string) {
  const normalizedName = name.toLowerCase();
  return gear.some((item) => normalizeEquipmentName(item) === normalizedName);
}

function isCurrencyItem(item: string) {
  return /^\d+\s+(?:CP|SP|EP|GP|PP)$/i.test(item.trim());
}

function equipmentLinesForGear(gear: readonly string[]) {
  return gear.filter((item) => {
    const normalizedName = normalizeEquipmentName(item);

    return (
      normalizedName in weaponAttackDetails ||
      ["chain mail", "scale mail", "studded leather armor", "leather armor", "shield"].includes(normalizedName)
    );
  });
}

function inventoryCategoryForItem(item: string) {
  if (
    /\b(incense|rations?)\b/i.test(item)
  ) {
    return "Consumables";
  }

  if (
    /\b(pack|rope|bedroll|blanket|trap|shovel|pot|crowbar|staff|knife|ink|quill)\b/i.test(item)
  ) {
    return "Gear";
  }

  if (/\b(kit|tools?|instrument|gaming set|dice set)\b/i.test(item)) {
    return "Tools";
  }

  if (/\b(clothes|costume|vestments)\b/i.test(item)) {
    return "Clothing";
  }

  if (/\b(letter|map|token|insignia|scroll|trophy|charm|favor|prop|symbol|book)\b/i.test(item)) {
    return "Quest Items";
  }

  return "Miscellaneous";
}

function inventoryLinesForGear(gear: readonly string[]) {
  const inventoryItems = gear.filter(
    (item) => !isCurrencyItem(item) && !equipmentLinesForGear([item]).includes(item)
  );
  const groupedItems = inventoryItems.reduce<Record<string, string[]>>((groups, item) => {
    const category = inventoryCategoryForItem(item);
    groups[category] ??= [];
    groups[category].push(item);
    return groups;
  }, {});
  const categoryOrder = [
    "Gear",
    "Tools",
    "Consumables",
    "Clothing",
    "Quest Items",
    "Miscellaneous"
  ];

  return categoryOrder.flatMap((category) => {
    const items = groupedItems[category] ?? [];
    return items.length > 0 ? [`${category}: ${items.join(", ")}`] : [];
  });
}

function currencyLinesForGear(gear: readonly string[]) {
  const currencyItems = gear.filter(isCurrencyItem);
  return currencyItems.length > 0 ? currencyItems : ["None"];
}

function equipmentGearFor(
  characterClass: CharacterClass,
  selections: EquipmentSelections,
  characterBackground: CharacterBackground
) {
  const rule = classEquipmentRules[characterClass];
  const chosenClassGear = equipmentChoiceGearFor(characterClass, selections);

  return [...chosenClassGear, ...rule.fixed, ...backgroundEquipment[characterBackground]];
}

function equipmentChoiceGearFor(
  characterClass: CharacterClass,
  selections: EquipmentSelections
) {
  const rule = classEquipmentRules[characterClass];
  return rule.choices.flatMap((choice) => {
    const option = selectedEquipmentOption(choice, selections);
    if (!option) {
      return [];
    }

    return equipmentItemsForOption(option, selections[choice.id]);
  });
}

function armorClassForEquipment(
  characterClass: CharacterClass,
  gear: readonly string[],
  abilityScores: CompleteAbilityScores
) {
  const dexModifier = getModifier(abilityScores.dex);
  const shieldBonus = hasEquipment(gear, "shield") ? 2 : 0;

  if (hasEquipment(gear, "chain mail")) {
    return 16 + shieldBonus;
  }

  if (hasEquipment(gear, "scale mail")) {
    return 14 + Math.min(2, dexModifier) + shieldBonus;
  }

  if (hasEquipment(gear, "studded leather armor")) {
    return 12 + dexModifier + shieldBonus;
  }

  if (hasEquipment(gear, "leather armor")) {
    return 11 + dexModifier + shieldBonus;
  }

  if (characterClass === "Monk") {
    return 10 + dexModifier + getModifier(abilityScores.wis);
  }

  if (characterClass === "Barbarian") {
    return 10 + dexModifier + getModifier(abilityScores.con) + shieldBonus;
  }

  return 10 + dexModifier + shieldBonus;
}

const weaponAttackDetails: Record<string, { damage: string; ability: AbilityKey; range?: string }> = {
  battleaxe: { damage: "1d8 slashing", ability: "str" },
  blowgun: { damage: "1 piercing", ability: "dex", range: "range 25/100 ft" },
  club: { damage: "1d4 bludgeoning", ability: "str" },
  dagger: { damage: "1d4 piercing", ability: "dex", range: "thrown 20/60 ft" },
  dart: { damage: "1d4 piercing", ability: "dex", range: "range 20/60 ft" },
  flail: { damage: "1d8 bludgeoning", ability: "str" },
  glaive: { damage: "1d10 slashing", ability: "str" },
  greataxe: { damage: "1d12 slashing", ability: "str" },
  greatclub: { damage: "1d8 bludgeoning", ability: "str" },
  greatsword: { damage: "2d6 slashing", ability: "str" },
  halberd: { damage: "1d10 slashing", ability: "str" },
  handaxe: { damage: "1d6 slashing", ability: "str", range: "thrown 20/60 ft" },
  "hand crossbow": { damage: "1d6 piercing", ability: "dex", range: "range 30/120 ft" },
  "heavy crossbow": { damage: "1d10 piercing", ability: "dex", range: "range 100/400 ft" },
  javelin: { damage: "1d6 piercing", ability: "str", range: "thrown 30/120 ft" },
  lance: { damage: "1d12 piercing", ability: "str" },
  "light crossbow": { damage: "1d8 piercing", ability: "dex", range: "range 80/320 ft" },
  "light hammer": { damage: "1d4 bludgeoning", ability: "str", range: "thrown 20/60 ft" },
  longbow: { damage: "1d8 piercing", ability: "dex", range: "range 150/600 ft" },
  longsword: { damage: "1d8 slashing", ability: "str" },
  mace: { damage: "1d6 bludgeoning", ability: "str" },
  maul: { damage: "2d6 bludgeoning", ability: "str" },
  morningstar: { damage: "1d8 piercing", ability: "str" },
  net: { damage: "No damage", ability: "dex", range: "thrown 5/15 ft" },
  pike: { damage: "1d10 piercing", ability: "str" },
  quarterstaff: { damage: "1d6 bludgeoning", ability: "str" },
  rapier: { damage: "1d8 piercing", ability: "dex" },
  scimitar: { damage: "1d6 slashing", ability: "dex" },
  shortbow: { damage: "1d6 piercing", ability: "dex", range: "range 80/320 ft" },
  shortsword: { damage: "1d6 piercing", ability: "dex" },
  sickle: { damage: "1d4 slashing", ability: "str" },
  sling: { damage: "1d4 bludgeoning", ability: "dex", range: "range 30/120 ft" },
  spear: { damage: "1d6 piercing", ability: "str", range: "thrown 20/60 ft" },
  trident: { damage: "1d6 piercing", ability: "str", range: "thrown 20/60 ft" },
  "war pick": { damage: "1d8 piercing", ability: "str" },
  warhammer: { damage: "1d8 bludgeoning", ability: "str" },
  whip: { damage: "1d4 slashing", ability: "dex" }
};

function weaponDetailsForItem(item: string) {
  return weaponAttackDetails[normalizeEquipmentName(item)];
}

function weaponSubtextForItem(item: string) {
  const details = weaponDetailsForItem(item);

  if (!details) {
    return "";
  }

  return details.range ? `${details.damage}, ${details.range}` : details.damage;
}

function attackLinesForEquipment(
  gear: readonly string[],
  abilityScores: CompleteAbilityScores
) {
  const attacks = gear.flatMap((item) => {
    const normalizedName = normalizeEquipmentName(item);
    const details = weaponAttackDetails[normalizedName];

    if (!details) {
      return [];
    }

    const modifier = getModifier(abilityScores[details.ability]);
    const attackBonus = proficiencyBonus + modifier;
    const modifierText = modifier === 0 ? "" : formatModifier(modifier);
    const rangeText = details.range ? `, ${details.range}` : "";
    const displayName = item.replace(/^\d+\s+/, "").replace(/^2\s+/, "");

    return `${displayName}: ${formatModifier(attackBonus)} to hit, ${details.damage}${modifierText}${rangeText}`;
  });

  return Array.from(new Set(attacks));
}

function spellAttackLinesFor(
  characterClass: CharacterClass,
  spellAttackBonus: number,
  spellSaveDc: number,
  selectedSpells: readonly string[]
) {
  if (
    !selectedSpells.includes("Fire Bolt") &&
    !selectedSpells.includes("Eldritch Blast") &&
    !selectedSpells.includes("Mind Sliver") &&
    !selectedSpells.includes("Telekinetic Fling")
  ) {
    return [];
  }

  if (characterClass === "Warlock" && selectedSpells.includes("Eldritch Blast")) {
    return [`Eldritch Blast: ${formatModifier(spellAttackBonus)} to hit, 2 beams, 1d10 force each`];
  }

  if (selectedSpells.includes("Telekinetic Fling")) {
    return [`Telekinetic Fling: ${formatModifier(spellAttackBonus)} to hit, psychic force cantrip`];
  }

  if (selectedSpells.includes("Mind Sliver")) {
    return [`Mind Sliver: DC ${spellSaveDc} Intelligence save, psychic damage`];
  }

  if (selectedSpells.includes("Fire Bolt")) {
    return [`Fire Bolt: ${formatModifier(spellAttackBonus)} to hit, 2d10 fire`];
  }

  return [`Spell Save: DC ${spellSaveDc}`];
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

function deriveSpellSlotsForSheet(
  characterClass: string,
  level: number
): Record<string, SpellSlotState> | undefined {
  if (fullCasterClasses.has(characterClass)) {
    return fullCasterSlotTable[level];
  }

  if (characterClass === "Warlock") {
    return pactMagicSlotTable[level];
  }

  return undefined;
}

function ordinalSpellLevel(level: string) {
  return level === "1"
    ? "1st"
    : level === "2"
      ? "2nd"
      : level === "3"
        ? "3rd"
        : `${level}th`;
}

function spellSlotLinesForSheet(slots: Record<string, SpellSlotState> | undefined) {
  return slots
    ? Object.entries(slots).map(([level, slot]) => {
        const remaining = Math.max(0, slot.max - slot.used);
        return `${ordinalSpellLevel(level)}-level slots: ${slot.max} total, ${slot.used} used, ${remaining} remaining`;
      })
    : [];
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

function CampaignPreparationLoader() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [exitingMessage, setExitingMessage] = useState("");
  const currentMessage =
    campaignPreparationMessages[messageIndex] ??
    defaultCampaignPreparationMessage;

  useEffect(() => {
    let timeoutId: number | undefined;

    const intervalId = window.setInterval(() => {
      setMessageIndex((currentIndex) => {
        const nextIndex =
          (currentIndex + 1) % campaignPreparationMessages.length;

        setExitingMessage(
          campaignPreparationMessages[currentIndex] ??
            defaultCampaignPreparationMessage
        );

        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        timeoutId = window.setTimeout(() => {
          setExitingMessage("");
        }, campaignPreparationTransitionMs);

        return nextIndex;
      });
    }, campaignPreparationMessageIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <PreparationLoaderLayout
      currentMessage={currentMessage}
      exitingMessage={exitingMessage}
      note="this'll take about a minute and a half, sit tight ;)"
    />
  );
}

function PortraitPreparationLoader() {
  return <PreparationLoaderLayout currentMessage="Generating portrait" />;
}

function NewAdventureEntryLoadingScreen() {
  return (
    <main className="new-adventure-loading-screen" aria-label="Loading adventure">
      <section className="new-adventure-loading-center" aria-live="polite">
        <PreparationLoaderLayout currentMessage="Loading Adventure" />
      </section>
    </main>
  );
}

function NewAdventureEntryTransitionOverlay({
  entryState,
  onTransitionFinished
}: {
  entryState: NewAdventureEntryState;
  onTransitionFinished: () => void;
}) {
  useEffect(() => {
    if (entryState !== "transitioning") {
      return;
    }

    const timeoutId = window.setTimeout(onTransitionFinished, 1_400);

    return () => window.clearTimeout(timeoutId);
  }, [entryState, onTransitionFinished]);

  return (
    <video
      autoPlay
      className="new-adventure-entry-video"
      muted
      onEnded={onTransitionFinished}
      onError={onTransitionFinished}
      playsInline
      preload="auto"
      src={newAdventureEntryVideoUrl}
    />
  );
}

function PreparationLoaderLayout({
  currentMessage,
  exitingMessage = "",
  note
}: PreparationLoaderLayoutProps) {
  return (
    <div className="campaign-prep-loader">
      <div className="campaign-prep-loader-window">
        {exitingMessage ? (
          <p
            key={`exiting-${exitingMessage}`}
            className="rune-loader campaign-prep-loader-message exiting"
            aria-hidden="true"
          >
            {exitingMessage}
            <span className="rune-loader-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        ) : null}
        <p
          key={currentMessage}
          className="rune-loader campaign-prep-loader-message entering"
        >
          {currentMessage}
          <span className="rune-loader-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>
      {note ? <p className="campaign-prep-loader-note">{note}</p> : null}
    </div>
  );
}

export function NewAdventureForm({
  initialInviteToken = "",
  userEmail,
  userId
}: NewAdventureFormProps) {
  const [entryState, setEntryState] = useState<NewAdventureEntryState>(
    process.env.NODE_ENV === "test" ? "ready" : "preloading"
  );
  const normalizedInitialInviteToken = initialInviteToken.trim();
  const [stepIndex, setStepIndex] = useState(
    normalizedInitialInviteToken ? 2 : 0
  );
  const [characterStepIndex, setCharacterStepIndex] = useState(0);
  const [mode, setMode] = useState<CampaignMode>(
    normalizedInitialInviteToken ? "multiplayer" : "single_player"
  );
  const [multiplayerIntent, setMultiplayerIntent] =
    useState<MultiplayerIntent>(
      normalizedInitialInviteToken ? "join" : "create"
    );
  const [inviteToken] = useState(normalizedInitialInviteToken);
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
  const [statRollValues, setStatRollValues] = useState<Array<number | null>>([
    ...emptyStatRollValues
  ]);
  const [statRollAssignments, setStatRollAssignments] = useState<
    Record<AbilityKey, number | null>
  >({
    ...emptyStatRollAssignments
  });
  const [activeStatRoll, setActiveStatRoll] = useState<ActiveStatRoll | null>(null);
  const [rerolledStatRollIndexes, setRerolledStatRollIndexes] = useState<
    Set<number>
  >(new Set());
  const [statGenerationMode, setStatGenerationMode] =
    useState<StatGenerationMode>("roll");
  const [subclass, setSubclass] = useState("Champion");
  const [classFeatureChoice, setClassFeatureChoice] = useState("Defense");
  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>(["Athletics", "Perception"]);
  const [selectedTool, setSelectedTool] = useState<(typeof toolOptions)[number]>("Dice set");
  const [selectedLanguage, setSelectedLanguage] = useState<(typeof languageOptions)[number]>("Elvish");
  const [equipmentSelections, setEquipmentSelections] = useState<EquipmentSelections>({});
  const [equipmentChoiceStepIndex, setEquipmentChoiceStepIndex] = useState(0);
  const [activeEquipmentModal, setActiveEquipmentModal] =
    useState<ActiveEquipmentModal>(null);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const [activeSpellDetail, setActiveSpellDetail] = useState<string | null>(null);
  const [dlcSpellVisibility, setDlcSpellVisibility] = useState<DlcSpellVisibility>({});
  const [alignment, setAlignment] = useState<Alignment>("Neutral Good");
  const [gender, setGender] = useState<Gender>("Non-binary");
  const [backstory, setBackstory] = useState("");
  const [eldermereStart, setEldermereStart] =
    useState<EldermereCampaignStart | null>(null);
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isGeneratingBackstory, setIsGeneratingBackstory] = useState(false);
  const [isContinuingWithBackstory, setIsContinuingWithBackstory] =
    useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingArt, setIsCreatingArt] = useState(false);
  const [createdCampaign, setCreatedCampaign] =
    useState<CampaignSummary | null>(null);
  const [portraitPreviewDataUrl, setPortraitPreviewDataUrl] = useState("");
  const [characterArtGuidelines, setCharacterArtGuidelines] = useState("");
  const [characterArtStyle, setCharacterArtStyle] =
    useState<CharacterArtStyle>("ink_and_watercolor");
  const [characterImageModel, setCharacterImageModel] =
    useState<CharacterImageModel>("openai");
  const [uploadedPortraitFileName, setUploadedPortraitFileName] = useState("");
  const [flowTransition, setFlowTransition] =
    useState<FlowTransitionState>("idle");
  const stepStartedAtRef = useRef(Date.now());
  const trackedOnboardingRef = useRef(false);
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
  const currentCharacterStep = characterCreationSteps[characterStepIndex];
  const isLastCharacterStep =
    characterStepIndex === characterCreationSteps.length - 1;
  const modeLabel = mode === "single_player" ? "Singleplayer" : "Multiplayer";
  const normalizedGameCode = normalizeGameCodeInput(gameCode);
  const isInviteJoinFlow = isJoinFlow && Boolean(inviteToken);
  const hasRequiredIdentity =
    Boolean(characterName.trim()) && (!isJoinFlow || Boolean(playerName.trim()));
  const selectedGenre = campaignGenres.find((genre) => genre.id === campaignGenre) ?? campaignGenres[0];
  const campaignDisplayName = isCustomGenre
    ? customWorldName.trim() || "Custom World"
    : `${selectedGenre.label} Adventure`;
  const selectedClass = classOptions.find((option) => option.id === characterClass) ?? classOptions[4];
  const equipmentChoices = classEquipmentRules[characterClass].choices;
  const isEquipmentCharacterStep = isCharacterStep && currentCharacterStep === "Equipment";
  const isEquipmentSummaryStep = equipmentChoiceStepIndex >= equipmentChoices.length;
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
  const hasStartedStatRolls = statRollValues.some((value) => value !== null);
  const areAllStatRollValuesFilled = statRollValues.every(
    (value) => value !== null
  );
  const canRollAllStats = !activeStatRoll && !hasStartedStatRolls;
  const assignedStatRollIndexes = useMemo(
    () =>
      new Set(
        Object.values(statRollAssignments).filter(
          (assignment): assignment is number => assignment !== null
        )
      ),
    [statRollAssignments]
  );
  const pointBuyPointsRemaining =
    pointBuyBudget - getPointBuyPointsSpent(abilityScores);
  const backgroundSkillList = useMemo(
    () => backgroundSkills[characterBackground] ?? [],
    [characterBackground]
  );
  const proficientSkills = useMemo(
    () => Array.from(new Set([...selectedSkills, ...backgroundSkillList])),
    [backgroundSkillList, selectedSkills]
  );
  const constitutionModifier = getModifier(resolvedAbilityScores.con);
  const maxHp = getAverageHp(selectedClass.hitDie, constitutionModifier);
  const passivePerception = 10 + getModifier(resolvedAbilityScores.wis) + (proficientSkills.includes("Perception") ? proficiencyBonus : 0);
  const spellcastingAbility =
    characterClass === "Wizard" ||
    characterClass === "Artificer" ||
    characterClass === "Psion"
      ? "int"
      : characterClass === "Cleric" ||
          characterClass === "Druid" ||
          characterClass === "Ranger"
        ? "wis"
        : "cha";
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
  const activeSpellLevel = activeSpellDetail
    ? spellLevelFor(selectedClass.spellGroups, activeSpellDetail)
    : null;
  const activeSpellRuleProfile = activeSpellDetail
    ? spellDetailFor(activeSpellDetail, activeSpellLevel)
    : null;
  const finishEntryTransition = useCallback(() => {
    setEntryState((currentState) =>
      currentState === "ready" ? currentState : "ready"
    );
  }, []);

  useEffect(() => {
    if (entryState !== "preloading") {
      return;
    }

    let isCancelled = false;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    void preloadAdventureImages(newAdventureStartupImageUrls, 4).then(() => {
      if (isCancelled) {
        return;
      }

      setEntryState(prefersReducedMotion ? "ready" : "transitioning");
    });

    return () => {
      isCancelled = true;
    };
  }, [entryState]);

  useEffect(() => {
    if (entryState !== "ready") {
      return;
    }

    if (stepIndex <= campaignDetailsStepIndex) {
      scheduleAdventureImagePreload(newAdventureClassImageUrls, 2);
    }

    if (isCharacterStep && currentCharacterStep === "Class") {
      scheduleAdventureImagePreload(newAdventureSpeciesImageUrls, 2);
    }

    if (
      isCharacterStep &&
      (currentCharacterStep === "Background" ||
        currentCharacterStep === "Skills" ||
        currentCharacterStep === "Equipment")
    ) {
      scheduleAdventureImagePreload(newAdventureCustomOptionImageUrls, 3);
    }
  }, [
    campaignDetailsStepIndex,
    currentCharacterStep,
    entryState,
    isCharacterStep,
    stepIndex
  ]);
  const mechanicsSeed = useMemo<MechanicsSeed>(() => {
    const spellSlots = deriveSpellSlotsForSheet(selectedClass.id, characterLevel);

    return {
      characterClass: selectedClass.id,
      level: characterLevel,
      maxHp,
      currentHp: maxHp,
      ...(spellSlots ? { spellSlots } : {})
    };
  }, [maxHp, selectedClass.id]);
  const hasValidSpellSelection =
    selectedSpells.length > 0 &&
    selectedSpellCounts.Cantrip <= spellSelectionLimits.cantrips &&
    selectedSpellCounts.leveledSpells <= spellSelectionLimits.leveledSpells;
  const chosenEquipmentGear = useMemo(
    () => equipmentChoiceGearFor(characterClass, equipmentSelections),
    [characterClass, equipmentSelections]
  );
  const selectedEquipmentProfile = useMemo<EquipmentProfile>(() => {
    const gear = equipmentGearFor(
      characterClass,
      equipmentSelections,
      characterBackground
    );
    const weaponAttacks = attackLinesForEquipment(gear, resolvedAbilityScores);
    const spellAttacks = spellAttackLinesFor(
      characterClass,
      spellAttackBonus,
      spellSaveDc,
      selectedSpells
    );

    return {
      armorClass: armorClassForEquipment(characterClass, gear, resolvedAbilityScores),
      attacks: [...spellAttacks, ...weaponAttacks],
      currency: currencyLinesForGear(gear),
      gear: equipmentLinesForGear(gear),
      inventory: inventoryLinesForGear(gear)
    };
  }, [
    characterBackground,
    characterClass,
    equipmentSelections,
    resolvedAbilityScores,
    selectedSpells,
    spellAttackBonus,
    spellSaveDc
  ]);
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
          "Spell Slots",
          ...spellSlotLinesForSheet(mechanicsSeed.spellSlots),
          ...selectedSpellLines
        ]
      : ["None"];
    const name = characterName.trim() || "Unnamed adventurer";
    const trimmedBackstory = backstory.trim();
    const backstoryLines = trimmedBackstory
      ? [
          "Backstory",
          trimmedBackstory,
          "Backstory Expansion: Preserve this backstory as written unless the player changes it."
        ]
      : [
          "Backstory",
          "AI Taverns should generate a fitting backstory for this character."
        ];

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
      `Gender: ${gender}`,
      "",
      ...backstoryLines,
      "",
      "Core Stats",
      `Armor Class: ${selectedEquipmentProfile.armorClass}`,
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
      `Tools: ${formatList([
        ...("tools" in selectedClass.proficiencies
          ? [selectedClass.proficiencies.tools]
          : []),
        selectedTool
      ])}`,
      `Languages: Common, ${selectedLanguage}`,
      "",
      "Attacks",
      ...(selectedEquipmentProfile.attacks.length > 0
        ? selectedEquipmentProfile.attacks
        : ["None"]),
      "",
      "Features and Traits",
      `${selectedClass.subclassLabel}: ${subclass}`,
      `${selectedClass.featureLabel}: ${classFeatureChoice}`,
      `Background Skills: ${formatList(backgroundSkillList)}`,
      `${characterSpecies}: standard ${characterSpecies.toLowerCase()} traits, senses, and movement`,
      "",
      "Equipment",
      ...selectedEquipmentProfile.gear,
      "",
      "Inventory",
      ...selectedEquipmentProfile.inventory,
      "",
      "Currency",
      ...selectedEquipmentProfile.currency,
      "",
      "Spells",
      ...spells,
      "",
      "DM Brief",
      `${name} is a Level ${characterLevel} ${alignment} ${gender.toLowerCase()} ${characterSpecies} ${selectedClass.id} (${subclass}) with the ${characterBackground} background. Use their proficient skills (${formatList(proficientSkills)}) and key class choices to frame checks, spotlight moments, opening-scene hooks, and ${trimmedBackstory ? "the player's backstory" : "a generated backstory"}.`
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  }, [
    abilityScores,
    alignment,
    backstory,
    backgroundSkillList,
    characterBackground,
    characterBuildMode,
    characterName,
    characterSpecies,
    classFeatureChoice,
    gender,
    hasSpells,
    maxHp,
    mechanicsSeed,
    isJoinFlow,
    mode,
    passivePerception,
    proficientSkills,
    resolvedAbilityScores,
    selectedClass,
    selectedEquipmentProfile,
    selectedLanguage,
    selectedSpells,
    selectedTool,
    playerName,
    spellAttackBonus,
    spellSaveDc,
    spellcastingAbility,
    subclass
  ]);
  const stepTitle = useMemo(() => {
    if (stepIndex === reviewStepIndex && !isJoinFlow) {
      return portraitPreviewDataUrl
        ? "Your portrait is ready"
        : "Create your character art";
    }

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
        return isInviteJoinFlow ? "Review the lobby invite" : "Enter the game code";
      }

      return "Choose the campaign world";
    }

    if (isCustomWorldStep) {
      return "Describe your custom world";
    }

    if (isCharacterStep) {
      if (characterStepIndex === 0) {
        return "Choose your character build";
      }

      if (currentCharacterStep === "Stats") {
        return "Roll your Level 5 stats";
      }

      if (isEquipmentCharacterStep) {
        if (isEquipmentSummaryStep) {
          return "Review your starting gear";
        }

        return "Choose equipment";
      }

      return `Choose your ${characterCreationSteps[characterStepIndex].toLowerCase()}`;
    }

    return "Ready the first page";
  }, [
    characterCreationSteps,
    characterStepIndex,
    currentCharacterStep,
    isCampaignDetailsStep,
    isCharacterStep,
    isCustomWorldStep,
    isJoinFlow,
    isEquipmentCharacterStep,
    isEquipmentSummaryStep,
    isInviteJoinFlow,
    mode,
    reviewStepIndex,
    stepIndex,
    portraitPreviewDataUrl
  ]);

  const analyticsBaseProperties = useCallback(() => {
    return {
      guestId: ownerClientId || analyticsGuestId(),
      userId,
      campaignMode: mode,
      campaignGenre: selectedGenre.label,
      campaignGenreKind: isCustomGenre ? "custom" : "preset",
      campaignGenrePresetId: isCustomGenre ? undefined : selectedGenre.id,
      characterClass,
      characterSpecies,
      characterBuildMode,
      spellCount: selectedSpells.length,
      skillCount: selectedSkills.length,
      hasBackstory: Boolean(backstory.trim()),
      hasCustomWorld: isCustomGenre,
      hasEldermereStart: Boolean(eldermereStart),
      equipmentCompleted: isEquipmentSummaryStep || chosenEquipmentGear.length > 0
    } as const;
  }, [
    backstory,
    characterBuildMode,
    characterClass,
    characterSpecies,
    chosenEquipmentGear.length,
    eldermereStart,
    isCustomGenre,
    isEquipmentSummaryStep,
    mode,
    ownerClientId,
    selectedGenre.id,
    selectedGenre.label,
    selectedSkills.length,
    selectedSpells.length,
    userId
  ]);

  function trackStepCompleted() {
    trackAnalytics({
      name: "Character Step Completed",
      properties: {
        ...analyticsBaseProperties(),
        step: isCharacterStep ? currentCharacterStep : stepTitle,
        stepIndex: isCharacterStep ? characterStepIndex : stepIndex,
        timeSpentSeconds: Math.max(
          0,
          Math.round((Date.now() - stepStartedAtRef.current) / 1000)
        )
      }
    });
    stepStartedAtRef.current = Date.now();
  }

  useEffect(() => {
    setCharacterSheet(characterSheetPreview);
  }, [characterSheetPreview]);

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
    identifyAnalyticsUser({
      userId,
      email: userEmail,
      guestId: ownerClientId || undefined
    });

    if (!trackedOnboardingRef.current) {
      trackedOnboardingRef.current = true;
      trackAnalytics({
        name: "Onboarding Started",
        properties: {
          ...analyticsBaseProperties(),
          inviteUsed: Boolean(inviteToken),
          joinSource: inviteToken ? "invite" : undefined
        }
      });
    }
  }, [analyticsBaseProperties, inviteToken, ownerClientId, userEmail, userId]);

  useEffect(() => {
    if (
      !createdCampaign ||
      !isCreatingArt ||
      uploadedPortraitFileName ||
      portraitPreviewDataUrl
    ) {
      return;
    }

    const portraitCampaign = createdCampaign;
    let shouldIgnore = false;
    let socket: WebSocket | null = null;

    async function refreshPortraitStatus() {
      try {
        const response = await fetch(
          `/api/room?roomId=${encodeURIComponent(
            portraitCampaign.id
          )}&sessionId=${encodeURIComponent(portraitCampaign.sessionId)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          return;
        }

        const room = (await response.json()) as PortraitRoomSnapshot;
        const portraitPlayer = room.players?.find(
          (player) => player.portraitStatus || player.portraitUrl
        );

        if (shouldIgnore || !portraitPlayer) {
          return;
        }

        if (portraitPlayer.portraitUrl) {
          setPortraitPreviewDataUrl(portraitPlayer.portraitUrl);
          setIsCreatingArt(false);
          setError("");
          return;
        }

        if (portraitPlayer.portraitStatus === "failed") {
          setError("Character art could not be created.");
          setIsCreatingArt(false);
        }
      } catch {
        // The WebSocket remains the source of truth for the next pushed update.
      }
    }

    function connectSocket() {
      try {
        socket = new WebSocket(roomSocketUrl(portraitCampaign));
      } catch {
        return;
      }

      socket.addEventListener("open", () => {
        void refreshPortraitStatus();
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        let parsed: PortraitRoomRealtimeEvent;

        try {
          parsed = JSON.parse(event.data) as PortraitRoomRealtimeEvent;
        } catch {
          return;
        }

        if (parsed.roomId !== portraitCampaign.id) {
          return;
        }

        if (parsed.type === "room_snapshot" && "snapshot" in parsed) {
          const portraitPlayer = parsed.snapshot.players?.find(
            (player: PortraitRoomPlayer) =>
              player.portraitStatus || player.portraitUrl
          );

          if (portraitPlayer?.portraitUrl) {
            setPortraitPreviewDataUrl(portraitPlayer.portraitUrl);
            setIsCreatingArt(false);
            setError("");
          } else if (portraitPlayer?.portraitStatus === "failed") {
            setError("Character art could not be created.");
            setIsCreatingArt(false);
          }
          return;
        }

        if (parsed.type === "room_updated") {
          void refreshPortraitStatus();
        }
      });
    }

    connectSocket();

    return () => {
      shouldIgnore = true;
      socket?.close();
    };
  }, [
    createdCampaign,
    isCreatingArt,
    portraitPreviewDataUrl,
    uploadedPortraitFileName
  ]);

  useEffect(() => {
    if (!isInviteJoinFlow) {
      setJoinPreview(null);
    }
  }, [isInviteJoinFlow, normalizedGameCode]);

  useEffect(() => {
    if (!isInviteJoinFlow) {
      return;
    }

    let isCurrent = true;

    async function loadInvitePreview() {
      try {
        const data = await previewLobbyInvite(inviteToken);

        if (!isCurrent) {
          return;
        }

        setJoinPreview({
          ...data,
          source: "invite",
          hasBegun: false
        });
        setError("");
      } catch (caught) {
        if (!isCurrent) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "That invite link could not be checked."
        );
      }
    }

    void loadInvitePreview();

    return () => {
      isCurrent = false;
    };
  }, [inviteToken, isInviteJoinFlow]);

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

  function chooseEquipmentOption(
    choice: EquipmentChoiceGroup,
    option: EquipmentChoiceOption
  ) {
    if (option.category) {
      setActiveEquipmentModal({
        groupId: choice.id,
        optionId: option.id,
        title: option.label,
        category: option.category
      });
      return;
    }

    setEquipmentSelections((currentSelections) => ({
      ...currentSelections,
      [choice.id]: {
        optionId: option.id
      }
    }));
  }

  function chooseEquipmentModalItem(item: string) {
    if (!activeEquipmentModal) {
      return;
    }

    setEquipmentSelections((currentSelections) => ({
      ...currentSelections,
      [activeEquipmentModal.groupId]: {
        optionId: activeEquipmentModal.optionId,
        customItem: item
      }
    }));
    setActiveEquipmentModal(null);
  }

  function handleClassChange(nextClass: CharacterClass) {
    const nextClassData = classOptions.find((option) => option.id === nextClass) ?? classOptions[4];
    const nextResolvedAbilityScores = {
      str: abilityScores.str ?? defaultAbilityScoresByClass[nextClass].str,
      dex: abilityScores.dex ?? defaultAbilityScoresByClass[nextClass].dex,
      con: abilityScores.con ?? defaultAbilityScoresByClass[nextClass].con,
      int: abilityScores.int ?? defaultAbilityScoresByClass[nextClass].int,
      wis: abilityScores.wis ?? defaultAbilityScoresByClass[nextClass].wis,
      cha: abilityScores.cha ?? defaultAbilityScoresByClass[nextClass].cha
    };
    const nextSpellLimits = spellSelectionLimitsFor(nextClass, {
      ...nextResolvedAbilityScores
    });
    setCharacterClass(nextClass);
    setSubclass(nextClassData.subclassOptions[0]);
    setClassFeatureChoice(nextClassData.featureOptions[0]);
    setSelectedSkills([...nextClassData.defaultSkills] as SkillName[]);
    setEquipmentSelections({});
    setEquipmentChoiceStepIndex(0);
    setActiveEquipmentModal(null);
    setDlcSpellVisibility({});
    setSelectedSpells(defaultSpellSelectionFor(nextClassData.spellGroups, nextSpellLimits));

    if (characterBuildMode === "quick") {
      setCharacterBackground(quickBuildBackgroundByClass[nextClass]);
    }
  }

  function applyQuickBuildDefaults() {
    setCharacterBackground(quickBuildBackgroundByClass[characterClass]);
    setStatGenerationMode("roll");
    setAbilityScores({ ...emptyAbilityScores });
    setStatRollValues([...emptyStatRollValues]);
    setStatRollAssignments({ ...emptyStatRollAssignments });
    setRerolledStatRollIndexes(new Set());
    setSubclass(selectedClass.subclassOptions[0]);
    setClassFeatureChoice(selectedClass.featureOptions[0]);
    setSelectedSkills([...selectedClass.defaultSkills] as SkillName[]);
    setEquipmentSelections({});
    setEquipmentChoiceStepIndex(0);
    setActiveEquipmentModal(null);
    setSelectedTool("Dice set");
    setSelectedLanguage("Elvish");
    setDlcSpellVisibility({});
    setSelectedSpells(defaultSpellSelectionFor(selectedClass.spellGroups, spellSelectionLimits));
  }

  function applyCustomBuildDefaults() {
    setStatGenerationMode("roll");
    setAbilityScores({ ...emptyAbilityScores });
    setStatRollValues([...emptyStatRollValues]);
    setStatRollAssignments({ ...emptyStatRollAssignments });
    setRerolledStatRollIndexes(new Set());
    setEquipmentSelections({});
    setEquipmentChoiceStepIndex(0);
    setActiveEquipmentModal(null);
  }

  function rollAllStats() {
    if (!canRollAllStats) {
      return;
    }

    setStatGenerationMode("roll");
    setRerolledStatRollIndexes(new Set());
    const statRolls = abilityDefinitions.map(() => rollFourD6DropLowest());
    const values = statRolls.map((statRoll) => statRoll.total);
    const animationRolls = statRolls.flatMap((statRoll) => statRoll.rolls).slice(0, 8);
    const total = statRolls.reduce((sum, statRoll) => sum + statRoll.total, 0);

    setActiveStatRoll({
      id: `all-${Date.now().toString(36)}`,
      expression: "Roll six assignable stats",
      rolls: animationRolls,
      total,
      values
    });
  }

  function rollStatPoolValue(index: number) {
    if (activeStatRoll) {
      return;
    }

    const isReroll = statRollValues[index] !== null;

    if (
      isReroll &&
      (!areAllStatRollValuesFilled || rerolledStatRollIndexes.has(index))
    ) {
      return;
    }

    if (isReroll) {
      setRerolledStatRollIndexes((currentIndexes) => {
        const nextIndexes = new Set(currentIndexes);
        nextIndexes.add(index);
        return nextIndexes;
      });
    }

    setStatGenerationMode("roll");
    const { rolls, total } = rollFourD6DropLowest();

    setActiveStatRoll({
      id: `pool-${index}-${Date.now().toString(36)}`,
      expression: `Roll ${index + 1}: 4d6 drop lowest`,
      rolls,
      total,
      values: [total],
      targetRollIndex: index
    });
  }

  function completeStatRoll() {
    if (!activeStatRoll) {
      return;
    }

    if (activeStatRoll.targetRollIndex !== undefined) {
      const targetRollIndex = activeStatRoll.targetRollIndex;

      setStatRollValues((currentValues) => {
        const nextValues =
          currentValues.length === abilityDefinitions.length
            ? [...currentValues]
            : [...emptyStatRollValues];
        nextValues[targetRollIndex] = activeStatRoll.values[0] ?? null;
        return nextValues;
      });
      setStatRollAssignments((currentAssignments) => {
        const nextAssignments = { ...currentAssignments };

        abilityDefinitions.forEach(({ key }) => {
          if (nextAssignments[key] === targetRollIndex) {
            nextAssignments[key] = null;
          }
        });

        return nextAssignments;
      });
      setAbilityScores((currentScores) => {
        const nextScores = { ...currentScores };

        abilityDefinitions.forEach(({ key }) => {
          if (statRollAssignments[key] === targetRollIndex) {
            nextScores[key] = null;
          }
        });

        return nextScores;
      });
    } else {
      setStatRollValues(activeStatRoll.values);
      setStatRollAssignments({ ...emptyStatRollAssignments });
      setAbilityScores({ ...emptyAbilityScores });
    }

    setActiveStatRoll(null);
  }

  function assignStatRoll(key: AbilityKey, value: string) {
    const nextAssignment = value === "" ? null : Number(value);
    const nextScore =
      nextAssignment === null ? null : statRollValues[nextAssignment] ?? null;

    setStatRollAssignments((currentAssignments) => ({
      ...currentAssignments,
      [key]: nextAssignment
    }));
    setAbilityScores((currentScores) => ({
      ...currentScores,
      [key]: nextScore
    }));
  }

  function switchToPointBuy() {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("point_buy");
    setAbilityScores({ ...pointBuyDefaultScores });
    setStatRollValues([...emptyStatRollValues]);
    setStatRollAssignments({ ...emptyStatRollAssignments });
    setRerolledStatRollIndexes(new Set());
  }

  function switchToRollScores() {
    if (activeStatRoll) {
      return;
    }

    setStatGenerationMode("roll");
    setAbilityScores({ ...emptyAbilityScores });
    setStatRollValues([...emptyStatRollValues]);
    setStatRollAssignments({ ...emptyStatRollAssignments });
    setRerolledStatRollIndexes(new Set());
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
        return isInviteJoinFlow || normalizedGameCode.length === 6;
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

      if (currentCharacterStep === "Stats") {
        return areAllStatsRolled;
      }

      if (currentCharacterStep === "Skills") {
        return selectedSkills.length > 0;
      }

      if (isEquipmentCharacterStep && !isEquipmentSummaryStep) {
        const activeChoice = equipmentChoices[equipmentChoiceStepIndex];
        return Boolean(activeChoice && equipmentSelections[activeChoice.id]);
      }

      if (currentCharacterStep === "Spells" && hasSpells) {
        return hasValidSpellSelection;
      }

      return (
        currentCharacterStep !== "Identity" ||
        !requiresCharacterName ||
        hasRequiredIdentity
      );
    }

    return true;
  }

  async function previewJoinCode() {
    const data = isInviteJoinFlow
      ? await previewLobbyInvite(inviteToken)
      : await previewCampaignJoin({
          gameCode: normalizedGameCode
        });

    setJoinPreview({
      ...data,
      source: isInviteJoinFlow ? "invite" : "code",
      hasBegun: "hasBegun" in data ? data.hasBegun : false
    });
    trackAnalytics({
      name: "Campaign Invite Previewed",
      properties: {
        ...analyticsBaseProperties(),
        joinSource: isInviteJoinFlow ? "invite" : "code",
        hasBegun: "hasBegun" in data ? data.hasBegun : false,
        availableSlots: data.availableSlots
      }
    });
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
    if (isFlowTransitioning || isGeneratingBackstory) {
      return;
    }

    setError("");

    if (!canAdvance()) {
      setError(
        isCustomWorldStep
          ? "Name the world and describe it before continuing."
          : isCampaignDetailsStep
          ? isJoinFlow
            ? isInviteJoinFlow
              ? "This invite link could not be checked yet."
              : "Enter the six-character game code before continuing."
            : "Choose a campaign world before continuing."
            : requiresCharacterName && currentCharacterStep === "Identity"
              ? isJoinFlow
                ? "Add your player and character names before continuing."
                : "Add your character name before continuing."
            : currentCharacterStep === "Stats"
              ? "Roll six scores and assign one to each stat before continuing."
            : isEquipmentCharacterStep && !isEquipmentSummaryStep
              ? "Choose equipment before continuing."
            : currentCharacterStep === "Spells"
              ? "Choose at least one spell before continuing."
              : "Choose at least one option before continuing."
      );
      return;
    }

    trackStepCompleted();

    if (isJoinFlow && isCampaignDetailsStep) {
      try {
        await previewJoinCode();
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : isInviteJoinFlow
              ? "That invite link could not be checked."
              : "That game code could not be checked."
        );
        return;
      }
    }

    if (isEquipmentCharacterStep && !isEquipmentSummaryStep) {
      transitionFlow(() =>
        setEquipmentChoiceStepIndex((currentStepIndex) =>
          Math.min(currentStepIndex + 1, equipmentChoices.length)
        )
      );
      return;
    }

    if (
      isCharacterStep &&
      currentCharacterStep === "Identity" &&
      !isJoinFlow &&
      !backstory.trim()
    ) {
      setIsContinuingWithBackstory(true);
      const wroteBackstory = await writeBackstory("generate");
      setIsContinuingWithBackstory(false);

      if (!wroteBackstory) {
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
    if (isFlowTransitioning || createdCampaign) {
      return;
    }

    setError("");
    stepStartedAtRef.current = Date.now();

    if (isEquipmentCharacterStep && equipmentChoiceStepIndex > 0) {
      transitionFlow(() =>
        setEquipmentChoiceStepIndex((currentStepIndex) =>
          Math.max(currentStepIndex - 1, 0)
        )
      );
      return;
    }

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

  async function createCampaignFromSetup() {
    if (createdCampaign) {
      return createdCampaign;
    }

    const createStartedAt = Date.now();
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
      characterSheet,
      mechanicsSeed,
      ...(eldermereStart && !isCustomGenre && selectedGenre.id === "eldermere"
        ? { eldermereStart }
        : {})
    });

    trackAnalytics({
      name: "Character Created",
      properties: {
        ...analyticsBaseProperties(),
        campaignId: campaign.id,
        campaignMode: campaign.mode,
        minutesSinceCampaignCreated: Math.floor(
          (Date.now() - createStartedAt) / 60_000
        ),
        campaignAgeHours: 0,
        hasPortrait: Boolean(campaign.portraitUrl),
        equipmentCompleted: true
      },
      milestones: ["campaign_created_or_joined", "character_completed"]
    });
    trackAnalytics({
      name: "Campaign Created",
      properties: {
        ...analyticsBaseProperties(),
        campaignId: campaign.id,
        campaignMode: campaign.mode,
        minutesSinceCampaignCreated: Math.floor(
          (Date.now() - createStartedAt) / 60_000
        ),
        campaignAgeHours: 0,
        hasPortrait: Boolean(campaign.portraitUrl)
      }
    });

    return campaign;
  }

  async function createCharacterArt() {
    if (isCreatingArt) {
      return;
    }

    setError("");
    setIsCreatingArt(true);
    setPortraitPreviewDataUrl("");
    setUploadedPortraitFileName("");
    trackAnalytics({
      name: "Character Portrait Requested",
      properties: {
        ...analyticsBaseProperties(),
        portraitSource: "generated"
      }
    });
  }

  function readImageFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("The selected image could not be read."));
      });
      reader.addEventListener("error", () =>
        reject(new Error("The selected image could not be read."))
      );
      reader.readAsDataURL(file);
    });
  }

  async function handlePortraitUpload(file: File | undefined) {
    if (!file || isCreatingArt) {
      return;
    }

    setError("");
    setIsCreatingArt(true);

    try {
      const imageDataUrl = await readImageFileAsDataUrl(file);

      setPortraitPreviewDataUrl(imageDataUrl);
      setUploadedPortraitFileName(file.name);
      setIsCreatingArt(false);
      trackAnalytics({
        name: "Character Portrait Uploaded",
        properties: {
          ...analyticsBaseProperties(),
          hasPortrait: true,
          portraitSource: "upload"
        },
        milestones: ["portrait_added"]
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Character art could not be uploaded."
      );
      setIsCreatingArt(false);
    }
  }

  async function writeBackstory(mode: "generate" | "add_details") {
    if (isGeneratingBackstory) {
      return false;
    }

    const currentBackstory = backstory.trim();

    if (mode === "add_details" && !currentBackstory) {
      setError("Write a backstory before adding details.");
      return false;
    }

    setError("");
    setIsGeneratingBackstory(true);

    try {
      const generatedBackstory = await generateCharacterBackstory({
        mode,
        characterSheet: characterSheetPreview,
        ...(mode === "add_details" ? { currentBackstory } : {}),
        campaignGenre: selectedGenre.label,
        campaignGenreKind: isCustomGenre ? "custom" : "preset",
        campaignGenrePresetId: isCustomGenre ? undefined : selectedGenre.id,
        customWorldName: isCustomGenre ? customWorldName.trim() : undefined,
        customWorldDescription: isCustomGenre
          ? customWorldDescription.trim()
          : undefined
      });

      setBackstory(generatedBackstory.backstory);
      setEldermereStart(generatedBackstory.eldermereStart ?? null);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Backstory could not be created."
      );
      return false;
    } finally {
      setIsGeneratingBackstory(false);
    }
  }

  async function continueToCampaign() {
    if (isCreating) {
      return;
    }

    setError("");
    setIsCreating(true);

    try {
      const campaign = await createCampaignFromSetup();
      setCreatedCampaign(campaign);
      let campaignWithPortrait = campaign;

      if (portraitPreviewDataUrl && uploadedPortraitFileName) {
        campaignWithPortrait = await uploadCharacterPortrait(campaign.id, {
          imageDataUrl: portraitPreviewDataUrl,
          fileName: uploadedPortraitFileName,
          guidelines: characterArtGuidelines,
          artStyle: characterArtStyle
        });
        trackAnalytics({
          name: "Character Portrait Uploaded",
          properties: {
            ...analyticsBaseProperties(),
            campaignId: campaign.id,
            campaignMode: campaign.mode,
            hasPortrait: true,
            portraitSource: "upload"
          },
          milestones: ["portrait_added"]
        });
      } else if (!portraitPreviewDataUrl) {
        setIsCreatingArt(true);
        await generateCharacterPortrait(campaign.id, {
          guidelines: characterArtGuidelines,
          artStyle: characterArtStyle,
          imageModel: characterImageModel,
          background: true
        });
        trackAnalytics({
          name: "Character Portrait Requested",
          properties: {
            ...analyticsBaseProperties(),
            campaignId: campaign.id,
            campaignMode: campaign.mode,
            portraitSource: "generated"
          }
        });
      }

      setCreatedCampaign(campaignWithPortrait);
      window.location.assign(
        `/play?campaignId=${encodeURIComponent(campaignWithPortrait.id)}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The campaign could not be created."
      );
      setIsCreatingArt(false);
      setIsCreating(false);
    }
  }

  async function joinCampaign() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const joinPayload = {
        clientId: ownerClientId,
        username: playerName.trim(),
        characterName: characterName.trim(),
        characterSheet,
        mechanicsSeed
      };
      const campaign = isInviteJoinFlow
        ? await joinLobbyInvite(inviteToken, joinPayload)
        : await joinCampaignViaApi({
            gameCode: normalizedGameCode,
            ...joinPayload
          });
      trackAnalytics({
        name: "Character Created",
        properties: {
          ...analyticsBaseProperties(),
          campaignId: campaign.id,
          campaignMode: campaign.mode,
          joinSource: isInviteJoinFlow ? "invite" : "code",
          inviteUsed: isInviteJoinFlow,
          equipmentCompleted: true
        },
        milestones: ["campaign_created_or_joined", "character_completed"]
      });
      trackAnalytics({
        name: "Campaign Joined",
        properties: {
          ...analyticsBaseProperties(),
          campaignId: campaign.id,
          campaignMode: campaign.mode,
          joinSource: isInviteJoinFlow ? "invite" : "code",
          inviteUsed: isInviteJoinFlow,
          campaignAgeHours: 0
        }
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
      if (isJoinFlow) {
        void joinCampaign();
        return;
      }

      if (
        !portraitPreviewDataUrl &&
        !uploadedPortraitFileName &&
        !createdCampaign &&
        !isCreatingArt
      ) {
        void createCharacterArt();
        return;
      }

      void continueToCampaign();
      return;
    }

    void handleNext();
  }

  if (entryState === "preloading") {
    return <NewAdventureEntryLoadingScreen />;
  }

  if (isCreating && !isJoinFlow) {
    return (
      <main className="campaign-creation-screen" aria-label="Creating campaign">
        <section className="campaign-creation-center" aria-live="polite">
          <CampaignPreparationLoader />
        </section>
      </main>
    );
  }

  const activeEquipmentChoice = equipmentChoices[equipmentChoiceStepIndex];

  return (
    <>
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
                  style={
                    {
                      "--mode-banner-art-url":
                        'url("/new-adventure/singleplayer-banner.webp")'
                    } as CSSProperties
                  }
                  aria-pressed={mode === "single_player"}
                  onClick={() => {
                    setMode("single_player");
                    trackAnalytics({
                      name: "Campaign Mode Selected",
                      properties: {
                        ...analyticsBaseProperties(),
                        mode: "single_player",
                        campaignMode: "single_player"
                      }
                    });
                  }}
                >
                  <span className="mode-banner-frame" aria-hidden="true" />
                  <span>
                    <strong>Singleplayer</strong>
                    <small>Private play with AI Taverns as your DM.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={mode === "multiplayer" ? "selected" : ""}
                  style={
                    {
                      "--mode-banner-art-url":
                        'url("/new-adventure/multiplayer-banner.webp")'
                    } as CSSProperties
                  }
                  aria-pressed={mode === "multiplayer"}
                  onClick={() => {
                    setMode("multiplayer");
                    trackAnalytics({
                      name: "Campaign Mode Selected",
                      properties: {
                        ...analyticsBaseProperties(),
                        mode: "multiplayer",
                        campaignMode: "multiplayer"
                      }
                    });
                  }}
                >
                  <span className="mode-banner-frame" aria-hidden="true" />
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
                  onClick={() => {
                    setMultiplayerIntent("create");
                    trackAnalytics({
                      name: "Multiplayer Intent Selected",
                      properties: {
                        ...analyticsBaseProperties(),
                        multiplayerIntent: "create"
                      }
                    });
                  }}
                >
                  <strong>Create Game</strong>
                  <small>Start a new table and share its game code.</small>
                </button>
                <button
                  type="button"
                  className={multiplayerIntent === "join" ? "selected" : ""}
                  aria-pressed={multiplayerIntent === "join"}
                  onClick={() => {
                    setMultiplayerIntent("join");
                    trackAnalytics({
                      name: "Multiplayer Intent Selected",
                      properties: {
                        ...analyticsBaseProperties(),
                        multiplayerIntent: "join"
                      }
                    });
                  }}
                >
                  <strong>Join Game</strong>
                  <small>Enter a code, build your character, and join the table.</small>
                </button>
              </div>
            </fieldset>
          ) : null}

          {isCampaignDetailsStep && isJoinFlow ? (
            <div className="join-code-panel">
              {isInviteJoinFlow ? (
                <section className="join-preview">
                  <span>Invite link</span>
                  <strong>{joinPreview?.campaignTitle ?? "Checking lobby..."}</strong>
                  {joinPreview ? (
                    <span>
                      {joinPreview.availableSlots}{" "}
                      {joinPreview.availableSlots === 1 ? "seat" : "seats"} open
                    </span>
                  ) : null}
                </section>
              ) : (
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
              )}
                {joinPreview && !isInviteJoinFlow ? (
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
                      onClick={() => {
                        setCampaignGenre(genre.id);
                        setEldermereStart(null);
                        trackAnalytics({
                          name: "Campaign World Selected",
                          properties: {
                            ...analyticsBaseProperties(),
                            campaignGenre: genre.label,
                            campaignGenreKind:
                              genre.id === "custom" ? "custom" : "preset",
                            campaignGenrePresetId:
                              genre.id === "custom" ? undefined : genre.id,
                            hasCustomWorld: genre.id === "custom"
                          }
                        });
                      }}
                      style={
                        {
                          "--genre-banner-url": `url("${campaignWorldBannerUrls[genre.id]}")`
                        } as CSSProperties
                      }
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
                          trackAnalytics({
                            name: "Character Creation Started",
                            properties: {
                              ...analyticsBaseProperties(),
                              characterBuildMode: "quick"
                            }
                          });
                        }}
                      >
                        <strong>Quick Build</strong>
                        <small>Auto-pick background and proficiencies, then choose the core play details.</small>
                      </button>
                      <button
                        type="button"
                        className={characterBuildMode === "custom" ? "selected" : ""}
                        aria-pressed={characterBuildMode === "custom"}
                        onClick={() => {
                          setCharacterBuildMode("custom");
                          applyCustomBuildDefaults();
                          trackAnalytics({
                            name: "Character Creation Started",
                            properties: {
                              ...analyticsBaseProperties(),
                              characterBuildMode: "custom"
                            }
                          });
                        }}
                      >
                        <strong>Custom Build</strong>
                        <small>Choose each Level 5 character detail step by step.</small>
                      </button>
                    </div>
                  </fieldset>
                ) : null}

                {currentCharacterStep === "Class" ? (
                  <fieldset className="option-picker class-picker">
                    <legend>Class</legend>
                    <div>
                      {classOptions.map((option) => (
                        <button
                          type="button"
                          className={characterClass === option.id ? "selected" : ""}
                          aria-pressed={characterClass === option.id}
                          key={option.id}
                          onClick={() => {
                            handleClassChange(option.id);
                            trackAnalytics({
                              name: "Character Step Completed",
                              properties: {
                                ...analyticsBaseProperties(),
                                step: "Class",
                                characterClass: option.id
                              }
                            });
                          }}
                          style={
                            {
                              "--class-art-url": `url(${classArtByClass[option.id]})`
                            } as CSSProperties
                          }
                        >
                          <strong>{option.id}</strong>
                          <small>{option.summary}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {currentCharacterStep === "Species" ? (
                  <fieldset className="option-picker compact-option-picker species-picker">
                    <legend>Species</legend>
                    <div>
                      {speciesOptions.map((option) => (
                        <button
                          type="button"
                          className={characterSpecies === option ? "selected" : ""}
                          aria-pressed={characterSpecies === option}
                          key={option}
                          onClick={() => {
                            setCharacterSpecies(option);
                            trackAnalytics({
                              name: "Character Step Completed",
                              properties: {
                                ...analyticsBaseProperties(),
                                step: "Species",
                                characterSpecies: option
                              }
                            });
                          }}
                          style={
                            {
                              "--species-art-url": `url(${speciesArtBySpecies[option]})`
                            } as CSSProperties
                          }
                        >
                          <strong>{option}</strong>
                          <small>{formatSpeciesAbilityBonus(option)}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {currentCharacterStep === "Background" ? (
                  <fieldset className="option-picker background-picker">
                    <legend>Background</legend>
                    <div>
                      {backgroundOptions.map((option) => (
                        <button
                          type="button"
                          className={artOptionClassName(characterBackground === option)}
                          aria-pressed={characterBackground === option}
                          key={option}
                          onClick={() => setCharacterBackground(option)}
                          style={optionArtStyle(optionArtUrl("backgrounds", option))}
                        >
                          <strong>{option}</strong>
                          <small>{formatList(backgroundSkills[option])}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {currentCharacterStep === "Stats" ? (
                  <section className="ability-score-panel">
                    <div className="stat-roll-panel-header">
                      <div className="character-step-note">
                        <strong>Level 5 stats</strong>
                        <span>
                          {statGenerationMode === "point_buy"
                            ? "Start at 10 and spend points to tune each stat."
                            : "Roll six scores first, then assign each value to a stat."}
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
                            statGenerationMode === "point_buy" ||
                            !canRollAllStats
                          }
                          onClick={rollAllStats}
                        >
                          <Dice5 size={18} />
                          Roll Scores
                        </button>
                      </div>
                    </div>
                    {statGenerationMode === "roll" ? (
                      <div className="stat-roll-pool" aria-label="Rolled stat values">
                        {abilityDefinitions.map((ability, index) => {
                          const value = statRollValues[index];
                          const isAssigned = assignedStatRollIndexes.has(index);
                          const canRollScore =
                            !activeStatRoll &&
                            (value === null ||
                              (areAllStatRollValuesFilled &&
                                !rerolledStatRollIndexes.has(index)));

                          return (
                            <div
                              className={isAssigned ? "stat-roll-pool-card assigned" : "stat-roll-pool-card"}
                              key={`stat-roll-${ability.key}`}
                            >
                              <button
                                type="button"
                                className="stat-roll-pool-button"
                                aria-label={`${
                                  value === null ? "Roll" : "Reroll"
                                } score ${index + 1}`}
                                disabled={!canRollScore}
                                onClick={() => rollStatPoolValue(index)}
                              >
                                <Dice5 size={16} />
                              </button>
                              <span>Roll {index + 1}</span>
                              <strong>{value ?? "-"}</strong>
                              <small>{isAssigned ? "Assigned" : "Available"}</small>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
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
                                null
                              )}
                            </div>
                            {statGenerationMode === "point_buy" ? (
                              <strong>{score}</strong>
                            ) : (
                              <select
                                aria-label={`Assign rolled score to ${ability.label}`}
                                className="stat-assignment-select"
                                disabled={
                                  Boolean(activeStatRoll) ||
                                  statRollValues.some((value) => value === null)
                                }
                                value={statRollAssignments[ability.key] ?? ""}
                                onChange={(event) =>
                                  assignStatRoll(ability.key, event.target.value)
                                }
                              >
                                <option value="">Assign</option>
                                {statRollValues.map((value, index) => {
                                  const isCurrentAssignment =
                                    statRollAssignments[ability.key] === index;

                                  if (
                                    value === null ||
                                    (assignedStatRollIndexes.has(index) &&
                                      !isCurrentAssignment)
                                  ) {
                                    return null;
                                  }

                                  return (
                                    <option value={index} key={`${value}-${index}`}>
                                      {value}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
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

                {currentCharacterStep === "Class Choices" ? (
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

                {currentCharacterStep === "Skills" ? (
                  <fieldset className="option-picker skill-picker">
                    <legend>Skills</legend>
                    <div>
                      {selectedClass.skillChoices.map((option) => (
                        <button
                          type="button"
                          className={artOptionClassName(selectedSkills.includes(option))}
                          aria-pressed={selectedSkills.includes(option)}
                          key={option}
                          onClick={() => toggleSkill(option)}
                          style={optionArtStyle(optionArtUrl("skills", option))}
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

                {currentCharacterStep === "Proficiencies" ? (
                  <div className="character-builder-stack">
                    <fieldset className="option-picker tool-picker">
                      <legend>Tool proficiency</legend>
                      <div>
                        {toolOptions.map((option) => (
                          <button
                            type="button"
                            className={artOptionClassName(selectedTool === option)}
                            aria-pressed={selectedTool === option}
                            key={option}
                            onClick={() => setSelectedTool(option)}
                            style={optionArtStyle(optionArtUrl("tools", option))}
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

                {currentCharacterStep === "Equipment" ? (
                  <fieldset className="option-picker equipment-picker">
                    <legend>{characterClass} starting equipment</legend>
                    {!isEquipmentSummaryStep && activeEquipmentChoice ? (
                      <section className="equipment-choice-group">
                        <div className="equipment-step-progress">
                          <span>
                            {equipmentChoiceStepIndex + 1} of {equipmentChoices.length}
                          </span>
                        </div>
                        <div className="equipment-choice-options">
                          {activeEquipmentChoice.options.map((option) => {
                            const selection = equipmentSelections[activeEquipmentChoice.id];
                            const isSelected = selection?.optionId === option.id;
                            const selectedCustomItem =
                              option.category && isSelected
                                ? selection.customItem ??
                                  equipmentCategoryOptions[option.category][0]
                                : null;

                            return (
                              <button
                                type="button"
                                className={isSelected ? "selected" : ""}
                                aria-pressed={isSelected}
                                key={option.id}
                                onClick={() => chooseEquipmentOption(activeEquipmentChoice, option)}
                              >
                                <strong>{option.label}</strong>
                                <small>
                                  {selectedCustomItem
                                    ? selectedCustomItem
                                    : formatList(option.items ?? [])}
                                </small>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : (
                      <section className="equipment-summary-panel">
                        <h3>Your starting gear</h3>
                        <ul>
                          {chosenEquipmentGear.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </fieldset>
                ) : null}

                {currentCharacterStep === "Spells" ? (
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
                                    <div
                                      className={[
                                        "spell-option-card",
                                        isSelected ? "selected" : "",
                                        isDlcSpell ? "dlc-spell-option" : ""
                                      ].filter(Boolean).join(" ")}
                                      key={option}
                                      style={{
                                        "--spell-art-url": `url("${spellArtPathFor(option)}")`
                                      } as CSSProperties}
                                    >
                                      <button
                                        type="button"
                                        className="spell-select-button"
                                        aria-pressed={isSelected}
                                        disabled={isAtLimit}
                                        onClick={() => toggleSpell(option)}
                                      >
                                        <strong>{option}</strong>
                                        <span>{spellEffectSummaryFor(option)}</span>
                                        {isDlcSpell ? (
                                          <small>{spellSourceLabels[option] ?? "Expanded source"}</small>
                                        ) : null}
                                      </button>
                                      <button
                                        type="button"
                                        className="spell-detail-button"
                                        aria-label={`Open ${option} spell details`}
                                        onClick={() => setActiveSpellDetail(option)}
                                      />
                                    </div>
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

                {currentCharacterStep === "Identity" ? (
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
                      <legend>Gender</legend>
                      <div>
                        {genderOptions.map((option) => (
                          <button
                            type="button"
                            className={gender === option ? "selected" : ""}
                            aria-pressed={gender === option}
                            key={option}
                            onClick={() => setGender(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>

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

                    <label className="backstory-field">
                      <span>Backstory</span>
                      <small>
                        Feel free to leave it blank and let AI Taverns generate the
                        backstory for you.
                      </small>
                      <div className="backstory-input-shell">
                        <textarea
                          value={backstory}
                          onChange={(event) => {
                            setBackstory(event.target.value);
                            setEldermereStart(null);
                          }}
                          placeholder="Optional: Write Backstory"
                          readOnly={isGeneratingBackstory}
                          aria-busy={isGeneratingBackstory}
                        />
                        {isGeneratingBackstory && !isContinuingWithBackstory ? (
                          <p className="rune-loader backstory-loader">
                            Writing your backstory
                            <span className="rune-loader-dots" aria-hidden="true">
                              <span>.</span>
                              <span>.</span>
                              <span>.</span>
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </label>

                    <div className="backstory-actions" aria-label="Backstory actions">
                      <button
                        type="button"
                        onClick={() => void writeBackstory("generate")}
                        disabled={isGeneratingBackstory}
                      >
                        Generate story
                      </button>
                      <button
                        type="button"
                        onClick={() => void writeBackstory("add_details")}
                        disabled={isGeneratingBackstory || !backstory.trim()}
                      >
                        Add details
                      </button>
                    </div>
                  </div>
                ) : null}

              </div>
            ) : null}

            {stepIndex === reviewStepIndex && !isJoinFlow ? (
              <div className="character-art-step">
                <div
                  className={
                    portraitPreviewDataUrl
                      ? "generated-character-portrait"
                      : "generated-character-portrait empty"
                  }
                  aria-label={`${characterName || "Character"} portrait`}
                >
                  {portraitPreviewDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portraitPreviewDataUrl}
                      alt={`${characterName || "Character"} portrait`}
                    />
                  ) : (
                    <div className="portrait-placeholder">
                      {isCreatingArt ? (
                        <PortraitPreparationLoader />
                      ) : (
                        <>
                          <ImagePlus size={42} />
                          <span>Portrait placeholder</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="character-art-controls">
                  <label>
                    <span>Character art guidelines</span>
                    <textarea
                      value={characterArtGuidelines}
                      onChange={(event) =>
                        setCharacterArtGuidelines(event.target.value)
                      }
                      placeholder="Describe pose, expression, outfit details, color mood, or anything the portrait should avoid."
                    />
                  </label>

                  <div className="character-art-selectors">
                    <label>
                      <span>Image model</span>
                      <select
                        value={characterImageModel}
                        onChange={(event) =>
                          setCharacterImageModel(
                            event.target.value as CharacterImageModel
                          )
                        }
                      >
                        <option value="qwen">Qwen</option>
                        <option value="openai">ChatGPT Image 2</option>
                      </select>
                    </label>
                    <label>
                      <span>Art style</span>
                      <select
                        value={characterArtStyle}
                        onChange={(event) =>
                          setCharacterArtStyle(event.target.value as CharacterArtStyle)
                        }
                      >
                        <option value="painterly_fantasy">Painterly fantasy</option>
                        <option value="storybook_illustration">
                          Storybook illustration
                        </option>
                        <option value="ink_and_watercolor">Ink and watercolor</option>
                        <option value="cinematic_concept_art">
                          Cinematic concept art
                        </option>
                      </select>
                    </label>
                  </div>

                  <label className="character-art-upload">
                    <span>Upload your own image</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={isCreatingArt}
                      onChange={(event) => {
                        void handlePortraitUpload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    {uploadedPortraitFileName ? (
                      <small>{uploadedPortraitFileName}</small>
                    ) : null}
                  </label>

                  {portraitPreviewDataUrl || createdCampaign ? (
                    <button
                      type="button"
                      className="character-art-regenerate"
                      disabled={isCreatingArt}
                      onClick={() => void createCharacterArt()}
                    >
                      <RefreshCw size={16} />
                      {portraitPreviewDataUrl ? "Regenerate" : "Retry portrait"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {stepIndex === reviewStepIndex && isJoinFlow ? (
              <div className="creation-review">
                <ScrollText size={28} />
                <dl>
                  <div>
                    <dt>Mode</dt>
                    <dd>{modeLabel}</dd>
                  </div>
                  <div>
                    <dt>Table</dt>
                    <dd>
                      {joinPreview?.campaignTitle ??
                        (isInviteJoinFlow ? "Invited Lobby" : normalizedGameCode)}
                    </dd>
                  </div>
                  <div>
                    <dt>{isInviteJoinFlow ? "Invite" : "Game Code"}</dt>
                    <dd>{isInviteJoinFlow ? "Invite link" : normalizedGameCode}</dd>
                  </div>
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
                  <div>
                    <dt>Gender</dt>
                    <dd>{gender}</dd>
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
          currentCharacterStep === "Stats" &&
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
              disabled={
                stepIndex === 0 ||
                isCreating ||
                isCreatingArt ||
                isGeneratingBackstory ||
                isFlowTransitioning ||
                Boolean(createdCampaign)
              }
              onClick={handleBack}
            >
              <span className="fantasy-arrow-icon fantasy-arrow-back" aria-hidden="true" />
              Back
            </button>
            <button
              type="submit"
              disabled={isCreating || isFlowTransitioning || isGeneratingBackstory}
            >
              {isCreating ? (
                isJoinFlow ? "Joining..." : "Creating..."
              ) : isContinuingWithBackstory ? (
                "Generating backstory..."
              ) : isCreatingArt && !createdCampaign ? (
                <>
                  Continue
                  <span className="fantasy-arrow-icon fantasy-arrow-forward" aria-hidden="true" />
                </>
              ) : portraitPreviewDataUrl ? (
                <>
                  Continue
                  <span className="fantasy-arrow-icon fantasy-arrow-forward" aria-hidden="true" />
                </>
              ) : isCreatingArt && createdCampaign ? (
                <>
                  Continue
                  <span className="fantasy-arrow-icon fantasy-arrow-forward" aria-hidden="true" />
                </>
              ) : createdCampaign ? (
                <>
                  Continue
                  <span className="fantasy-arrow-icon fantasy-arrow-forward" aria-hidden="true" />
                </>
              ) : isLastStep ? (
                <>
                  {isJoinFlow ? "Join Game" : "Create art"}
                  {isJoinFlow ? <Check size={16} /> : <Wand2 size={16} />}
                </>
              ) : (
                <>
                  {isCharacterStep ? "Next" : "Continue"}
                  <span className="fantasy-arrow-icon fantasy-arrow-forward" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
          {stepIndex === reviewStepIndex && !isJoinFlow && isCreatingArt ? (
            <p className="character-art-wait-note">
              this takes quite a long while, so you may move on to the next part if
              you wish
            </p>
          ) : null}
      </form>

      {activeSpellDetail && activeSpellRuleProfile ? (
        <div
          className="spell-detail-modal-backdrop"
          role="presentation"
          onClick={() => setActiveSpellDetail(null)}
        >
          <section
            aria-modal="true"
            aria-labelledby="spell-detail-modal-title"
            className="spell-detail-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="spell-detail-modal-header">
              <div>
                <span>{activeSpellLevel ?? "Spell"}</span>
                <h2 id="spell-detail-modal-title">{activeSpellDetail}</h2>
              </div>
              <button
                type="button"
                aria-label="Close spell details"
                onClick={() => setActiveSpellDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="spell-detail-modal-body">
              <p>{activeSpellRuleProfile.description}</p>
              <section>
                <h3>Rolls Involved</h3>
                <p>{activeSpellRuleProfile.rolls}</p>
              </section>
            </div>
            <dl className="spell-detail-meta">
              <div>
                <dt>School</dt>
                <dd>{activeSpellRuleProfile.school}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{activeSpellRuleProfile.duration}</dd>
              </div>
              <div>
                <dt>Casting Time</dt>
                <dd>{activeSpellRuleProfile.castingTime}</dd>
              </div>
              <div>
                <dt>Range</dt>
                <dd>{activeSpellRuleProfile.range}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}

      {activeEquipmentModal ? (
        <div
          className="equipment-modal-backdrop"
          role="presentation"
          onClick={() => setActiveEquipmentModal(null)}
        >
          <section
            aria-modal="true"
            className={`equipment-modal ${
              isWeaponCategory(activeEquipmentModal.category)
                ? "weapon-equipment-modal"
                : ""
            }`}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="equipment-modal-header">
              <h2>{activeEquipmentModal.title}</h2>
              <button
                type="button"
                aria-label="Close equipment picker"
                onClick={() => setActiveEquipmentModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div
              className={`equipment-modal-options ${
                isWeaponCategory(activeEquipmentModal.category)
                  ? "weapon-equipment-modal-options"
                  : ""
              }`}
            >
              {equipmentCategoryOptions[activeEquipmentModal.category].map((item) => {
                const isWeapon = isWeaponCategory(activeEquipmentModal.category);
                const weaponSubtext = isWeapon ? weaponSubtextForItem(item) : "";

                return (
                  <button
                    type="button"
                    className={isWeapon ? "art-option-card equipment-weapon-option" : ""}
                    key={item}
                    onClick={() => chooseEquipmentModalItem(item)}
                    style={
                      isWeapon
                        ? optionArtStyle(optionArtUrl("weapons", item))
                        : undefined
                    }
                  >
                    <strong>{item}</strong>
                    {weaponSubtext ? <small>{weaponSubtext}</small> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

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
    {entryState === "transitioning" ? (
      <NewAdventureEntryTransitionOverlay
        entryState={entryState}
        onTransitionFinished={finishEntryTransition}
      />
    ) : null}
    </>
  );
}
