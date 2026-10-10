export const eldermereWorldProfile = {
  worldName: "Eldermere",
  genre: "anchored high fantasy adventure",
} as const;

export const eldermerePresetId = "eldermere";

export type EldermereSettlement = { name: string; description: string };
export type EldermereRegion = {
  name: string;
  description: string;
  commonRaces: string[];
  settlements: EldermereSettlement[];
};
export type EldermereCampaignStart = { region: EldermereRegion; settlement: EldermereSettlement };

export const eldermereRegions: EldermereRegion[] = [
  {
    "name": "The Sundered Vale",
    "description": "The Sundered Vale is a frontier region built around old ruins, excavation sites, and land that was damaged by powerful magic long ago. People come here to work ruin claims, mine valuable materials, recover useful objects, trade them, or provide services to the workers who do. The region has little stable government, so claims, contracts, debts, and local agreements often decide who has food, shelter, protection, or the right to keep what they find.\n\nThe old magical damage is still active in many places. Ground can collapse, harmful energy can escape from buried structures, and some ruins are too unstable to explore safely. This makes the Vale profitable but dangerous: every town depends on workers taking risks, while merchants, lenders, guides, healers, guards, and families depend on what those workers bring back.",
    "commonRaces": [
      "Humans",
      "dwarves",
      "halflings",
      "tieflings",
      "gnomes"
    ],
    "settlements": [
      {
        "name": "Stakehold",
        "description": "Stakehold is the main town where people register ruin claims, receive pay, sell recovered goods, borrow money, and argue over accidents. A ruin claim is a legal right to explore a particular old site and keep or sell what your group finds there. Claims matter because digging is expensive and dangerous: people need to know who paid for the work, who is responsible when someone is hurt, and who receives the value of anything recovered."
      },
      {
        "name": "Glasspan",
        "description": "Glasspan is a trading town built around buying, sorting, repairing, and reselling items recovered from ruins. Small crews bring in goods they do not understand or cannot safely transport; local buyers turn those goods into cash, parts, tools, or shipments for other regions."
      },
      {
        "name": "Rimshaft",
        "description": "Rimshaft is a mining and excavation camp beside ground damaged by old magical disasters. Workers extract valuable metals, crystals, machine parts, and unusual materials from old ruins and buried structures. These magical disasters are still active and thus parts of the excavation sites can collapse, release harmful energy, distort ordinary tools, or change without warning, so workers live by shift bells, safety checks, and evacuation drills. Most residents work shifts, sleep in shared housing, buy food on credit, and hope to earn enough to leave."
      },
      {
        "name": "Vail Choir",
        "description": "Vail Choir is a large work camp outside ancient underground ruins believed to be left behind by a powerful mage society from long ago. The ruins are valuable because they may contain intact tools, rare materials, old records, and useful technology that cannot easily be made anymore. They are also dangerous: parts are damaged, unstable, or behave in ways explorers do not understand, so people make money by guiding crews, carrying supplies, treating injuries, guarding entrances, recording finds, and selling equipment."
      }
    ]
  },
  {
    "name": "Cael Ambrose",
    "description": "Cael Ambrose is a grassland farming region with busy roads, river crossings, market towns, mills, and villages that supply food to other parts of Eldermere. Most people work in agriculture, transport, trade, milling, or services connected to travelers and seasonal markets. Land, harvests, water, roads, and the movement of grain are important to daily life\n\nThe region is governed through nobles, local officials, religious institutions, and trade groups, but ordinary communities often solve problems through neighbors, markets, and family ties. Its long roads connect prosperous towns and isolated villages, which means news, money, workers, and trouble can travel quickly",
    "commonRaces": [
      "Humans",
      "halflings",
      "elves",
      "gnomes"
    ],
    "settlements": [
      {
        "name": "Suncross",
        "description": "Suncross is the largest walled and gated city in Cael Ambrose as all the five major roads meet there, bringing farmers, merchants, pilgrims, officials, and travelers through the same markets and inns. It is a useful place to buy supplies, find work, move goods, or hear news from across the region."
      },
      {
        "name": "Damsgate",
        "description": "Damsgate is a river town where barges, grain wagons, and travelers cross between two waterways. Its locks, bridges, and toll stations make it important for moving food and trade goods. Many residents work in shipping, warehousing, toll collection, fishing, and maintaining the river crossings."
      },
      {
        "name": "Thistlebridge",
        "description": "Thistlebridge is a mill town where nearby farms bring grain to be ground into flour. The mills provide work for millers, laborers, cart drivers, bakers, and traders, while the bridge allows goods to move between the town and surrounding farms. Most local disputes involve grain prices, wages, damaged shipments, or control of the mills."
      },
      {
        "name": "Hallowmere",
        "description": "Hallowmere is a large religious travel stop where visitors come to rest, eat, receive help, and continue their journeys. The town has guest houses, public ovens, shrines, markets, and workers who support the constant flow of travelers. Its economy depends on keeping roads open and making visitors feel safe enough to stay."
      },
      {
        "name": "Greyfold",
        "description": "Greyfold is a border market town where people from Cael Ambrose and the Ashfell Marches trade food, livestock, tools, and supplies. It works because both sides need each other, even when their leaders disagree. The town’s residents are used to dealing with different customs, languages, prices, and ideas about law."
      }
    ]
  },
  {
    "name": "Thornwake Vale",
    "description": "Thornwake Vale is a heavily forested region where communities live among groves, rivers, large trees, and forest paths. People rely on the land for food, clean water, timber, medicine, hunting, farming, and materials gathered from the forest. Travel is slower and more difficult than in open country, so local guides, marked routes, and knowledge of the terrain are important.\n\nThe Vale occasionally trades with nearby regions but is careful about outside control of its land and resources.",
    "commonRaces": [
      "Elves",
      "gnomes",
      "firbolgs",
      "halflings"
    ],
    "settlements": [
      {
        "name": "Wickerlight",
        "description": "Wickerlight is the largest settlement in the Thornwake Vale, built in and around a huge living tree. Homes, workshops, storage rooms, walkways, and gathering spaces are arranged through its trunk, roots, and lower branches. Residents grow, collect, and refine tree sap into useful materials, while traders and visitors use the settlement as a main stop inside the forest."
      },
      {
        "name": "Sallowholt",
        "description": "Sallowholt is the meeting place for communities across the Vale. Representatives, elders, craftspeople, traders, and visitors come here to discuss forest access, shared resources, and disagreements between settlements. It has meeting halls, markets, lodging, and workers who support people arriving from distant groves."
      },
      {
        "name": "Bramblegate",
        "description": "Bramblegate is the main settlement at the edge of the Vale where outside merchants come to trade. It handles timber, food, tools, medicine, and travel permits for people entering or leaving the forest. Local residents work as guides, guards, traders, translators, and repair workers because many visitors do not know how to travel safely through the Vale."
      },
      {
        "name": "Grayleaf",
        "description": "Grayleaf is a small grove that earns its living by trading openly with nearby towns outside the forest. Its residents sell forest goods and buy supplies they cannot make themselves, so merchants and carts are a normal part of daily life. The settlement must balance its need for trade with the concerns of other Vale communities that want less outside contact."
      },
      {
        "name": "Thorn’s Hollow",
        "description": "Thorn’s Hollow is a remote border grove near routes used by prospectors and travelers. The grove is valuable because it provides clean water, fertile soil, medicinal plants, timber, game, and forest materials that nearby settlements cannot easily replace. Residents rely on these resources for food, shelter, medicine, and trade, so they are careful about who enters, what is taken, and whether outside work will damage the land they need to survive."
      }
    ]
  },
  {
    "name": "The Ferrant Concord",
    "description": "The Ferrant Concord is an industrial and mountain region that depends on mines, underground work sites, foundries, machine repair, and long-distance trade. Much of the region’s metal, fuel, raw materials, and mechanical equipment comes from deep underground, then moves through repair towns, factories, warehouses, and trade routes to other parts of Eldermere.\n\nPeople work as miners, mechanics, machine operators, cargo handlers, traders, guards, repair workers, and supply staff. The region needs skilled labor and reliable machinery to function, but its underground sites are difficult and dangerous to maintain.",
    "commonRaces": [
      "Dwarves",
      "gnomes",
      "dragonborn"
    ],
    "settlements": [
      {
        "name": "Ironhold",
        "description": "Ironhold is the Concord’s main industrial city, built around foundries, workshops, warehouses, and public machinery. Many residents work with brass robots—they are humanoid machines that carry loads, operate tools, deliver goods, or handle repetitive jobs. The city depends on fuel, replacement parts, skilled mechanics, and reliable shift work to keep its factories, heating systems, and public services running."
      },
      {
        "name": "Cinderspire",
        "description": "Cinderspire is a mountain trade city where goods move between highland roads, workshops, and airship landing platforms. Merchants bring in food, metals, tools, fuel, and materials from other regions, while local businesses arrange storage, repairs, permits, and transport. Its steep streets, bridges, and loading platforms make moving cargo a major part of everyday work."
      },
      {
        "name": "Hollowforge",
        "description": "Hollowforge is a repair town where damaged machines and brass servitors are brought to be fixed, taken apart, or reused. Its workshops recover usable gears, limbs, pressure systems, metal plates, and power components from equipment that can no longer be repaired as a whole. Many residents depend on this work because replacing a machine is expensive, while salvaging parts can keep other machines operating."
      },
      {
        "name": "Cragfoot",
        "description": "Cragfoot is a border town at the foot of the mountains, where miners, traders, guards, and local families live close to routes used by neighboring regions. It supplies food, tools, lodging, and repairs to people moving through the passes. The town depends on trade and mining, but must also deal with harsh weather, blocked roads, and occasional conflict along the border."
      },
      {
        "name": "Dredgehall",
        "description": "Dredgehall is the last major supply stop before the deep underground work sites that produce most of the Ferrant Concord’s metal, fuel, machine parts, and raw materials. Workers come here to buy lamps, rope, food, tools, protective gear, and maps before going below. The town has bunkhouses, stores, repair shops, hiring boards, and people who track workers leaving for the lower levels and returning from them."
      },
      {
        "name": "The Under-Ledge",
        "description": "The Under-Ledge is a small settlement built near sealed underground areas that are difficult to reach from the surface. The area is dangerous because the old tunnels can collapse, release harmful gases, flood, lose air circulation, or expose damaged machinery that activates unpredictably. Its residents maintain equipment, monitor the tunnels, move supplies, and record changes in the surrounding structures, so daily life depends on regular inspections and strict safety routines."
      }
    ]
  },
  {
    "name": "The Salt Concordat",
    "description": "The Salt Concordat is a coastal region built around ports, shipyards, fisheries, sea trade, and travel between islands and mainland towns. Its people depend on the sea for food, transport, work, and access to goods from other regions. Ships carry cargo, passengers, mail, raw materials, and supplies, while coastal communities rely on fishing, boat repair, navigation, and safe harbors.\n\nLife in the region is shaped by weather, tides, shipping schedules, and the condition of the boats and ports people depend on",
    "commonRaces": [
      "Humans",
      "halflings",
      "sea elves",
      "tritons"
    ],
    "settlements": [
      {
        "name": "Corvane",
        "description": "Corvane is the largest deep-water port in the Salt Concordat. Merchant ships bring in food, timber, metal, cloth, and passengers, then leave with cargo from inland regions and coastal fisheries. Most local work involves loading ships, repairing docks, storing goods, selling supplies, handling customs, making maps, or arranging transport."
      },
      {
        "name": "Selwick",
        "description": "Selwick is a shipbuilding town with large yards for building, repairing, and refitting vessels. Carpenters, metalworkers, rope makers, sail makers, painters, and dock crews work together to keep fishing boats, cargo ships, and patrol vessels usable. The town depends on steady deliveries of timber, metal, tar, cloth, and skilled workers."
      },
      {
        "name": "Barnacle Reach",
        "description": "Barnacle Reach is a prosperous coastal town built around fishing, shipping, and carefully managed access to nearby waters. Its residents earn money from boats, fish processing, trade, warehouses, and visitors who come to buy coastal goods. The town has strict local rules about where people may sail, fish, build, or search for salvage because one mistake at sea can damage livelihoods or put people in danger."
      },
      {
        "name": "Skerrywatch",
        "description": "Skerrywatch is a reef village where people depend on fishing, shellfish gathering, small boats, and knowledge of the tides. Reefs provide food and protect the village from rough water, but they can also wreck a boat if someone travels through them at the wrong time. Residents teach children how to read tides, weather, and markers before allowing them to work on the water."
      },
      {
        "name": "Driftwood Landing",
        "description": "Driftwood Landing is a small salvage settlement where people collect wreckage, cargo, and useful materials carried ashore by the sea. Workers sort wood, rope, metal, crates, damaged tools, and other recovered objects, then repair, sell, or trade what can still be used. The main local question is often who owns something once the sea has taken it and returned it somewhere else."
      }
    ]
  },
  {
    "name": "The Ashfell Marches",
    "description": "The Ashfell Marches is a wide grassland and highland region where many people depend on herding, livestock, seasonal travel, trade, and shared water sources. Communities move or gather according to weather, grazing land, winter conditions, and the needs of their animals. Some people live in permanent settlements, while others still travel between camps and pastures during the year.\n\nDaily life depends on practical cooperation: sharing wells, protecting herds, storing food, repairing equipment, settling disputes, and helping people survive difficult winters. Markets and seasonal gatherings are important because they allow distant communities to trade goods, arrange work, exchange news, and make agreements that will matter long after everyone leaves. Important agreements are often marked with oath-rings: metal rings made at the Ring-Stone forge as physical proof that two people, families, or communities accepted a promise or obligation.",
    "commonRaces": [
      "Humans",
      "goliaths",
      "orcs",
      "halflings"
    ],
    "settlements": [
      {
        "name": "Graymane Camp",
        "description": "Graymane Camp is the largest seasonal gathering in the Marches. Herding families, traders, craftspeople, judges, healers, and travelers meet there during the warmer months to buy supplies, arrange marriages, settle disputes, trade livestock, and prepare for winter. The camp grows into a temporary town with markets, animal pens, water stores, tents, and shared work areas."
      },
      {
        "name": "Windgather",
        "description": "Windgather was once a traveling camp but became a permanent settlement after repeated hard winters made it difficult for its people to keep moving with their herds. Residents now use turf homes, small fields, seed stores, and animal pens alongside older herding practices. The town depends on managing water, pasture, food stores, and livestock carefully enough to survive bad weather."
      },
      {
        "name": "Bonehollow",
        "description": "Bonehollow is a settlement where local leaders and families bring important disputes for public judgment. Its people use old machine bones and metal fragments found in the region as part of their traditional method of reading signs and making decisions. Residents include craftspeople, record keepers, animal traders, visitors seeking judgment, and families waiting to learn how a dispute will be resolved."
      },
      {
        "name": "The Ring-Stone",
        "description": "The Ring-Stone is a small mountain forge where metal rings are made for marriages, work agreements, debt settlements, and other serious promises. In the Marches, an oath-ring is physical proof that both sides accepted an agreement, so people travel there when they need a promise recognized by other communities. Smiths, witnesses, messengers, and travelers keep the forge active."
      },
      {
        "name": "Greyfold",
        "description": "Greyfold is a border market town shared by people from the Ashfell Marches and Cael Ambrose. Farmers, herders, merchants, and craftspeople meet there to trade grain, livestock, tools, cloth, and supplies that neither side can easily produce alone. Its wells, markets, and roadside yards are shared spaces where people with different customs still have to work together."
      }
    ]
  },
  {
    "name": "The Veiled Reach",
    "description": "The Veiled Reach is a cold, mountainous region with isolated towns, narrow travel routes, limited farmland, and long winters. People depend on careful planning, stored supplies, mule transport, and safe access through mountain passes. Food, medicine, fuel, tools, and news may take days or weeks to reach a remote settlement, so supply failures or blocked roads affect daily life quickly.\n\nThe region relies on a network of signal towers to coordinate travel, emergencies, and deliveries. During the day, towers use colored flags for broad messages such as a route being open, a storm approaching, a late convoy, or a request for help. At night, trained workers use extremely bright magic lanterns to send longer coded messages by flashing them in a Morse-code-like pattern.",
    "commonRaces": [
      "Humans",
      "dwarves",
      "goliaths",
      "elves",
      "dragonborn"
    ],
    "settlements": [
      {
        "name": "Veiled Rest",
        "description": "Veiled Rest is the main city of the Veiled Reach, built around a large old observatory that now serves as the region’s communication and emergency-control center. From its high towers, Watchers track mountain passes, receive requests for help, and coordinate supply deliveries and rescue work across isolated settlements. The city keeps regional maps and message records, and contains dispatch offices, workshops, markets, schools, kitchens, and lodging for people working in administration, trade, and public services."
      },
      {
        "name": "Thanewell",
        "description": "Thanewell is a farming village built around narrow hillside terraces. Residents grow barley and other hardy crops, keep small animals, store food for winter, and manage limited water and soil carefully. Its harvests matter to the wider Reach because the region has little easy farmland."
      },
      {
        "name": "The Sisters’ Gate",
        "description": "The Sisters’ Gate is the main controlled entrance into the Veiled Reach, located between two cold mountain towers. Travelers, merchants, workers, and supply carts are checked there before entering or leaving the region. Guards inspect goods, confirm travel reasons, and control who may pass because the mountain route is narrow, difficult, and important for the Reach’s safety and supplies."
      },
      {
        "name": "Coldmere Rise",
        "description": "Coldmere Rise is a care settlement for Watchers, people sent to isolated posts to observe weather, mountain routes, distant activity, and changes in the land. Some Watchers return exhausted, injured, or confused after long periods alone in harsh conditions, so the settlement provides food, rest, medical care, and quiet places to recover. Healers, caretakers, record keepers, and families live there alongside the Watchers."
      }
    ]
  }
];

