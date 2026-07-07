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

export type EldermereSettlement = {
  name: string;
  type: string;
  draw: string;
  rememberedDetail: string;
  friction: string;
};

export type EldermereRegion = {
  name: string;
  summary: string;
  internalConflict: string;
  externalConflict: string;
  goodFor: string;
  settlements: EldermereSettlement[];
};

export type EldermereCampaignStart = {
  region: EldermereRegion;
  settlement: EldermereSettlement;
};

export const eldermereRegions: EldermereRegion[] = [
  {
    name: "Cael Ambrose",
    summary:
      "The largest human feudal kingdom, a breadbasket of farms, river towns, guest-right customs, Hearth-Warden hospitality, and still-glowing Old Roads.",
    internalConflict:
      "The Sevrantine schism between the Undying Charter and the Unbound Word.",
    externalConflict: "Ashfell pressure over grazing land and old oaths.",
    goodFor:
      "haunted roads, knights in crisis, harvest villages, river towns, and Old Road mysteries",
    settlements: [
      {
        name: "Suncross",
        type: "capital",
        draw:
          "Built where five Old Roads physically converge; the seat of the crown and the Undying Charter's mother chapel.",
        rememberedDetail:
          "The crossing stones glow brightly enough to read by, and commoners gather there nightly to trade and gossip on crown ground.",
        friction:
          "The Charter's roster of suspected Unbound Word converts is compiled here, and quiet informing is fraying neighborly trust.",
      },
      {
        name: "Thistlebridge",
        type: "river town",
        draw:
          "A Sern bridge town where every barge of grain bound for the coast passes through.",
        rememberedDetail:
          "The miller's guild effectively runs the town and settles disputes faster than the crown's courts do.",
        friction:
          "A bad flood or harvest here ripples all the way to Salt Concordat bread prices.",
      },
      {
        name: "Greyfold",
        type: "border town",
        draw:
          "A garrison-market town on contested grazing land, half Cael Ambrose smallholders and half families with Ashfell in-laws.",
        rememberedDetail:
          "The town shrine has two altars, one to Sevrantine and one quietly to Baragh, with one priest serving both.",
        friction:
          "It is the likeliest flashpoint if the Ashfell border dispute goes hot, and everyone has a bag half-packed.",
      },
    ],
  },
  {
    name: "Thornwake Vale",
    summary:
      "An old-growth forest confederation with no capital, governed by rotating grove-speakers and bound to the Verdant Choir.",
    internalConflict: "Sylla-aligned openness versus Thornmother isolation.",
    externalConflict:
      "Cael Ambrose logging charters and Ferrant Concord prospectors keep testing the border.",
    goodFor:
      "living forests, Wellglass-sap visions, trade truces, taboo-breaking outsiders, and green twilight magic",
    settlements: [
      {
        name: "Sallowholt",
        type: "ancestral first grove",
        draw:
          "The one grove every Vale-dweller agrees matters, Sylla- and Thornmother-aligned alike.",
        rememberedDetail:
          "Its council chamber is a living dome of grown branches supposedly older than the Graywake.",
        friction:
          "Because it is neutral ground, it is where the Sylla/Thornmother argument gets loudest.",
      },
      {
        name: "Bramblegate",
        type: "border trade town",
        draw:
          "The only place the timber trade with Cael Ambrose actually gets negotiated face to face.",
        rememberedDetail:
          "The town gate is a living arch that visibly tightens when the Vale's mood toward outsiders sours.",
        friction:
          "Yearly skirmishes over cut timber are becoming normal, and Bramblegate absorbs it first.",
      },
      {
        name: "Thorn's Hollow",
        type: "isolationist grove",
        draw: "Almost nobody goes there on purpose.",
        rememberedDetail:
          "The trail narrows to nothing as if the forest is actively discouraging the trip.",
        friction:
          "Ferrant Concord prospectors who have gone in have not all come back out.",
      },
    ],
  },
  {
    name: "The Ferrant Concord",
    summary:
      "A dwarf-and-human guild-republic in reclaimed Second Dominion mine tunnels, driven by a 'we will out-build the ancients' ethos.",
    internalConflict:
      "Foundry politics and black-market Wellglass before the Foundry Moot.",
    externalConflict: "Ashfell raids and Idle Wardens in the deep tunnels.",
    goodFor:
      "guild intrigue, construct problems, mine expeditions, and ambitious artificers",
    settlements: [
      {
        name: "Ironhold",
        type: "capital",
        draw:
          "The seat of the Foundry Moot and the deepest, oldest reclaimed mountain-hall.",
        rememberedDetail:
          "Brass servitors do dull and dangerous work while the Moot election turns the capital into a season-long guild brawl.",
        friction:
          "The Cinderhalt Foundry's black-market Wellglass scandal is about to blow the Moot wide open.",
      },
      {
        name: "Cragfoot",
        type: "foothill mining town",
        draw: "Rich surface veins too shallow to be worth full Concord garrisoning.",
        rememberedDetail:
          "Watchfires burn on the ridgeline every night of raiding season.",
        friction:
          "It is the softest target on the Concord's border, and everyone there knows it.",
      },
      {
        name: "Dredgehall",
        type: "deep-tunnel outpost",
        draw:
          "The last supplied waypoint before sealed lower tunnels where Idle Wardens still hold ground.",
        rememberedDetail:
          "Its bounty board pays anyone willing to get a stand-down order acknowledged by a rogue construct.",
        friction: "Crews go in more often than they come back out whole.",
      },
    ],
  },
  {
    name: "The Salt Concordat",
    summary:
      "A league of independent port city-states bound by maritime law, tariffs, fleets, and worship of the Deep Currents.",
    internalConflict:
      "Corvane and Selwick rivalry over lighthouses and trade.",
    externalConflict:
      "The Drowned Choir cult preys from a sunken Second Dominion city.",
    goodFor:
      "harbor intrigue, shipwreck debts, lighthouse politics, piracy, fog, reefs, and drowned-city dives",
    settlements: [
      {
        name: "Corvane",
        type: "major port",
        draw: "The deepest natural harbor and the dominant merchant fleet.",
        rememberedDetail:
          "The harbor is a forest of masts, and the lighthouse-fleet flagship is paraded on feast days.",
        friction:
          "The tariff war with Selwick is one bad season from open naval conflict.",
      },
      {
        name: "Selwick",
        type: "rival port",
        draw: "A safer harbor and the Concordat's finest shipwrights.",
        rememberedDetail:
          "Half the town always seems to be building or repairing something, while dockhands quietly vet outsiders.",
        friction:
          "Selwick plays the wronged underdog while it quietly outbuilds Corvane's fleet.",
      },
      {
        name: "Skerrywatch",
        type: "isle-and-reef fishing village",
        draw: "Rich fishing grounds and safe anchorage among the reefs.",
        rememberedDetail:
          "The village keeps its own tide-count, worships Kethuun rather than Nyxandra, and treats city politics as distant noise.",
        friction:
          "Drowned Choir raiders know these reefs as well as the locals, and the raids are worsening.",
      },
    ],
  },
  {
    name: "Ashfell Marches",
    summary:
      "A proud horse-and-raid clan confederation on windswept high plains, organized around oath-rings and the Iron Judge's Baragh mask.",
    internalConflict:
      "A succession crisis after the Oath-Ring Warden died without a clear heir.",
    externalConflict:
      "Cael Ambrose settlement and Ferrant mining claims squeeze grazing land.",
    goodFor:
      "clan politics, hard hospitality, peace envoys, border raids, and bone-reading prophecy",
    settlements: [
      {
        name: "Wardring",
        type: "seat-camp",
        draw:
          "The traditional seat-camp of the Oath-Ring Warden, now contested by rival claimants.",
        rememberedDetail:
          "Two rival banners are visible from the same ridge, close enough to see each other's watchfires.",
        friction:
          "Whichever claimant blinks first, or does not, decides whether this becomes a real war.",
      },
      {
        name: "Greyfold",
        type: "border garrison-market town",
        draw:
          "The shared Cael Ambrose/Ashfell market town where both peoples still trade honestly.",
        rememberedDetail:
          "Its shrine keeps Sevrantine and Baragh altars side by side.",
        friction:
          "Every family has ties across the border, and every family knows a war would split them.",
      },
      {
        name: "Bonehollow",
        type: "shaman gathering place",
        draw: "The only place to get prophecy this specific and this eerie.",
        rememberedDetail:
          "Old construct-bone fragments click faintly in strong wind, like something trying to speak.",
        friction:
          "Some shamans now wonder whether they are reading the bones, or the bones are reading them.",
      },
    ],
  },
  {
    name: "The Veiled Reach",
    summary:
      "A small, magic-poor highland theocracy devoted to the Ashen Scholar, ruled by the Curia of Watchers and defined by Wellglass hoarding.",
    internalConflict:
      "Reformists who want to spend the hoard for defense versus orthodox Watchers who insist hoarding must continue.",
    externalConflict:
      "Cael Ambrose, the Ferrant Concord, and cult thieves all want the hoard.",
    goodFor:
      "austere monasteries, forbidden ledgers, negotiations, thefts, and visions from a Second Dominion observatory",
    settlements: [
      {
        name: "Veiled Rest",
        type: "capital observatory-settlement",
        draw:
          "The Curia's seat, built inside a still-partially-active Second Dominion observatory.",
        rememberedDetail:
          "Several Watchers have gone mad or vanished fasting before the observatory, and everyone knows exactly who and when.",
        friction:
          "The reform-versus-orthodox split over whether to spend the hoard is playing out inside these walls.",
      },
      {
        name: "Thanewell",
        type: "dependent farming village",
        draw: "The village that actually feeds the Reach.",
        rememberedDetail:
          "Barley terraces cut into thin, cold soil, and a quiet resentment of feeding a theocracy that will not spend its hoard on defense.",
        friction:
          "Thanewell's people know they are necessary and still treated as secondary.",
      },
      {
        name: "The Sisters' Gate",
        type: "garrisoned pass",
        draw: "The only legal way into the Reach.",
        rememberedDetail:
          "Watcher-sworn guards turn back most travelers without much explanation.",
        friction:
          "The guards do not seem to feel they owe outsiders a reason for refusal.",
      },
    ],
  },
  {
    name: "The Sundered Vale",
    summary:
      "A lawless ruin-delving frontier on the worst-scarred ground of the Graywake, co-administered through the fragile Claim-Stake Accord.",
    internalConflict:
      "Rival Claim Warden companies backed by different powers clash over richer sites.",
    externalConflict:
      "Bleed Zones, Graywake-touched monsters, unstable ruins, and time-loop chambers.",
    goodFor:
      "claim disputes, boomtowns, dangerous delves, reality scars, and immediate adventure pressure",
    settlements: [
      {
        name: "Stakehold",
        type: "claim-camp",
        draw:
          "Accord headquarters and the only place with real law, banking, and neutral ground between rival Warden companies.",
        rememberedDetail:
          "The town is built from salvaged ruin-stone and camp timber under a rotating tri-power flag.",
        friction:
          "The Accord is fraying, and Stakehold's neutral-ground reputation is being tested.",
      },
      {
        name: "Rimshaft",
        type: "rush-camp",
        draw:
          "A rich Wellglass vein worth working despite sitting on an active Bleed Zone.",
        rememberedDetail:
          "A strict evacuation bell-schedule that everyone treats with total seriousness.",
        friction: "It is overdue for a real venting, and everyone knows it.",
      },
      {
        name: "Vail Choir",
        type: "sealed vault claim",
        draw:
          "The original sealed vault, now the richest and most infamous claim in the Vale.",
        rememberedDetail:
          "Parts of it are still replaying the day the Wellspring cracked, on a loop.",
        friction:
          "Whoever holds Vail Choir holds the Vale's biggest bargaining chip, and no company keeps it for long.",
      },
    ],
  },
];

