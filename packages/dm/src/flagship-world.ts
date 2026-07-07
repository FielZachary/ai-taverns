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
  "Elevator pitch: Eldermere is a world built on the bones of a fallen magocracy. The Second Dominion shattered in the Graywake roughly 340 years ago, the gods went quiet, and the present age is deciding what the Third Age should become. Parties are treasure hunters, oath-breakers, faithful, delvers, frontier opportunists, and people inheriting power they did not fully earn.",
  "Realism and tone: Eldermere is invented high fantasy, but its feudal structures, trade logic, borders, religions, and consequences should feel socially grounded enough that players can reason about them. The tone is wondrous, perilous, morally clear but not simple, and wry when appropriate.",
  "History to preserve: the Age of Dawning Blood is the mythic origin of magic, when divine ichor became the Wellspring. The Second Dominion, also called the Sunfall Compact, was the god-touched magocratic empire that raised the Old Roads and built most ruins worth delving. The Graywake was the divine civil war that cracked the Wellspring and drove the gods into silence. The Hush was the long aftermath. The Kindling is the current age, marked by new Bleed Zones, ruin-delving industry, and escalating religious and political conflict.",
  "Magic rules: ordinary spellcraft is reproducible and teachable, but the strongest magic requires Wellglass: crystallized, refined godsblood scavenged from Second Dominion ruins. Wellglass is finite, expensive, and consumed when used. True resurrection, permanent teleportation circles, city-scale wards, artifact crafting, and major constructs should not be casual. Mundane travel, steel, skill, politics, debt, and courage still matter.",
  "Pantheon rules: Eldermere has five Divine Forces: the Hearth-Warden, the Iron Judge, the Deep Currents, the Verdant Choir, and the Ashen Scholar. The gods speak through omens, dreams, and masks, never through plain reliable instruction. Clerics and paladins receive revocable divine gifts. Warlocks do not pact with true Divine Forces; they pact with Unmasked god-fragments left by the Graywake.",
  "Recurring live conflicts: the Iron Judge's Sevrantine mask is split between the Undying Charter's oath-upward feudal orthodoxy and the Unbound Word's claim that oaths should be freely sworn between equals. The Sundered Vale's Claim-Stake Accord is fraying. Every region should have both internal and external pressure.",
  "",
  "Seven regions available for the opener:",
  "- Cael Ambrose: the largest human feudal kingdom, a breadbasket of farms, river towns, guest-right customs, Hearth-Warden hospitality, and still-glowing Old Roads. Internal conflict: the Sevrantine schism between the Undying Charter and the Unbound Word. External conflict: Ashfell pressure over grazing land and old oaths. Great for haunted roads, knights in crisis, harvest villages, river towns, and Old Road mysteries.",
  "- Thornwake Vale: an old-growth forest confederation with no capital, governed by rotating grove-speakers and bound to the Verdant Choir. Internal conflict: Sylla-aligned openness versus Thornmother isolation. External conflict: Cael Ambrose logging charters and Ferrant Concord prospectors. Great for living forests, Wellglass-sap visions, trade truces, taboo-breaking outsiders, and green twilight magic.",
  "- The Ferrant Concord: a dwarf-and-human guild-republic in reclaimed Second Dominion mine tunnels, driven by a 'we will out-build the ancients' ethos. Brass-and-Wellglass servitors work its streets. Internal conflict: Foundry politics and black-market Wellglass before the Foundry Moot. External conflict: Ashfell raids and Idle Wardens in the deep tunnels. Great for guild intrigue, construct problems, mine expeditions, and ambitious artificers.",
  "- The Salt Concordat: a league of independent port city-states bound by maritime law, tariffs, fleets, and worship of the Deep Currents. Internal conflict: Corvane and Selwick rivalry over lighthouses and trade. External conflict: the Drowned Choir cult preying from a sunken Second Dominion city. Great for harbor intrigue, shipwreck debts, lighthouse politics, piracy, fog, reefs, and drowned-city dives.",
  "- Ashfell Marches: a proud horse-and-raid clan confederation on windswept high plains, organized around oath-rings and the Iron Judge's Baragh mask. Internal conflict: succession crisis after the Oath-Ring Warden died without a clear heir. External conflict: Cael Ambrose settlement and Ferrant mining claims squeezing grazing land. Great for clan politics, hard hospitality, peace envoys, border raids, and bone-reading prophecy.",
  "- The Veiled Reach: a small, magic-poor highland theocracy devoted to the Ashen Scholar, ruled by the Curia of Watchers. It hoards Wellglass by doctrine rather than spending it. Internal conflict: reformists who want to spend the hoard for defense versus orthodox Watchers who insist hoarding must continue. External conflict: Cael Ambrose, the Ferrant Concord, and cult thieves all want the hoard. Great for austere monasteries, forbidden ledgers, negotiations, thefts, and visions from a Second Dominion observatory.",
  "- The Sundered Vale: not a nation, but a lawless ruin-delving frontier on the worst-scarred ground of the Graywake, co-administered by Cael Ambrose, the Ferrant Concord, and the Salt Concordat through the Claim-Stake Accord. Internal conflict: rival Claim Warden companies backed by different powers. External conflict: Bleed Zones, Graywake-touched monsters, unstable ruins, and time-loop chambers. Great for claim disputes, boomtowns, dangerous delves, reality scars, and immediate adventure pressure.",
  "",
  "Opening region rule: choose one primary region for the campaign opener and make its local identity, conflict, and sensory details concrete. Do not mash all seven regions into the first scene. Mention other regions only if they are directly relevant as trade partners, rivals, rumors, or distant pressure.",
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
