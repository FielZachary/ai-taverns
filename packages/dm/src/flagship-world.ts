export const eldermereWorldProfile = {
  worldName: "Eldermere",
  worldPitch:
    "Eldermere is an anchored-high-fantasy world built on the bones of a fallen magocracy. The Second Dominion shattered in the Graywake roughly 340 years ago, the gods went quiet, and the present age is deciding what the Third Age should become.",
  genre: "anchored high fantasy adventure",
  tone: [
    "wondrous",
    "perilous",
    "morally clear but not simple",
    "wry when the moment allows it",
  ],
  themes: [
    "inheritance and debt",
    "the true cost of power",
    "faith practiced under divine silence",
    "what a generation chooses to build on other people's ruins",
  ],
  mysteryStyle:
    "Clues are concrete and diegetic; answers unfold gradually across sessions rather than in one reveal.",
  violenceLevel:
    "Heroic-consequential: violence matters and death is real, but this is not grimdark; competence and courage are regularly rewarded.",
  narrationDensity: "rich",
  historySummary:
    "The Second Dominion, a god-touched magocracy, fell in the Graywake. Every ruin, dungeon, and lost-magic item in Eldermere is Second Dominion wreckage, and that history should matter only where it bites the present.",
  magicRulesSummary:
    "Ordinary spellcraft is reproducible and teachable, but the strongest magic requires Wellglass: crystallized, refined godsblood scavenged from Second Dominion ruins. Wellglass is finite, costly, and consumed when used.",
  pantheonSummary:
    "Eldermere has five Divine Forces: the Hearth-Warden, the Iron Judge, the Deep Currents, the Verdant Choir, and the Ashen Scholar. The gods speak through omens, dreams, and masks, never through plain reliable instruction.",
  contentBoundaries: [
    "no sexual content involving minors",
    "fade-to-black on torture and sexual content by default",
    "avoid real-world political allegory",
    "body horror and cosmic dread are permitted but should be earned, not gratuitous",
  ],
} as const;

export const eldermerePresetId = "eldermere";

export function isEldermerePreset(presetId: string | null | undefined) {
  return presetId === eldermerePresetId;
}

export function eldermereMetadataProfile() {
  return {
    worldName: eldermereWorldProfile.worldName,
    genre: eldermereWorldProfile.genre,
    source: "flagship_world",
    selectedRegion: null,
    startingLocation: null,
  };
}

export const eldermereOpeningPromptContext = [
  "Flagship world context:",
  "World: Eldermere.",
  "Genre: anchored high fantasy adventure.",
  "Core truths: the Second Dominion fell in the Graywake; the gods are quiet; Wellglass is scarce and powers the strongest magic; ruins matter because they contain Second Dominion remnants.",
  "Tone: wondrous, perilous, morally clear but not simple, wry when appropriate.",
  "Starting rule: there is no fixed canonical starting town. Choose a named starting place from a region, settlement, road, ruin, camp, city district, or landmark. Do not use a genre label as the location.",
  'Opening setting requirement: include setting.world_name as "Eldermere" and choose concrete values for setting.starting_location and setting.display_location.',
].join("\n");

export const eldermereTurnPromptContext = [
  "World Context:",
  "World: Eldermere.",
  "Genre: anchored high fantasy adventure.",
  "Core truths: the Second Dominion fell in the Graywake; the gods are quiet; Wellglass is scarce and powers the strongest magic; ruins matter because they contain Second Dominion remnants.",
  "Tone: wondrous, perilous, morally clear but not simple, wry when appropriate.",
  "Use Eldermere as the campaign's canonical default world. Do not treat this as generic fantasy. Do not reveal DM-only secrets directly in player-facing narration.",
].join("\n");