export function isEldermerePreset(presetId: string | null | undefined) {
  return presetId === eldermerePresetId;
}

export function eldermereMetadataProfile(start?: EldermereCampaignStart) {
  return {
    worldName: eldermereWorldProfile.worldName,
    genre: eldermereWorldProfile.genre,
    source: "flagship_world",
    selectedRegion: start
      ? {
          name: start.region.name,
          identity: start.region.summary,
          internalConflict: start.region.internalConflict,
          externalConflict: start.region.externalConflict,
          startingHooks: [start.region.goodFor],
        }
      : null,
    startingLocation: start
      ? {
          name: start.settlement.name,
          type: start.settlement.type,
          displayLocation: start.settlement.name,
          frictionPoint: start.settlement.friction,
        }
      : null,
  };
}

export function formatEldermereOpeningPromptContext(
  start?: EldermereCampaignStart,
) {
  return [
  "Flagship world context:",
  "World: Eldermere.",
  "Genre: anchored high fantasy adventure.",
  "Elevator pitch: Eldermere is a world built on the bones of a fallen magocracy. The Second Dominion shattered in the Graywake roughly 340 years ago, the gods went quiet, and the present age is deciding what the Third Age should become. Parties are treasure hunters, oath-breakers, faithful, delvers, frontier opportunists, and people inheriting power they did not fully earn.",
  "Realism and tone: Eldermere is invented high fantasy, but its feudal structures, trade logic, borders, religions, and consequences should feel socially grounded enough that players can reason about them. The tone is wondrous, perilous, morally clear but not simple, and wry when appropriate.",
  "History to preserve: the Age of Dawning Blood is the mythic origin of magic, when divine ichor became the Wellspring. The Second Dominion, also called the Sunfall Compact, was the god-touched magocratic empire that raised the Old Roads and built most ruins worth delving. The Graywake was the divine civil war that cracked the Wellspring and drove the gods into silence. The Hush was the long aftermath. The Kindling is the current age, marked by new Bleed Zones, ruin-delving industry, and escalating religious and political conflict.",
  "Magic rules: ordinary spellcraft is reproducible and teachable, but the strongest magic requires Wellglass: crystallized, refined godsblood scavenged from Second Dominion ruins. Wellglass is finite, expensive, and consumed when used. True resurrection, permanent teleportation circles, city-scale wards, artifact crafting, and major constructs should not be casual. Mundane travel, steel, skill, politics, debt, and courage still matter.",
  "Pantheon rules: Eldermere has five Divine Forces: the Hearth-Warden, the Iron Judge, the Deep Currents, the Verdant Choir, and the Ashen Scholar. The gods speak through omens, dreams, and masks, never through plain reliable instruction. Clerics and paladins receive revocable divine gifts. Warlocks do not pact with true Divine Forces; they pact with Unmasked god-fragments left by the Graywake.",
  "",
  "Seven regions available for the opener:",
  ...eldermereRegions.map(
    (region, index) =>
      `${index + 1}. ${region.name}: ${region.summary} Internal conflict: ${region.internalConflict} External conflict: ${region.externalConflict} Great for ${region.goodFor}.`,
  ),
  "",
  ...(start
    ? [
        "Selected opener region and settlement:",
        `Region: ${start.region.name}. ${start.region.summary}`,
        `Region internal conflict: ${start.region.internalConflict}`,
        `Region external conflict: ${start.region.externalConflict}`,
        `Starting settlement: ${start.settlement.name} (${start.settlement.type}).`,
        `What draws people: ${start.settlement.draw}`,
        `What a visitor remembers: ${start.settlement.rememberedDetail}`,
        `Settlement friction: ${start.settlement.friction}`,
        "Opening region rule: use this selected region and settlement as the concrete start. Do not choose a different primary region or starting settlement. Mention other regions only if directly relevant as trade partners, rivals, rumors, or distant pressure.",
      ]
    : [
        "Opening region rule: choose one primary region for the campaign opener and make its local identity, conflict, and sensory details concrete. Do not mash all seven regions into the first scene. Mention other regions only if directly relevant as trade partners, rivals, rumors, or distant pressure.",
      ]),
  "Starting rule: there is no fixed canonical starting town. Use a named starting place from a region, settlement, road, ruin, camp, city district, or landmark. Do not use a genre label as the location.",
  "Opening lore clarity rule: in the player-facing opening narration, use no more than 2-3 new Eldermere-specific proper nouns besides the selected region and starting settlement. Explain every used setting term in plain language on first use. Do not mention faction names, religious schisms, ancient ages, distant regions, or extra institutions unless they matter to the player's immediate first choice. Prefer concrete meaning before official names, such as 'the strict temple faction' before 'the Undying Charter' unless the official name is immediately useful.",
  'Opening setting requirement: include setting.world_name as "Eldermere" and choose concrete values for setting.starting_location and setting.display_location.',
  ].join("\n");
}

