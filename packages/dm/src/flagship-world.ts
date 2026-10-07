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
      "The feudal breadbasket, crossed by glowing Second Dominion roads that are quietly going out.",
    internalConflict:
      "The Dimming, the Unbound Word schism, and institutions hiding fractures under performed stability.",
    externalConflict:
      "Ashfell border pressure, Salt Concordat grain dependence, and interest in buried Dominion sites.",
    goodFor:
      "haunted roads, court politics, border markets, pilgrimage towns, suppressed disasters, and old burial fields",
    settlements: [
      {
        name: "Suncross",
        type: "capital, ~70,000",
        draw:
          "Five Old Roads converge beneath the crown, Charter, markets, and pilgrim traffic.",
        rememberedDetail:
          "The Brightcross glows bright enough for night gossip and trade.",
        friction:
          "The northern road is dimming and speaking of it at court is forbidden.",
      },
      {
        name: "Damsgate",
        type: "river city, ~12,000",
        draw:
          "A lock-and-toll city where the Amberflow and Sern nearly touch.",
        rememberedDetail:
          "Grain queues, river law, and tollhouse families make every delay political.",
        friction:
          "Bridge revenues, tax scrutiny, and river control are turning civic pride into a fight.",
      },
      {
        name: "Thistlebridge",
        type: "mill city, ~18,000",
        draw:
          "A grain-mill power city where the millers' guild can move faster than crown law.",
        rememberedDetail:
          "Flour dust, bridge money, and guild courts define daily life.",
        friction:
          "Sedge ambition, Ferrow entanglements, and worker sickness are straining the city.",
      },
      {
        name: "Hallowmere",
        type: "shrine town, ~7,000",
        draw:
          "The largest Halwen pilgrimage site, built around absolute guest-right.",
        rememberedDetail:
          "Guest-houses, public ovens, and ribboned sheaf-poles line every road in.",
        friction:
          "Pilgrims are vanishing as the road dims, tempting leaders toward a false miracle.",
      },
      {
        name: "Greyfold",
        type: "border town, ~4,000",
        draw:
          "A shared Cael Ambrose and Ashfell market town where both peoples still trade.",
        rememberedDetail:
          "One altar bears courtly oath-script on one face and clan war-oath script on the other.",
        friction:
          "Its peace depends on ambiguity that both regions are increasingly trying to end.",
      },
      {
        name: "Coldharrow",
        type: "village, ~400",
        draw:
          "The village where the first road went dark and sixty people froze.",
        rememberedDetail:
          "Sixty graves are tended more faithfully than many palaces.",
        friction:
          "The crown needs it quiet, the Unbound Word needs it remembered, and the road remains wrong.",
      },
      {
        name: "Barrowfield",
        type: "village, ~600",
        draw: "A farming village built around pre-Graywake burial mounds.",
        rememberedDetail:
          "The road keeps the wrong hours and the barrows have begun answering out of sequence.",
        friction:
          "Hunger, crown surveyors, tenant pressure, and old taboos are colliding.",
      },
    ],
  },
  {
    name: "Thornwake Vale",
    summary:
      "A forest confederation with no crown, governed through groves and guarded secrets.",
    internalConflict:
      "Controlled openness versus isolationist protection of the Vale's hidden resources.",
    externalConflict:
      "Cael Ambrose logging charters and Ferrant Concord prospectors keep testing the border.",
    goodFor:
      "forest politics, hidden industry, trade truces, dangerous groves, and living border towns",
    settlements: [
      {
        name: "Wickerlight",
        type: "hidden industrial city, ~9,000",
        draw:
          "The Vale's largest settlement, grown into a colossal elder tree.",
        rememberedDetail:
          "Sap refinement happens in a city outsiders do not know exists.",
        friction:
          "Its importance and secrecy make vanity, recognition, and exposure dangerous.",
      },
      {
        name: "Sallowholt",
        type: "ancestral first grove, ~5,000",
        draw:
          "Council seat and symbolic capital of the Vale.",
        rememberedDetail:
          "The council chamber is a living dome of old branches.",
        friction:
          "Trade reformers and isolationists argue loudest on this neutral ground.",
      },
      {
        name: "Bramblegate",
        type: "border trade town, ~3,000",
        draw:
          "The face the Vale shows Cael Ambrose timber interests.",
        rememberedDetail:
          "The living gate tightens when the forest's mood sours.",
        friction:
          "Its job is to trade while making the Vale look poorer than it is.",
      },
      {
        name: "Grayleaf",
        type: "breakaway grove, ~1,200",
        draw:
          "A grove openly trading with Cael Ambrose in defiance of the council.",
        rememberedDetail:
          "Its existence is a live test case for the whole Vale.",
        friction:
          "If it continues, secrets may break; if it is punished, civil war may follow.",
      },
      {
        name: "Thorn's Hollow",
        type: "isolationist grove, ~800",
        draw: "A Concord-border grove where prospectors disappear.",
        rememberedDetail:
          "The trail seems to narrow away from visitors.",
        friction:
          "The kindly local enforcer and the disappearances are the same problem.",
      },
    ],
  },
  {
    name: "The Ferrant Concord",
    summary:
      "A guild-republic carved into the Cinderspine, built around the promise to out-build the ancients.",
    internalConflict:
      "Foundry politics, lawful fuel scarcity, and the Cinderhalt black-market scandal.",
    externalConflict:
      "Ashfell raids, Sundered Vale supply pressure, and sealed lower Dominion systems.",
    goodFor:
      "guild intrigue, construct scarcity, airship trade, deep tunnels, border mines, and dangerous machinery",
    settlements: [
      {
        name: "Ironhold",
        type: "subterranean capital, ~55,000",
        draw:
          "The Foundry Moot capital where brass servitors keep civic life moving.",
        rememberedDetail:
          "Shift-bells, ventilation flags, brass commons, and failing machines set the rhythm.",
        friction:
          "Lawful power is running out and no faction agrees what survival permits.",
      },
      {
        name: "Cinderspire",
        type: "surface trade city, ~30,000",
        draw: "The Concord's trade face and bound-wind airship city.",
        rememberedDetail:
          "Copper roofs, rope bridges, customs teeth, and landing spars cling to the mountain.",
        friction:
          "Every shortage and risky Sundered Vale route negotiation reaches its ledgers first.",
      },
      {
        name: "Hollowforge",
        type: "construct repair town, ~6,000",
        draw:
          "The place where constructs are built, repaired, and cannibalized.",
        rememberedDetail:
          "Repair floors hold suspended servitor limbs and pressure hearts in glass.",
        friction:
          "Nothing new can truly be made; every repair strips another machine.",
      },
      {
        name: "Cragfoot",
        type: "foothill mining town, ~4,000",
        draw: "The Concord's exposed border knuckle.",
        rememberedDetail:
          "Watchfires burn on the ridgeline every night of raiding season.",
        friction:
          "Border kinship, Ashfell trade, and failing seams make loyalty messy.",
      },
      {
        name: "Dredgehall",
        type: "deep-tunnel staging post, ~1,500",
        draw:
          "The last supplied waypoint before Warden-held lower levels.",
        rememberedDetail:
          "Names of the missing cover Odger's wall.",
        friction:
          "Bounties, rope law, and sealed maps cannot make the lower dark countable enough.",
      },
      {
        name: "The Under-Ledge",
        type: "restricted outpost, ~200",
        draw: "A hidden Ott-controlled outpost near the sealed lower truth.",
        rememberedDetail:
          "Residents live by silence rules, listening braces, and false stability reports.",
        friction:
          "The whole outpost exists to preserve a useful lie from the Moot.",
      },
    ],
  },
  {
    name: "The Salt Concordat",
    summary:
      "A league of rival ports bound by maritime law, tariffs, lighthouse obligations, and fear of the drowned city.",
    internalConflict:
      "Corvane and Selwick are one bad season from naval war over tariffs and lighthouse power.",
    externalConflict:
      "The Drowned Choir, Aurelmyre's taboo, refugee labor pressure, and coastal dependency on inland grain.",
    goodFor:
      "harbor intrigue, shipwright politics, labor conflict, cult towns, reef villages, salvage, and drowned-city pressure",
    settlements: [
      {
        name: "Corvane",
        type: "major port, ~60,000",
        draw: "The deepest natural harbor and old dominant merchant fleet.",
        rememberedDetail:
          "A forest of masts, berth law, chart houses, and a paraded lighthouse flagship.",
        friction:
          "Inherited precedence is failing, and officials are tempted by what lies under the water.",
      },
      {
        name: "Selwick",
        type: "shipwright port, ~35,000",
        draw: "A safer, shallower harbor with the Concordat's finest shipwrights.",
        rememberedDetail:
          "Half the town seems to be building or repairing hulls.",
        friction:
          "Its underdog self-image has not caught up with its naval power.",
      },
      {
        name: "Gullswatch",
        type: "labor port, ~20,000",
        draw:
          "The port nobody counts, built on mudflat labor and refugee survival.",
        rememberedDetail:
          "The Long Table feeds thousands without questions or sermons.",
        friction:
          "A preacher's kindness and a dock-boss's debt book are becoming rival governments.",
      },
      {
        name: "Barnacle Reach",
        type: "fishing town, ~2,500",
        draw: "The Drowned Choir's public-facing town.",
        rememberedDetail:
          "It is tidy, prosperous, watched, and everyone knows why without saying it.",
        friction:
          "The old arrangement demands more than it used to, and doubt has reached the wrong person.",
      },
      {
        name: "Skerrywatch",
        type: "isle-and-reef village, ~900",
        draw: "A reef village with its own tide-count and rites.",
        rememberedDetail:
          "It treats city politics as distant until the bells and reefs say otherwise.",
        friction:
          "Raid pressure, reef custom, and Bell Night pull it toward larger coastal secrets.",
      },
      {
        name: "Driftwood Landing",
        type: "wrack settlement, ~300",
        draw: "A small salvage landing governed by wrack law.",
        rememberedDetail:
          "Sorting sheds and buyers turn whatever the sea returns into survival.",
        friction:
          "Recovered objects, disputed ownership, and unmade things make every find dangerous.",
      },
    ],
  },
  {
    name: "Ashfell Marches",
    summary:
      "A horse-and-raid clan confederation organized around oath-rings, summer moots, and hard memory.",
    internalConflict:
      "The succession crisis after the Oath-Ring Warden's death threatens to split the confederation.",
    externalConflict:
      "Cael Ambrose settlement, Ferrant mining claims, and old reprisal wounds squeeze the clans.",
    goodFor:
      "clan politics, succession pressure, summer markets, bone-reading, oath-forges, border trade, and hard hospitality",
    settlements: [
      {
        name: "Graymane Camp",
        type: "seasonal city, ~15,000",
        draw:
          "The largest gathering in the Marches for three months of summer.",
        rememberedDetail:
          "Markets, courts, marriages, water ledgers, and horses turn grass into a city.",
        friction:
          "Its drift toward permanence may save people and betray the herding life.",
      },
      {
        name: "Wardring",
        type: "traditional seat, ~8,000",
        draw:
          "The half-abandoned seat where rival claimant banners face each other.",
        rememberedDetail:
          "Two rival banners are visible from the same ridge, close enough to see each other's watchfires.",
        friction:
          "Every path into Wardring now carries a peace story and a war story.",
      },
      {
        name: "Windgather",
        type: "settled camp, ~2,000",
        draw:
          "A once-mobile camp that rooted after winter killed its herds.",
        rememberedDetail:
          "Turf walls and seed houses are worn like both shame and proof.",
        friction:
          "It is mocked as rooted just as the whole Marches may need what it learned.",
      },
      {
        name: "Bonehollow",
        type: "bone-reader settlement, ~1,100",
        draw:
          "The center of Ashfell divination and succession legitimacy.",
        rememberedDetail:
          "Construct bones click, answer, and are treated as prophecy.",
        friction:
          "Truth about the bones could prevent war or collapse the only arbitration people still accept.",
      },
      {
        name: "The Ring-Stone",
        type: "oath-forge, ~80",
        draw: "The hereditary forge where oath-rings are made.",
        rememberedDetail:
          "No clan banners pass the final ascent.",
        friction:
          "One smith's refusal can make peace lawful, war lawful, or neither.",
      },
      {
        name: "Greyfold",
        type: "shared border town",
        draw:
          "The Ambrose-Ashfell market town where necessity still beats hatred.",
        rememberedDetail:
          "The northern yards, shared wells, and two-faced altar keep trade alive.",
        friction:
          "Its unofficial usefulness is exactly what hardliners on both sides want to formalize or break.",
      },
    ],
  },
  {
    name: "The Veiled Reach",
    summary:
      "An austere highland theocracy built around hoarding, memory, controlled access, and fear of waste.",
    internalConflict:
      "Reformists who want to spend the hoard for defense versus orthodox Watchers who insist hoarding must continue.",
    externalConflict:
      "Cael Ambrose, the Ferrant Concord, and thieves all want leverage over what the Reach stores.",
    goodFor:
      "monastery politics, ledger mysteries, controlled passes, famine accountability, observatory visions, and quiet corruption",
    settlements: [
      {
        name: "Veiled Rest",
        type: "capital, ~6,000",
        draw:
          "The capital built inside a still-active Second Dominion observatory.",
        rememberedDetail:
          "Hooded lanterns, ledgers, silence hours, and fasting chambers define the city.",
        friction:
          "Its discipline preserves knowledge while burying scandals and urgent need.",
      },
      {
        name: "Cairnholt",
        type: "quarry and vault town, ~2,200",
        draw:
          "The logistics town where the Reach's deepest stores are actually kept.",
        rememberedDetail:
          "Stone houses, mule courts, and sealed cellars make secrecy feel mundane.",
        friction:
          "The town's economy depends on not knowing which storehouses matter.",
      },
      {
        name: "Thanewell",
        type: "dependent farming village, ~1,800",
        draw: "The village that feeds the Reach from thin highland terraces.",
        rememberedDetail:
          "Barley terraces and famine rooms turn doctrine into hunger.",
        friction:
          "Its records make reform unavoidable and orthodoxy harder to defend.",
      },
      {
        name: "The Sisters' Gate",
        type: "garrisoned pass, ~400",
        draw: "The only controlled way into the Reach.",
        rememberedDetail:
          "Every cart is unpacked twice between two cold towers.",
        friction:
          "Rules built for caution now sort refugees, spies, merchants, and desperate people badly.",
      },
      {
        name: "Coldmere Rise",
        type: "hermitage, ~150",
        draw: "A care-house for Watchers who fasted and returned wrong.",
        rememberedDetail:
          "Residents remember lives they never lived and are treated with unusual tenderness.",
        friction:
          "The Reach needs their testimony, but the institution exists to protect them from being used.",
      },
    ],
  },
  {
    name: "The Sundered Vale",
    summary:
      "A lawless ruin-delving frontier on the worst-scarred ground of the Graywake, co-administered through the fragile Claim-Stake Accord.",
    internalConflict:
      "Rival Claim Warden companies and sponsor powers clash over rich sites and falsified risk.",
    externalConflict:
      "Bleed Zones, unstable ruins, time loops, illegal salvage routes, and the open vault pull everyone inward.",
    goodFor:
      "claim disputes, boomtowns, smuggling, dangerous delves, evacuation drills, inheritance camps, and reality scars",
    settlements: [
      {
        name: "Stakehold",
        type: "boomtown capital, ~14,000",
        draw:
          "Accord headquarters and the Vale's only real neutral law.",
        rememberedDetail:
          "Plankwalks, ruin-stone offices, and the rotating tri-power flag hold the town together.",
        friction:
          "Its corruption is currently holding back something worse than corruption.",
      },
      {
        name: "Glasspan",
        type: "fencing town, ~9,000",
        draw: "The laundering capital for looted Refined Wellspring.",
        rememberedDetail:
          "The fused glass flats shine so brightly every shadow looks suspicious.",
        friction:
          "Its paperwork feeds distant infrastructure and local violence at the same time.",
      },
      {
        name: "Rimshaft",
        type: "rush-camp, ~3,000",
        draw: "A rich vein camp built on an overdue Bleed Zone.",
        rememberedDetail:
          "Bell drills, vent watches, and numbered bunkhouses keep everyone half-ready to run.",
        friction:
          "Leaving means abandoning wages, debt, friends, and the only skilled life many people have.",
      },
      {
        name: "Widow's Stake",
        type: "widow-run claim camp, ~1,200",
        draw:
          "A cooperative camp built from widows holding dead husbands' claims.",
        rememberedDetail:
          "Supper-table votes and red fences turn inheritance into government.",
        friction:
          "The law that saved the camp can also trap those who want to leave.",
      },
      {
        name: "Vail Choir",
        type: "sealed vault claim",
        draw:
          "The richest and most infamous claim in the Vale.",
        rememberedDetail:
          "The vault mouth sings in damaged tones and parts of the interior replay the Graywake.",
        friction:
          "Everyone needs it, no company keeps it, and every legal ruling risks bloodshed.",
      },
      {
        name: "The Shatterline",
        type: "waypoint",
        draw: "The boundary beyond which even Claim Wardens hesitate.",
        rememberedDetail:
          "Black stakes, last lanterns, and no-claim customs mark the edge.",
        friction:
          "Past the line, salvage law, maps, and ordinary courage stop working cleanly.",
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