export function isEldermerePreset(presetId: string | null | undefined) {
  return presetId === eldermerePresetId;
}

export function eldermereMetadataProfile(start?: EldermereCampaignStart) {
  return {
    worldName: eldermereWorldProfile.worldName,
    genre: eldermereWorldProfile.genre,
    source: "flagship_world",
    selectedRegion: start ? { name: start.region.name } : null,
    startingLocation: start ? { name: start.settlement.name, displayLocation: start.settlement.name } : null,
  };
}

export function formatEldermereSelectedRegionContext(start?: EldermereCampaignStart) {
  if (!start) return "World: Eldermere.";
  return [
    "Selected starting settlement: " + start.settlement.name + ".",
    "",
    "## " + start.region.name,
    "",
    start.region.description,
    "",
    "Common races include: " + start.region.commonRaces.join(", "),
    "",
    ...start.region.settlements.flatMap((settlement) => [
      "### " + settlement.name,
      "",
      settlement.description,
      "",
    ]),
  ].join("\n").trim();
}

export function formatEldermereOpeningPromptContext(start?: EldermereCampaignStart) {
  return formatEldermereSelectedRegionContext(start);
}

export const eldermereOpeningPromptContext = formatEldermereOpeningPromptContext();

export function formatEldermereTurnPromptContext(start?: EldermereCampaignStart) {
  return [
    "World Context:",
    formatEldermereSelectedRegionContext(start),
    "",
    "Use this region packet as setting context. Create campaign-local people, conflicts, history, and secrets from play; do not treat details not stated here as established world lore.",
  ].join("\n");
}

export const eldermereTurnPromptContext = formatEldermereTurnPromptContext();