export const eldermereOpeningPromptContext =
  formatEldermereOpeningPromptContext();

export function formatEldermereTurnPromptContext(
  start?: EldermereCampaignStart,
) {
  return [
    "World Context:",
    "World: Eldermere, AI Taverns' flagship anchored high-fantasy setting.",
    "Core premise: Eldermere is built on the ruins of the fallen Second Dominion, an ancient empire whose works still shape roads, mines, cities, monsters, magic, and political borders. About 340 years ago, the Graywake cracked the Wellspring beneath the Dominion, shattered its empire, and began the long divine silence called the Hush. The current age is the Kindling: gods have begun speaking again only through omens, dreams, masks, miracles, and uncertain signs.",
    "Tone: wondrous, perilous, morally clear but not simple, wry when appropriate.",
    "",
    "Magic:",
    "Wellglass is refined godsblood from the broken Wellspring. It is rare, finite, politically dangerous, and powers the strongest magic, relics, engines, and rituals. Common magic exists, but major miracles, ancient machinery, dungeon phenomena, and empire-scale works should usually involve Wellglass or Second Dominion remnants.",
    "",
    "Religion:",
    "The gods are real but not conversational. They should not give simple instructions or appear casually. Faith is interpreted through signs, priesthoods, masks, traditions, schisms, and competing readings of divine will.",
    "",
    "The Five Divine Forces:",
    "- The Hearth-Warden: roads, shelter, hospitality, oaths of welcome, protection of the vulnerable.",
    "- The Iron Judge: law, consequence, sworn judgment, punishment, justice, and hard order. Worship differs sharply between Sevrantine legalists and Baragh oath-clans.",
    "- The Deep Currents: seas, tides, hidden truths, bargains, dreams, drownings, and things carried beneath the surface.",
    "- The Verdant Choir: growth, decay, forests, beasts, harvest, old roots, and the living world's memory.",
    "- The Ashen Scholar: memory, prophecy, records, forbidden knowledge, sacrifice, and the cost of knowing.",
    "",
    "Warlocks:",
    "Warlock patrons are not the true gods. They are usually Unmasked god-fragments, broken divinities, drowned powers, ruin-intelligences, or other partial forces wearing divine shapes.",
    "",
    "Regions of Eldermere:",
    ...eldermereRegions.map((region) => `- ${region.name}: ${region.summary}`),
    "",
    ...(start
      ? [
          "Current Campaign Anchor:",
          `Selected starting region: ${start.region.name}.`,
          `Starting settlement: ${start.settlement.name} (${start.settlement.type}).`,
          "Use this region and settlement as the campaign's local default unless the players travel elsewhere. Ground NPCs, rumors, prices, dangers, customs, weather, faith, politics, and dungeon hooks in this location first.",
          `Region identity: ${start.region.summary}`,
          `Local settlement: ${start.settlement.draw}`,
          `Local friction: ${start.settlement.friction}`,
          "DM rule: do not relocate the party, change the starting region, or introduce another region as the main setting unless player action or established campaign events justify it.",
          "",
        ]
      : []),
    "Eldermere DM Rules:",
    "- Treat Eldermere as the canonical campaign world, not a generic fantasy backdrop.",
    "- Use the selected region first when present; use the other six regions as wider-world context, trade links, rumors, foreign NPC origins, religious tensions, and future travel options.",
    "- Keep divine activity indirect unless the scene is explicitly miraculous.",
    "- Keep Wellglass rare, valuable, and politically meaningful.",
    "- Do not reveal hidden lore, faction secrets, god-fragment truths, or dungeon answers directly in player-facing narration.",
    "- Prefer region-specific institutions, gods, customs, and conflicts over generic fantasy equivalents.",
    "",
    "Player-Facing Lore Clarity:",
    "- Do not overload opening scenes or ordinary turns with unexplained Eldermere proper nouns. Use at most 2-4 new setting-specific terms in a scene unless the player already knows them.",
    "- When using an Eldermere-specific term for the first time in player-facing narration, gloss it naturally in plain language. Prefer 'Stakehold, the frontier camp where rival powers pretend to share authority' over 'Stakehold, headquarters of the Claim-Stake Accord.'",
    "- Prefer concrete meaning before official names. If a term is not immediately useful to the player's next decision, save it for later.",
    "- Introduce lore through action, stakes, NPC behavior, signs, objects, and consequences rather than encyclopedia exposition.",
  ].join("\n");
}

export const eldermereTurnPromptContext = formatEldermereTurnPromptContext();
