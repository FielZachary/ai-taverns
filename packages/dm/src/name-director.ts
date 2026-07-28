export type NameKind = "npc" | "place" | "faction" | "family" | "title";

export type NameTarget =
  | "person"
  | "family"
  | "settlement"
  | "district"
  | "tavern"
  | "ship"
  | "road"
  | "ruin"
  | "temple"
  | "faction"
  | "artifact"
  | "monster"
  | "title";

export type NameRole =
  | "ally"
  | "rival"
  | "patron"
  | "mentor"
  | "family"
  | "witness"
  | "enemy"
  | "merchant"
  | "authority"
  | "mystic"
  | "commoner";

export type NameGender = "masculine" | "feminine" | "neutral" | "any";

export type NameStyleId =
  | "coastal"
  | "riverlands"
  | "forest"
  | "mountain"
  | "plains"
  | "desert"
  | "marsh"
  | "island"
  | "frontier"
  | "ruinlands"
  | "underground"
  | "arctic"
  | "rural"
  | "urban"
  | "mercantile"
  | "scholastic"
  | "religious"
  | "martial"
  | "noble"
  | "criminal"
  | "nomadic"
  | "industrial"
  | "agrarian"
  | "seafaring"
  | "old_faith"
  | "arcane"
  | "divine"
  | "haunted"
  | "fey"
  | "infernal"
  | "celestial"
  | "shadowed"
  | "ancient"
  | "wondrous"
  | "grim";

export type WeightedNameStyle =
  | NameStyleId
  | {
      id: NameStyleId;
      weight?: number | undefined;
    };

export type NameStyleProfile = {
  id: NameStyleId;
  label: string;
  givenPrefixes: string[];
  givenSuffixes: string[];
  standaloneGiven: string[];
  familyRoots: string[];
  familySuffixes: string[];
  standaloneFamilies: string[];
  placeRoots: string[];
  placeSuffixes: string[];
  tavernAdjectives: string[];
  tavernNouns: string[];
  factionRoots: string[];
  artifactRoots: string[];
  roleHints?: Partial<Record<NameRole, string[]>> | undefined;
};

export type NameCulture = {
  id: string;
  label: string;
  world: string;
  regions: string[];
  styleIds: NameStyleId[];
  givenPrefixes: string[];
  givenSuffixes: string[];
  standaloneGiven: string[];
  surnameRoots: string[];
  surnameSuffixes: string[];
  standaloneSurnames: string[];
  roleHints: Partial<Record<NameRole, string[]>>;
};

export type NameCandidate = {
  name: string;
  givenName: string;
  familyName: string;
  gender?: NameGender | undefined;
  cultureId: string;
  cultureLabel: string;
  target: NameTarget;
  styleIds: NameStyleId[];
  score: number;
};

export type NameValidationResult = {
  ok: boolean;
  reasons: string[];
};

export type GenerateNamePoolInput = {
  world?: string | undefined;
  region?: string | undefined;
  cultureId?: string | undefined;
  styles?: WeightedNameStyle[] | undefined;
  target?: NameTarget | undefined;
  role?: NameRole | undefined;
  gender?: NameGender | undefined;
  kind?: NameKind | undefined;
  count?: number | undefined;
  seed?: string | undefined;
  existingNames?: string[] | undefined;
  avoidNames?: string[] | undefined;
};

export type NameDirectorPromptContextInput = Omit<
  GenerateNamePoolInput,
  "target" | "kind" | "count"
> & {
  targets?: NameTarget[] | undefined;
  perTargetCount?: number | undefined;
  heading?: string | undefined;
};

type RandomSource = {
  next(): number;
};

type CandidateNameParts = {
  name: string;
  givenName: string;
  familyName: string;
  gender?: NameGender | undefined;
};

type BlendedStylePool = {
  id: string;
  label: string;
  world: string;
  regions: string[];
  styleIds: NameStyleId[];
  givenPrefixes: string[];
  givenSuffixes: string[];
  standaloneGiven: string[];
  surnameRoots: string[];
  surnameSuffixes: string[];
  standaloneSurnames: string[];
  placeRoots: string[];
  placeSuffixes: string[];
  tavernAdjectives: string[];
  tavernNouns: string[];
  factionRoots: string[];
  artifactRoots: string[];
  roleHints: Partial<Record<NameRole, string[]>>;
};

const globalBannedNames = [
  "Aelar",
  "Alaric Venn",
  "Elara",
  "Elara Venn",
  "Kael",
  "Kaelos",
  "Kaelus",
  "Lyra",
  "Mara Vell",
  "Marra Vell"
];

const globalBannedSurnameParts = ["Vael", "Vale", "Vell", "Venn", "Vey"];

const causticClusters = ["aa", "aei", "rrx", "xq", "qx", "kkk", "rrr", "'''", "--"];

const defaultNameCount = 12;
const maxGeneratedNameAttempts = 320;

function profile(
  id: NameStyleId,
  label: string,
  parts: Omit<NameStyleProfile, "id" | "label">
): NameStyleProfile {
  return { id, label, ...parts };
}

const commonGivenPrefixes = [
  "Ald",
  "Arlen",
  "Bell",
  "Bren",
  "Cal",
  "Cor",
  "Dessa",
  "Edr",
  "Fenn",
  "Garr",
  "Harl",
  "Iven",
  "Jessa",
  "Keth",
  "Lorn",
  "Maren",
  "Nessa",
  "Orin",
  "Pella",
  "Quin",
  "Sella",
  "Tams",
  "Teren",
  "Vara",
  "Wren"
];

const commonGivenSuffixes = [
  "a",
  "an",
  "ard",
  "el",
  "en",
  "eth",
  "ia",
  "ic",
  "in",
  "or",
  "ra",
  "ren",
  "us",
  "wen"
];

const commonStandaloneGiven = [
  "Ansel",
  "Arda",
  "Bram",
  "Brynn",
  "Calla",
  "Cora",
  "Dain",
  "Edda",
  "Fara",
  "Garrick",
  "Hessa",
  "Ilan",
  "Joren",
  "Kellan",
  "Lenna",
  "Lysa",
  "Merrit",
  "Noll",
  "Orrin",
  "Perrin",
  "Rotha",
  "Soren",
  "Tilda",
  "Torren",
  "Vessa",
  "Willa"
];

const masculineGivenNames = [
  "Ansel",
  "Bram",
  "Calder",
  "Corin",
  "Dain",
  "Edrin",
  "Garrick",
  "Harlan",
  "Ilan",
  "Iven",
  "Joren",
  "Kellan",
  "Lorn",
  "Marenus",
  "Nessaus",
  "Orin",
  "Orrin",
  "Perrin",
  "Soren",
  "Teren",
  "Torran",
  "Varric"
];

const feminineGivenNames = [
  "Arda",
  "Bellin",
  "Bria",
  "Brynn",
  "Calla",
  "Cora",
  "Dessa",
  "Edda",
  "Fara",
  "Hessa",
  "Jessa",
  "Kessa",
  "Kethra",
  "Lenna",
  "Lysa",
  "Nessara",
  "Pella",
  "Rotha",
  "Sella",
  "Tilda",
  "Vara",
  "Vessa",
  "Willa"
];

const neutralGivenNames = [
  "Alder",
  "Arlen",
  "Ash",
  "Bell",
  "Bren",
  "Cairn",
  "Fenn",
  "Harth",
  "Keth",
  "Merrit",
  "Noll",
  "Quin",
  "Reed",
  "Rill",
  "Tams",
  "Wren"
];

const commonProfileParts = {
  givenPrefixes: commonGivenPrefixes,
  givenSuffixes: commonGivenSuffixes,
  standaloneGiven: commonStandaloneGiven,
  familyRoots: [
    "Ash",
    "Bell",
    "Cairn",
    "Crown",
    "Dawn",
    "Ember",
    "Fen",
    "Frost",
    "Gate",
    "Hearth",
    "Iron",
    "Lantern",
    "Morrow",
    "Oak",
    "Reed",
    "Road",
    "Rook",
    "Stone",
    "Thorn",
    "Ward"
  ],
  familySuffixes: [
    "brook",
    "cross",
    "dale",
    "ford",
    "glass",
    "hall",
    "holt",
    "keeper",
    "mark",
    "mere",
    "row",
    "ridge",
    "stead",
    "ward"
  ],
  standaloneFamilies: [
    "Ashbrook",
    "Bellweather",
    "Dawnglass",
    "Emberhall",
    "Gateward",
    "Hearthcross",
    "Morrowmark",
    "Reedholt",
    "Roadkeeper",
    "Stoneford"
  ],
  placeRoots: [
    "Bell",
    "Cairn",
    "Dawn",
    "Ember",
    "Gate",
    "Hearth",
    "Lantern",
    "Morrow",
    "Stone",
    "Ward"
  ],
  placeSuffixes: [
    "bridge",
    "cross",
    "ford",
    "hall",
    "haven",
    "hold",
    "rest",
    "stead",
    "watch",
    "wick"
  ],
  tavernAdjectives: [
    "Amber",
    "Bent",
    "Brass",
    "Crowned",
    "Gilded",
    "Last",
    "Old",
    "Red",
    "Silver",
    "Wayward"
  ],
  tavernNouns: [
    "Bell",
    "Boar",
    "Candle",
    "Cup",
    "Gate",
    "Lantern",
    "Road",
    "Rose",
    "Shield",
    "Wagon"
  ],
  factionRoots: [
    "Accord",
    "Circle",
    "Compact",
    "Company",
    "Guild",
    "House",
    "League",
    "Order",
    "Pact",
    "Watch"
  ],
  artifactRoots: [
    "Bell",
    "Crown",
    "Flame",
    "Glass",
    "Key",
    "Lantern",
    "Mask",
    "Mirror",
    "Seal",
    "Stone"
  ],
  roleHints: {
    authority: ["Iron", "Ward", "Hall", "Order"],
    family: ["Hearth", "Reed", "Brook", "Morrow"],
    merchant: ["Gate", "Road", "Cross", "Guild"],
    mystic: ["Ash", "Dawn", "Glass", "Ember"],
    patron: ["Lantern", "Ward", "Hearth", "Road"],
    rival: ["Iron", "Thorn", "Cairn", "Frost"]
  } satisfies Partial<Record<NameRole, string[]>>
};

export const nameStyleProfiles: NameStyleProfile[] = [
  profile("coastal", "Coastal", {
    ...commonProfileParts,
    givenPrefixes: ["Bria", "Cor", "Dessa", "Harr", "Ivr", "Mael", "Nessa", "Os", "Sella", "Torr", "Yrin"],
    familyRoots: ["Anchor", "Brine", "Harbor", "Keel", "Ledger", "Net", "Quay", "Salt", "Skerry", "Tide", "Wake", "Wharf"],
    familySuffixes: ["hook", "lock", "mark", "mere", "scribe", "tide", "ward", "watch", "wright"],
    standaloneFamilies: ["Anchorward", "Brinehook", "Keelmark", "Ledgerlock", "Quaywatch", "Saltmere", "Skerrywatch", "Tidelock"],
    placeRoots: ["Anchor", "Brine", "Harbor", "Keel", "Quay", "Salt", "Skerry", "Tide", "Wake", "Wharf"],
    placeSuffixes: ["bay", "harbor", "haven", "hook", "port", "quay", "strand", "watch"],
    tavernAdjectives: ["Brass", "Brined", "Gilded", "Low", "Salted", "Stormy", "Tideworn"],
    tavernNouns: ["Anchor", "Gull", "Keel", "Lantern", "Net", "Oar", "Pearl", "Whale"],
    factionRoots: ["Concord", "Fleet", "Harborwatch", "Ledger", "Pilots", "Quaywardens"],
    artifactRoots: ["Anchor", "Compass", "Pearl", "Shell", "Tideglass", "Wakebell"]
  }),
  profile("forest", "Forest", {
    ...commonProfileParts,
    givenPrefixes: ["Bria", "Erl", "Fern", "Hessa", "Ivr", "Leth", "Moss", "Nara", "Pike", "Rill", "Sylla", "Tovin"],
    standaloneGiven: ["Briar", "Celand", "Fenna", "Juniper", "Lysa", "Oren", "Rotha", "Salla", "Tilda", "Willa"],
    familyRoots: ["Bramble", "Cedar", "Elder", "Fern", "Grove", "Moss", "Root", "Sallow", "Thorn", "Willow", "Yew"],
    familySuffixes: ["bark", "brook", "hollow", "holt", "root", "shade", "song", "wake", "wood", "wold"],
    standaloneFamilies: ["Brambleholt", "Cedarwold", "Elderroot", "Fernhollow", "Grovesong", "Sallowshade", "Willowwake"],
    placeRoots: ["Bramble", "Cedar", "Elder", "Fern", "Grove", "Root", "Sallow", "Thorn", "Willow", "Yew"],
    placeSuffixes: ["bower", "grove", "hollow", "holt", "shade", "thicket", "wood", "wold"],
    tavernAdjectives: ["Green", "Mossy", "Rootbound", "Singing", "Thorned", "Verdant"],
    tavernNouns: ["Acorn", "Bough", "Hart", "Leaf", "Root", "Stag", "Thorn"],
    factionRoots: ["Choir", "Circle", "Grove", "Rootwardens", "Thornspeakers"],
    artifactRoots: ["Acorn", "Bough", "Greenmask", "Rootstone", "Thorncrown"]
  }),
  profile("mountain", "Mountain", {
    ...commonProfileParts,
    givenPrefixes: ["Beld", "Cort", "Durn", "Farr", "Gris", "Halk", "Jor", "Kessa", "Marn", "Orr", "Tarn", "Vorr"],
    givenSuffixes: ["a", "an", "ek", "en", "ic", "in", "or", "um", "us"],
    familyRoots: ["Anvil", "Crag", "Forge", "Granite", "Iron", "Kiln", "Quarry", "Rivet", "Steel", "Trestle"],
    familySuffixes: ["brand", "hall", "hold", "mark", "shaft", "spur", "ward", "wright", "yard"],
    standaloneFamilies: ["Anvilmark", "Cragspur", "Forgeyard", "Gearwright", "Ironwright", "Kilnbrand", "Quarryhold"],
    placeRoots: ["Anvil", "Crag", "Forge", "Granite", "Iron", "Kiln", "Quarry", "Ridge", "Steel"],
    placeSuffixes: ["crag", "delve", "fast", "hall", "hold", "peak", "spur", "vault"],
    tavernAdjectives: ["Black", "Deep", "Iron", "Red", "Ringing", "Stone"],
    tavernNouns: ["Anvil", "Bellows", "Hammer", "Mug", "Pick", "Spur"],
    factionRoots: ["Concord", "Forgeguild", "Hammerhold", "Ironwardens", "Quarry League"],
    artifactRoots: ["Anvil", "Hammer", "Ironstar", "Kilnheart", "Stonekey"]
  }),
  profile("plains", "Plains", {
    ...commonProfileParts,
    familyRoots: ["Barley", "Field", "Grass", "Hearth", "Mile", "Oat", "Road", "Sky", "Wain", "Wheat"],
    familySuffixes: ["bridge", "field", "ford", "hall", "row", "stead", "ward", "wick"],
    standaloneFamilies: ["Barleyford", "Fieldward", "Hearthstead", "Milewick", "Wainstead", "Wheatford"],
    placeRoots: ["Barley", "Crown", "Field", "Hearth", "Mile", "Road", "Sun", "Wain", "Wheat"],
    placeSuffixes: ["cross", "field", "ford", "market", "stead", "way", "wick"],
    tavernAdjectives: ["Golden", "Hearthlit", "Long", "Open", "Sunlit"],
    tavernNouns: ["Bushel", "Crown", "Hare", "Mile", "Plough", "Wagon"],
    factionRoots: ["Freeholders", "Grain League", "Roadwardens", "Sun Court"],
    artifactRoots: ["Harvest Bell", "Roadstone", "Sunmark", "Wheatcrown"]
  }),
  profile("desert", "Desert", {
    ...commonProfileParts,
    givenPrefixes: ["Asha", "Dalim", "Eris", "Hale", "Ishan", "Nadir", "Oren", "Rasil", "Talim", "Zerin"],
    givenSuffixes: ["a", "an", "el", "im", "ir", "or", "ra", "us"],
    familyRoots: ["Amber", "Cedar", "Dune", "Glass", "Mirage", "Palm", "Saffron", "Sun", "Votive"],
    familySuffixes: ["bind", "glass", "keeper", "rest", "scribe", "shade", "thread", "well"],
    standaloneFamilies: ["Amberrest", "Cedarscribe", "Dunewell", "Glasskeeper", "Mirageshade", "Saffronbind"],
    placeRoots: ["Amber", "Cedar", "Dune", "Glass", "Mirage", "Palm", "Saffron", "Sun"],
    placeSuffixes: ["gate", "rest", "shade", "spring", "watch", "well"],
    tavernAdjectives: ["Amber", "Cool", "Hidden", "Saffron", "White"],
    tavernNouns: ["Camel", "Cup", "Moon", "Palm", "Spring", "Star"],
    factionRoots: ["Caravanserai", "Mirage Compact", "Sunwardens", "Wellkeepers"],
    artifactRoots: ["Amber Lens", "Glass Star", "Moon Jar", "Sunseal"]
  }),
  profile("marsh", "Marsh", {
    ...commonProfileParts,
    familyRoots: ["Bog", "Fen", "Mire", "Moss", "Reed", "Sedge", "Silt", "Willow"],
    familySuffixes: ["brook", "fen", "hollow", "mere", "mire", "reed", "wash"],
    standaloneFamilies: ["Bogmere", "Fenreed", "Mirewash", "Mossmere", "Sedgehollow"],
    placeRoots: ["Bog", "Fen", "Mire", "Reed", "Sedge", "Silt", "Willow"],
    placeSuffixes: ["fen", "mere", "mire", "pool", "wash", "wick"],
    tavernAdjectives: ["Crooked", "Fogbound", "Green", "Mired", "Reedy"],
    tavernNouns: ["Crane", "Frog", "Lantern", "Reed", "Skiff"],
    factionRoots: ["Fenwatch", "Reed Compact", "Sedgefolk", "Willow Circle"],
    artifactRoots: ["Fenlight", "Mire Bell", "Reed Crown", "Siltmask"]
  }),
  profile("riverlands", "Riverlands", {
    ...commonProfileParts,
    familyRoots: ["Barge", "Bridge", "Brook", "Ferry", "Ford", "Mill", "Reed", "River"],
    familySuffixes: ["bend", "bridge", "brook", "ford", "mill", "reed", "run"],
    standaloneFamilies: ["Bargeford", "Bridgebrook", "Ferrybend", "Millrun", "Riverreed"],
    placeRoots: ["Barge", "Bridge", "Brook", "Ferry", "Ford", "Mill", "River"],
    placeSuffixes: ["bend", "bridge", "ford", "mill", "run", "water"],
    tavernAdjectives: ["Blue", "Low", "Miller's", "Running", "Silver"],
    tavernNouns: ["Barge", "Eel", "Ferry", "Mill", "Pike"],
    factionRoots: ["Bargemen", "Bridge Guild", "Ferry Compact", "Millers"],
    artifactRoots: ["Blue Oar", "Ford Key", "Millstone", "Riverglass"]
  }),
  profile("island", "Island", {
    ...commonProfileParts,
    familyRoots: ["Atoll", "Coral", "Gull", "Pearl", "Reef", "Shell", "Skerry", "Spume"],
    familySuffixes: ["cove", "gull", "holm", "reef", "shell", "strand", "watch"],
    standaloneFamilies: ["Coralstrand", "Pearlshell", "Reefwatch", "Skerryholm", "Spumecove"],
    placeRoots: ["Atoll", "Coral", "Gull", "Pearl", "Reef", "Shell", "Skerry"],
    placeSuffixes: ["cove", "holm", "isle", "reef", "strand", "watch"],
    tavernAdjectives: ["Bright", "Coral", "Laughing", "Pearl", "White"],
    tavernNouns: ["Crab", "Gull", "Oar", "Pearl", "Reef"],
    factionRoots: ["Pearl Divers", "Reefwardens", "Skerry Compact"],
    artifactRoots: ["Coral Knife", "Pearl Crown", "Reef Bell"]
  }),
  profile("frontier", "Frontier", {
    ...commonProfileParts,
    familyRoots: ["Claim", "Dust", "Gate", "Ridge", "Stake", "Trail", "Ward", "Winch"],
    familySuffixes: ["gate", "hold", "mark", "post", "ridge", "stake", "watch", "wright"],
    standaloneFamilies: ["Claimstake", "Gatepost", "Ridgewatch", "Stakehold", "Winchwright"],
    placeRoots: ["Claim", "Dust", "Gate", "Ridge", "Stake", "Trail", "Ward"],
    placeSuffixes: ["camp", "gate", "hold", "post", "stake", "watch"],
    tavernAdjectives: ["First", "Last", "Lucky", "Red", "Weathered"],
    tavernNouns: ["Claim", "Mule", "Pick", "Stake", "Trail"],
    factionRoots: ["Claimholders", "Gatewatch", "Surveyors", "Trail Company"],
    artifactRoots: ["Claim Rod", "Survey Chain", "Trail Lantern"]
  }),
  profile("ruinlands", "Ruinlands", {
    ...commonProfileParts,
    familyRoots: ["Ash", "Glass", "Relic", "Rim", "Shard", "Sunder", "Vault", "Well"],
    familySuffixes: ["choir", "gate", "glass", "hold", "mark", "shaft", "watch"],
    standaloneFamilies: ["Glassmark", "Rimshaft", "Shardwatch", "Sunderhold", "Vaultgate"],
    placeRoots: ["Ash", "Glass", "Relic", "Rim", "Shard", "Sunder", "Vault", "Well"],
    placeSuffixes: ["gate", "hollow", "rift", "shaft", "vault", "watch"],
    tavernAdjectives: ["Broken", "Last", "Pale", "Shard", "Sundered"],
    tavernNouns: ["Bell", "Key", "Pick", "Relic", "Shard"],
    factionRoots: ["Delvers", "Relic Compact", "Shardwatch", "Vaultwardens"],
    artifactRoots: ["Glass Key", "Relic Bell", "Shard Crown", "Vaultheart"]
  }),
  profile("underground", "Underground", {
    ...commonProfileParts,
    familyRoots: ["Deep", "Gem", "Hollow", "Lode", "Mica", "Onyx", "Root", "Vault"],
    familySuffixes: ["delve", "gem", "hall", "lode", "root", "vault"],
    standaloneFamilies: ["Deepdelve", "Gemhall", "Lodelock", "Onyxroot", "Vaultgem"],
    placeRoots: ["Deep", "Gem", "Hollow", "Lode", "Mica", "Onyx", "Vault"],
    placeSuffixes: ["delve", "hall", "lode", "vault", "warren"],
    tavernAdjectives: ["Deep", "Glittering", "Low", "Onyx", "Quiet"],
    tavernNouns: ["Gem", "Lamp", "Mole", "Pick", "Vault"],
    factionRoots: ["Deep Guild", "Gemcutters", "Lodekeepers"],
    artifactRoots: ["Deep Lamp", "Gem Key", "Onyx Crown"]
  }),
  profile("arctic", "Arctic", {
    ...commonProfileParts,
    familyRoots: ["Aurora", "Frost", "Ice", "Rime", "Snow", "Tusk", "Winter"],
    familySuffixes: ["brand", "fall", "fang", "hold", "mane", "watch"],
    standaloneFamilies: ["Aurorawatch", "Frostfang", "Icehold", "Rimefall", "Winterbrand"],
    placeRoots: ["Aurora", "Frost", "Ice", "Rime", "Snow", "Tusk"],
    placeSuffixes: ["fall", "hold", "reach", "watch", "white"],
    tavernAdjectives: ["Blue", "Frosted", "Last", "White", "Winter"],
    tavernNouns: ["Bear", "Cup", "Fox", "Hearth", "Tusk"],
    factionRoots: ["Aurora Watch", "Frostborn", "White Compact"],
    artifactRoots: ["Frostbrand", "Ice Bell", "Winterglass"]
  }),
  profile("urban", "Urban", {
    ...commonProfileParts,
    familyRoots: ["Arch", "Bell", "Coin", "Gate", "Lamp", "Market", "Row", "Stone", "Toll"],
    familySuffixes: ["cross", "gate", "hall", "mark", "row", "ward", "wick"],
    standaloneFamilies: ["Archgate", "Bellrow", "Coinward", "Marketwick", "Tollcross"],
    placeRoots: ["Arch", "Bell", "Coin", "Gate", "Lamp", "Market", "Row", "Stone"],
    placeSuffixes: ["court", "gate", "market", "row", "ward", "wick"],
    tavernAdjectives: ["Brass", "Crowded", "Gilded", "Red", "Twinned"],
    tavernNouns: ["Bell", "Coin", "Cup", "Gate", "Lamp"],
    factionRoots: ["City Watch", "Gate Guild", "Lampkeepers", "Market League"],
    artifactRoots: ["Brass Key", "Gate Seal", "Market Bell"]
  }),
  profile("rural", "Rural", {
    ...commonProfileParts,
    familyRoots: ["Brook", "Byre", "Candle", "Cart", "Croft", "Hearth", "Hedge", "Reed", "Thatch", "Well"],
    familySuffixes: ["brook", "croft", "field", "ford", "hedge", "row", "stead", "well", "wick"],
    standaloneFamilies: ["Brookfield", "Byrecroft", "Cartwell", "Hedgerow", "Thatchwick", "Wellstead"],
    placeRoots: ["Brook", "Byre", "Croft", "Hearth", "Hedge", "Reed", "Thatch", "Well"],
    placeSuffixes: ["brook", "croft", "field", "ford", "row", "stead", "well", "wick"],
    tavernAdjectives: ["Crooked", "Hearthlit", "Old", "Quiet", "Warm"],
    tavernNouns: ["Goose", "Hare", "Hearth", "Pitcher", "Sheaf"],
    factionRoots: ["Hedge Council", "Reedfolk", "Village Moot", "Wellkeepers"],
    artifactRoots: ["Hearth Bell", "Hedge Charm", "Old Pitcher", "Wellstone"]
  }),
  profile("mercantile", "Mercantile", {
    ...commonProfileParts,
    familyRoots: ["Bill", "Coin", "Factor", "Ledger", "Mark", "Scale", "Tally", "Toll"],
    familySuffixes: ["book", "lock", "mark", "scale", "scribe", "ward"],
    standaloneFamilies: ["Coinmark", "Ledgerlock", "Scaleward", "Tallyscribe", "Tollbook"],
    placeRoots: ["Coin", "Ledger", "Market", "Scale", "Tally", "Toll"],
    placeSuffixes: ["exchange", "market", "post", "row", "ward"],
    tavernAdjectives: ["Brass", "Counting", "Gilded", "Honest", "Lucky"],
    tavernNouns: ["Coin", "Ledger", "Scale", "Wager", "Weight"],
    factionRoots: ["Factors", "Ledger Guild", "Scale League", "Toll Compact"],
    artifactRoots: ["Coin Seal", "Ledger Key", "Scale of Oaths"]
  }),
  profile("scholastic", "Scholastic", {
    ...commonProfileParts,
    familyRoots: ["Archive", "Candle", "Cipher", "Ink", "Page", "Quill", "Script", "Tome"],
    familySuffixes: ["bind", "keeper", "scribe", "shade", "thread", "well"],
    standaloneFamilies: ["Archivebind", "Candlekeeper", "Cipherglass", "Inkshade", "Quillscribe"],
    placeRoots: ["Archive", "Candle", "Cipher", "Ink", "Script", "Tome"],
    placeSuffixes: ["hall", "keep", "rest", "scriptorium", "tower"],
    tavernAdjectives: ["Inky", "Quiet", "Red", "Third", "Wise"],
    tavernNouns: ["Candle", "Quill", "Riddle", "Tome", "Tower"],
    factionRoots: ["Archivists", "Candle College", "Quill Circle", "Scriptorium"],
    artifactRoots: ["Cipher Lens", "Ink Mirror", "Quill of Hours"]
  }),
  profile("religious", "Religious", {
    ...commonProfileParts,
    familyRoots: ["Chapel", "Censer", "Hymn", "Oath", "Shrine", "Votive", "Warden"],
    familySuffixes: ["bell", "bind", "keeper", "mark", "ward", "well"],
    standaloneFamilies: ["Chapelbell", "Hymnkeeper", "Oathmark", "Shrineward", "Votivewell"],
    placeRoots: ["Chapel", "Censer", "Hymn", "Shrine", "Votive"],
    placeSuffixes: ["chapel", "cross", "rest", "sanctum", "ward"],
    tavernAdjectives: ["Blessed", "Candlelit", "Pilgrim's", "Quiet", "Votive"],
    tavernNouns: ["Bell", "Candle", "Chalice", "Pilgrim", "Saint"],
    factionRoots: ["Chantry", "Pilgrims", "Shrinewardens", "Votive Order"],
    artifactRoots: ["Chalice", "Hymn Bell", "Oath Candle", "Votive Mask"]
  }),
  profile("martial", "Martial", {
    ...commonProfileParts,
    familyRoots: ["Banner", "Blade", "Guard", "Helm", "Iron", "Shield", "Spear", "Ward"],
    familySuffixes: ["brand", "guard", "helm", "mark", "shield", "ward"],
    standaloneFamilies: ["Bannermark", "Bladeguard", "Ironhelm", "Shieldward", "Spearbrand"],
    placeRoots: ["Banner", "Blade", "Guard", "Helm", "Shield", "Spear"],
    placeSuffixes: ["bastion", "fort", "gate", "hold", "watch"],
    tavernAdjectives: ["Broken", "Iron", "Red", "Shielded", "Veteran's"],
    tavernNouns: ["Banner", "Blade", "Helm", "Shield", "Spear"],
    factionRoots: ["Banner Company", "Iron Guard", "Shieldwardens", "Spearhost"],
    artifactRoots: ["Banner Spear", "Iron Helm", "Shield of Hours"]
  }),
  profile("noble", "Noble", {
    ...commonProfileParts,
    familyRoots: ["Crown", "Dove", "Gold", "High", "Rose", "Sable", "Star", "White"],
    familySuffixes: ["crest", "hall", "mark", "mont", "rose", "ward"],
    standaloneFamilies: ["Crowncrest", "Goldhall", "Rosemont", "Sablemark", "Whiteward"],
    placeRoots: ["Crown", "Gold", "High", "Rose", "Star", "White"],
    placeSuffixes: ["court", "hall", "keep", "mont", "spire"],
    tavernAdjectives: ["Crowned", "Golden", "High", "Rose", "White"],
    tavernNouns: ["Crown", "Falcon", "Lily", "Rose", "Swan"],
    factionRoots: ["Crown Court", "Rose Compact", "Whitehall", "Star Chamber"],
    artifactRoots: ["Crown", "Gold Seal", "Rose Diadem", "Star Scepter"]
  }),
  profile("criminal", "Criminal", {
    ...commonProfileParts,
    familyRoots: ["Black", "Cloak", "Crow", "Knife", "Lock", "Rat", "Shade", "Slip"],
    familySuffixes: ["crown", "cut", "lock", "shade", "slip", "thorn"],
    standaloneFamilies: ["Blacklock", "Crowshade", "Knifecut", "Ratcrown", "Slipthorn"],
    placeRoots: ["Black", "Crow", "Knife", "Lock", "Rat", "Shade"],
    placeSuffixes: ["alley", "den", "market", "row", "vault"],
    tavernAdjectives: ["Black", "Crooked", "Hidden", "Low", "Silent"],
    tavernNouns: ["Crow", "Knife", "Lock", "Rat", "Wink"],
    factionRoots: ["Black Knives", "Crow Market", "Lockhands", "Shade Guild"],
    artifactRoots: ["Black Key", "Crow Mask", "Silent Knife"]
  }),
  profile("nomadic", "Nomadic", {
    ...commonProfileParts,
    familyRoots: ["Dust", "Mare", "Moon", "Oath", "Steppe", "Trail", "Wind"],
    familySuffixes: ["mane", "rider", "road", "song", "trail", "wind"],
    standaloneFamilies: ["Dusttrail", "Maremane", "Moonrider", "Oathsong", "Windroad"],
    placeRoots: ["Dust", "Moon", "Steppe", "Trail", "Wind"],
    placeSuffixes: ["camp", "crossing", "road", "trail", "watch"],
    tavernAdjectives: ["Dusty", "Moonlit", "Open", "Wandering", "Windworn"],
    tavernNouns: ["Horse", "Moon", "Road", "Tent", "Wind"],
    factionRoots: ["Moonriders", "Trail Clans", "Wind Compact"],
    artifactRoots: ["Moon Bridle", "Trail Bell", "Wind Banner"]
  }),
  profile("industrial", "Industrial", {
    ...commonProfileParts,
    familyRoots: ["Bellows", "Coal", "Gear", "Kiln", "Rivet", "Smoke", "Trestle"],
    familySuffixes: ["brand", "hall", "mark", "shaft", "ward", "wright", "yard"],
    standaloneFamilies: ["Bellowsward", "Gearwright", "Kilnbrand", "Rivetmark", "Smokeyard"],
    placeRoots: ["Bellows", "Coal", "Gear", "Kiln", "Rivet", "Smoke"],
    placeSuffixes: ["forge", "hall", "shaft", "works", "yard"],
    tavernAdjectives: ["Black", "Coal", "Red", "Ringing", "Smoky"],
    tavernNouns: ["Bellows", "Gear", "Hammer", "Kiln", "Wheel"],
    factionRoots: ["Bellows Union", "Gearwrights", "Kiln Compact", "Rivet Guild"],
    artifactRoots: ["Coal Heart", "Gear Crown", "Kiln Key"]
  }),
  profile("agrarian", "Agrarian", {
    ...commonProfileParts,
    familyRoots: ["Apple", "Barley", "Beech", "Harvest", "Miller", "Oat", "Plough", "Wheat"],
    familySuffixes: ["field", "ford", "grove", "mill", "row", "stead", "wick"],
    standaloneFamilies: ["Applewick", "Barleyford", "Harvestrow", "Millerstead", "Wheatfield"],
    placeRoots: ["Apple", "Barley", "Harvest", "Miller", "Oat", "Plough", "Wheat"],
    placeSuffixes: ["field", "mill", "stead", "wick", "yard"],
    tavernAdjectives: ["Golden", "Miller's", "Old", "Ploughman's", "Warm"],
    tavernNouns: ["Apple", "Bee", "Bushel", "Plough", "Sheaf"],
    factionRoots: ["Harvest Guild", "Millers", "Plough League"],
    artifactRoots: ["Harvest Bell", "Miller's Stone", "Wheat Crown"]
  }),
  profile("seafaring", "Seafaring", {
    ...commonProfileParts,
    familyRoots: ["Compass", "Hull", "Mast", "Oar", "Sail", "Starboard", "Storm"],
    familySuffixes: ["helm", "lock", "mast", "sail", "ward", "watch"],
    standaloneFamilies: ["Compassward", "Hullmast", "Oarlock", "Sailwatch", "Stormhelm"],
    placeRoots: ["Compass", "Hull", "Mast", "Oar", "Sail", "Storm"],
    placeSuffixes: ["dock", "helm", "port", "watch", "yard"],
    tavernAdjectives: ["Blue", "Compass", "Drunken", "Stormy", "Three-Masted"],
    tavernNouns: ["Compass", "Hull", "Mast", "Oar", "Sail"],
    factionRoots: ["Compass Fleet", "Sailmakers", "Storm Pilots"],
    artifactRoots: ["Compass Rose", "Storm Oar", "True Helm"]
  }),
  profile("old_faith", "Old Faith", {
    ...commonProfileParts,
    familyRoots: ["Antler", "Grove", "Hearth", "Horn", "Root", "Stone", "Wicker"],
    familySuffixes: ["bind", "grove", "horn", "root", "stone", "ward"],
    standaloneFamilies: ["Antlerward", "Groveroot", "Hornbind", "Stonegrove", "Wickerward"],
    placeRoots: ["Antler", "Grove", "Horn", "Root", "Stone", "Wicker"],
    placeSuffixes: ["circle", "grove", "ring", "root", "stone"],
    tavernAdjectives: ["Antlered", "Green", "Old", "Wicker", "Wild"],
    tavernNouns: ["Antler", "Horn", "Oak", "Stone", "Wren"],
    factionRoots: ["Grove Speakers", "Horn Circle", "Rootwardens"],
    artifactRoots: ["Antler Mask", "Green Horn", "Root Crown"]
  }),
  profile("arcane", "Arcane", {
    ...commonProfileParts,
    familyRoots: ["Aether", "Glyph", "Glass", "Moon", "Rune", "Sigil", "Star"],
    familySuffixes: ["bind", "glass", "mark", "scribe", "ward", "weave"],
    standaloneFamilies: ["Aetherbind", "Glyphmark", "Runescribe", "Sigilward", "Starweave"],
    placeRoots: ["Aether", "Glyph", "Moon", "Rune", "Sigil", "Star"],
    placeSuffixes: ["hall", "spire", "tower", "vault", "weave"],
    tavernAdjectives: ["Blue", "Glimmering", "Moonlit", "Runed", "Starry"],
    tavernNouns: ["Glyph", "Moon", "Rune", "Star", "Wand"],
    factionRoots: ["Glyph Circle", "Moon College", "Rune Compact", "Starbinders"],
    artifactRoots: ["Glyph Key", "Moon Lens", "Rune Mirror", "Star Wand"]
  }),
  profile("divine", "Divine", {
    ...commonProfileParts,
    familyRoots: ["Blessing", "Chalice", "Dawn", "Grace", "Halo", "Hymn", "Saint"],
    familySuffixes: ["bell", "bind", "keeper", "light", "mark", "ward"],
    standaloneFamilies: ["Blessingward", "Chalicekeeper", "Dawnlight", "Gracebind", "Hymnmark"],
    placeRoots: ["Blessing", "Chalice", "Dawn", "Grace", "Halo", "Saint"],
    placeSuffixes: ["chapel", "light", "rest", "sanctum", "ward"],
    tavernAdjectives: ["Blessed", "Dawnlit", "Golden", "Sainted", "White"],
    tavernNouns: ["Chalice", "Dove", "Halo", "Hymn", "Lamp"],
    factionRoots: ["Dawn Choir", "Gracewardens", "Order of the Chalice"],
    artifactRoots: ["Dawn Chalice", "Halo Bell", "Saint's Lamp"]
  }),
  profile("haunted", "Haunted", {
    ...commonProfileParts,
    familyRoots: ["Ash", "Black", "Grave", "Mourning", "Pale", "Raven", "Widow"],
    familySuffixes: ["bell", "hollow", "rest", "shade", "watch", "wick"],
    standaloneFamilies: ["Ashhollow", "Gravewatch", "Mourningwick", "Paleshade", "Ravenrest"],
    placeRoots: ["Ash", "Black", "Grave", "Mourning", "Pale", "Raven"],
    placeSuffixes: ["hollow", "rest", "shade", "watch", "wick"],
    tavernAdjectives: ["Black", "Crying", "Last", "Pale", "Widow's"],
    tavernNouns: ["Bell", "Candle", "Crow", "Raven", "Veil"],
    factionRoots: ["Gravewatch", "Mourning Choir", "Pale Order"],
    artifactRoots: ["Black Bell", "Raven Mask", "Widow's Candle"]
  }),
  profile("fey", "Fey", {
    ...commonProfileParts,
    familyRoots: ["Bloom", "Dew", "Fox", "Glimmer", "Moth", "Petal", "Thistle"],
    familySuffixes: ["bloom", "glade", "moth", "petal", "song", "wink"],
    standaloneFamilies: ["Bloomsong", "Dewglade", "Foxwink", "Mothpetal", "Thistlebloom"],
    placeRoots: ["Bloom", "Dew", "Fox", "Glimmer", "Moth", "Petal"],
    placeSuffixes: ["bower", "glade", "ring", "wink", "wood"],
    tavernAdjectives: ["Laughing", "Moonlit", "Silver", "Twice-Told", "Wild"],
    tavernNouns: ["Fox", "Moth", "Mushroom", "Petal", "Thimble"],
    factionRoots: ["Bloom Court", "Fox Compact", "Moth Circle"],
    artifactRoots: ["Dew Crown", "Fox Mask", "Moth Lantern"]
  }),
  profile("infernal", "Infernal", {
    ...commonProfileParts,
    familyRoots: ["Ash", "Brim", "Chain", "Cinder", "Oath", "Red", "Soot"],
    familySuffixes: ["brand", "chain", "mark", "oath", "scar", "ward"],
    standaloneFamilies: ["Ashbrand", "Brimchain", "Cinderscar", "Oathmark", "Redward"],
    placeRoots: ["Ash", "Brim", "Chain", "Cinder", "Red", "Soot"],
    placeSuffixes: ["gate", "pit", "scar", "spire", "vault"],
    tavernAdjectives: ["Black", "Burning", "Red", "Sooty", "Twice-Damned"],
    tavernNouns: ["Chain", "Cinder", "Horn", "Oath", "Pit"],
    factionRoots: ["Chain Compact", "Cinder Court", "Red Oath"],
    artifactRoots: ["Brim Key", "Cinder Chain", "Red Seal"]
  }),
  profile("celestial", "Celestial", {
    ...commonProfileParts,
    familyRoots: ["Dawn", "Gold", "Halo", "Lumen", "Star", "Sun", "White"],
    familySuffixes: ["beam", "crown", "light", "mark", "spire", "ward"],
    standaloneFamilies: ["Dawnspire", "Goldmark", "Haloward", "Starlight", "Sunbeam"],
    placeRoots: ["Dawn", "Gold", "Halo", "Lumen", "Star", "Sun"],
    placeSuffixes: ["crown", "light", "spire", "watch"],
    tavernAdjectives: ["Dawn", "Golden", "Radiant", "Starry", "White"],
    tavernNouns: ["Crown", "Dove", "Halo", "Star", "Sun"],
    factionRoots: ["Dawn Court", "Golden Choir", "Starwardens"],
    artifactRoots: ["Halo Crown", "Star Lance", "Sun Mirror"]
  }),
  profile("shadowed", "Shadowed", {
    ...commonProfileParts,
    familyRoots: ["Dusken", "Ebon", "Hush", "Night", "Shade", "Silk", "Veil"],
    familySuffixes: ["hush", "lock", "shade", "silk", "veil", "whisper"],
    standaloneFamilies: ["Ebonveil", "Hushlock", "Nightshade", "Silkwhisper", "Veilhush"],
    placeRoots: ["Dusken", "Ebon", "Hush", "Night", "Shade", "Veil"],
    placeSuffixes: ["alley", "hush", "shade", "veil", "watch"],
    tavernAdjectives: ["Black", "Dusken", "Hidden", "Quiet", "Veiled"],
    tavernNouns: ["Cat", "Curtain", "Hush", "Lamp", "Whisper"],
    factionRoots: ["Hush Guild", "Night Court", "Veil Compact"],
    artifactRoots: ["Ebon Key", "Hush Bell", "Veil Knife"]
  }),
  profile("ancient", "Ancient", {
    ...commonProfileParts,
    familyRoots: ["Elder", "First", "Old", "Prime", "Relic", "Rune", "Urn"],
    familySuffixes: ["bind", "hall", "mark", "root", "stone", "ward"],
    standaloneFamilies: ["Elderstone", "Firstmark", "Oldhall", "Relicward", "Runebind"],
    placeRoots: ["Elder", "First", "Old", "Prime", "Relic", "Rune"],
    placeSuffixes: ["barrow", "gate", "hall", "root", "stone"],
    tavernAdjectives: ["Elder", "First", "Old", "Prime", "Remembered"],
    tavernNouns: ["Barrow", "Key", "Oath", "Rune", "Stone"],
    factionRoots: ["Elder Compact", "First Circle", "Relicwardens"],
    artifactRoots: ["Elder Key", "First Bell", "Prime Stone"]
  }),
  profile("wondrous", "Wondrous", {
    ...commonProfileParts,
    familyRoots: ["Bright", "Glass", "Glimmer", "Lantern", "Marvel", "Moon", "Wander"],
    familySuffixes: ["bright", "glass", "glow", "keeper", "mark", "wand"],
    standaloneFamilies: ["Brightglass", "Glimmermark", "Lanternkeeper", "Moonwand", "Wanderglow"],
    placeRoots: ["Bright", "Glimmer", "Lantern", "Marvel", "Moon", "Wander"],
    placeSuffixes: ["bright", "cross", "glow", "rest", "spire"],
    tavernAdjectives: ["Bright", "Glimmering", "Impossible", "Moonlit", "Wandering"],
    tavernNouns: ["Door", "Lantern", "Moon", "Spoon", "Star"],
    factionRoots: ["Bright Company", "Glimmer Court", "Lantern Circle"],
    artifactRoots: ["Bright Door", "Glimmer Spoon", "Moon Lantern"]
  }),
  profile("grim", "Grim", {
    ...commonProfileParts,
    familyRoots: ["Black", "Blood", "Cairn", "Crow", "Frost", "Grim", "Iron"],
    familySuffixes: ["brand", "cairn", "crow", "fell", "mark", "ward"],
    standaloneFamilies: ["Blackcairn", "Bloodmark", "Crowfell", "Frostward", "Grimbrand"],
    placeRoots: ["Black", "Blood", "Cairn", "Crow", "Frost", "Grim"],
    placeSuffixes: ["cairn", "fell", "hold", "mark", "watch"],
    tavernAdjectives: ["Black", "Bleak", "Bloody", "Cold", "Last"],
    tavernNouns: ["Crow", "Grave", "Knife", "Skull", "Wolf"],
    factionRoots: ["Black Company", "Crow Guard", "Grim Compact"],
    artifactRoots: ["Black Blade", "Blood Crown", "Crow Bell"]
  })
];

const styleProfileById = new Map(nameStyleProfiles.map((style) => [style.id, style]));

export const eldermereRegionStyles: Record<string, WeightedNameStyle[]> = {
  "Cael Ambrose": [
    { id: "riverlands", weight: 3 },
    { id: "agrarian", weight: 3 },
    { id: "religious", weight: 2 },
    { id: "noble", weight: 1 }
  ],
  "Thornwake Vale": [
    { id: "forest", weight: 4 },
    { id: "old_faith", weight: 3 },
    { id: "rural", weight: 1 },
    { id: "fey", weight: 1 }
  ],
  "The Ferrant Concord": [
    { id: "mountain", weight: 3 },
    { id: "industrial", weight: 3 },
    { id: "mercantile", weight: 2 },
    { id: "urban", weight: 1 }
  ],
  "The Salt Concordat": [
    { id: "coastal", weight: 4 },
    { id: "seafaring", weight: 3 },
    { id: "mercantile", weight: 2 },
    { id: "urban", weight: 1 }
  ],
  "Ashfell Marches": [
    { id: "plains", weight: 2 },
    { id: "frontier", weight: 3 },
    { id: "martial", weight: 2 },
    { id: "nomadic", weight: 2 },
    { id: "grim", weight: 1 }
  ],
  "The Veiled Reach": [
    { id: "scholastic", weight: 3 },
    { id: "religious", weight: 2 },
    { id: "arcane", weight: 2 },
    { id: "ancient", weight: 2 },
    { id: "desert", weight: 1 }
  ],
  "The Sundered Vale": [
    { id: "ruinlands", weight: 4 },
    { id: "frontier", weight: 2 },
    { id: "industrial", weight: 1 },
    { id: "wondrous", weight: 1 }
  ]
};

const defaultStyles: WeightedNameStyle[] = [
  { id: "plains", weight: 2 },
  { id: "urban", weight: 1 },
  { id: "riverlands", weight: 1 },
  { id: "wondrous", weight: 1 }
];

export const nameCultures: NameCulture[] = [
  ...Object.entries(eldermereRegionStyles).map(([region, styles]) => {
    const blended = blendStyles(styles);
    return {
      id: `eldermere-${normalizeName(region).replace(/\s+/g, "-")}`,
      label: region.replace(/^The /, ""),
      world: "Eldermere",
      regions: [region],
      styleIds: blended.styleIds,
      givenPrefixes: blended.givenPrefixes,
      givenSuffixes: blended.givenSuffixes,
      standaloneGiven: blended.standaloneGiven,
      surnameRoots: blended.surnameRoots,
      surnameSuffixes: blended.surnameSuffixes,
      standaloneSurnames: blended.standaloneSurnames,
      roleHints: blended.roleHints
    };
  }),
  {
    id: "fantasy-general",
    label: "General Fantasy",
    world: "Fantasy",
    regions: [],
    styleIds: ["plains", "urban", "riverlands", "wondrous"],
    givenPrefixes: commonGivenPrefixes,
    givenSuffixes: commonGivenSuffixes,
    standaloneGiven: commonStandaloneGiven,
    surnameRoots: commonProfileParts.familyRoots,
    surnameSuffixes: commonProfileParts.familySuffixes,
    standaloneSurnames: commonProfileParts.standaloneFamilies,
    roleHints: commonProfileParts.roleHints
  }
];

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string): RandomSource {
  let state = hashSeed(seed) || 0x9e3779b9;

  return {
    next() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
  };
}

function choose<T>(items: T[], random: RandomSource): T {
  return items[Math.floor(random.next() * items.length) % items.length]!;
}

function compactSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeName(value: string) {
  return compactSpaces(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9' -]/g, "")
    .toLowerCase();
}

function nameTokens(value: string) {
  return normalizeName(value)
    .split(/[\s'-]+/)
    .filter(Boolean);
}

const structuralNameTokens = new Set([
  "the",
  "of",
  "and",
  "at",
  "order",
  "company",
  "league",
  "circle",
  "compact",
  "guild",
  "watch",
  "court",
  "pact",
  "accord",
  "concord",
  "house",
  "fellowship",
  "brotherhood",
  "sisterhood",
  "inn",
  "tavern",
  "house",
  "hall",
  "rest",
  "black",
  "ashen",
  "bleak",
  "bone",
  "briar",
  "bright",
  "brined",
  "broken",
  "buried",
  "cinder",
  "cool",
  "crooked",
  "crowded",
  "crowned",
  "dusk",
  "fogbound",
  "frost",
  "frosted",
  "hidden",
  "hollow",
  "iron",
  "last",
  "lucky",
  "mired",
  "moon",
  "mossy",
  "open",
  "pale",
  "red",
  "root",
  "rootbound",
  "running",
  "salt",
  "salted",
  "shard",
  "silver",
  "singing",
  "storm",
  "old",
  "low",
  "deep",
  "white",
  "blue",
  "green",
  "golden",
  "gilded",
  "brass",
  "stormy",
  "sunlit",
  "thorned",
  "tideworn",
  "veil",
  "verdant",
  "weathered",
  "wayward",
  "wandering",
  "one",
  "wardens",
  "keepers",
  "speakers"
]);

function meaningfulNameTokens(value: string) {
  return nameTokens(value).filter((token) => !structuralNameTokens.has(token));
}

function consonantSkeleton(value: string) {
  return normalizeName(value)
    .replace(/[aeiouy\s'-]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function vowelPattern(value: string) {
  return normalizeName(value)
    .replace(/[^aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + cost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index]!;
    }
  }

  return previous[right.length]!;
}

function similarity(left: string, right: string) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length, 1);

  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / maxLength;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function expandByWeight<T>(items: T[], weight: number) {
  return Array.from({ length: Math.max(1, Math.round(weight)) }).flatMap(() => items);
}

function normalizeWeightedStyle(style: WeightedNameStyle): { id: NameStyleId; weight: number } {
  return typeof style === "string"
    ? { id: style, weight: 1 }
    : { id: style.id, weight: style.weight ?? 1 };
}

function mergeRoleHints(styles: Array<{ profile: NameStyleProfile; weight: number }>) {
  const hints: Partial<Record<NameRole, string[]>> = {};

  for (const { profile, weight } of styles) {
    for (const [role, roleHints] of Object.entries(profile.roleHints ?? {}) as Array<
      [NameRole, string[]]
    >) {
      hints[role] = [
        ...(hints[role] ?? []),
        ...expandByWeight(roleHints, weight)
      ];
    }
  }

  return hints;
}

function blendStyles(styles: WeightedNameStyle[] = defaultStyles): BlendedStylePool {
  const selected = styles
    .map(normalizeWeightedStyle)
    .map(({ id, weight }) => {
      const profile = styleProfileById.get(id);

      if (!profile) {
        throw new Error(`Unknown name style: ${id}`);
      }

      return { profile, weight };
    });
  const styleIds = unique(selected.map(({ profile }) => profile.id));
  const label = styleIds.map((id) => styleProfileById.get(id)?.label ?? id).join(" + ");

  return {
    id: `styles:${styleIds.join("+")}`,
    label,
    world: "Fantasy",
    regions: [],
    styleIds,
    givenPrefixes: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.givenPrefixes, weight)
    ),
    givenSuffixes: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.givenSuffixes, weight)
    ),
    standaloneGiven: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.standaloneGiven, weight)
    ),
    surnameRoots: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.familyRoots, weight)
    ),
    surnameSuffixes: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.familySuffixes, weight)
    ),
    standaloneSurnames: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.standaloneFamilies, weight)
    ),
    placeRoots: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.placeRoots, weight)
    ),
    placeSuffixes: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.placeSuffixes, weight)
    ),
    tavernAdjectives: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.tavernAdjectives, weight)
    ),
    tavernNouns: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.tavernNouns, weight)
    ),
    factionRoots: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.factionRoots, weight)
    ),
    artifactRoots: selected.flatMap(({ profile, weight }) =>
      expandByWeight(profile.artifactRoots, weight)
    ),
    roleHints: mergeRoleHints(selected)
  };
}

function targetForInput(input: GenerateNamePoolInput): NameTarget {
  if (input.target) {
    return input.target;
  }

  if (input.kind === "place") {
    return "settlement";
  }

  if (input.kind === "npc") {
    return "person";
  }

  return input.kind ?? "person";
}

export function stylesForNameRequest(input: GenerateNamePoolInput): WeightedNameStyle[] {
  if (input.styles?.length) {
    return input.styles;
  }

  if (input.region) {
    const normalizedRegion = normalizeName(input.region);
    const matchedRegion = Object.keys(eldermereRegionStyles).find(
      (region) => normalizeName(region) === normalizedRegion
    );

    if (matchedRegion) {
      return eldermereRegionStyles[matchedRegion]!;
    }
  }

  if (input.cultureId) {
    const culture = nameCultures.find((candidate) => candidate.id === input.cultureId);

    if (culture?.styleIds.length) {
      return culture.styleIds;
    }
  }

  return defaultStyles;
}

export function cultureForNameRequest(input: GenerateNamePoolInput): NameCulture {
  const styles = stylesForNameRequest(input);
  const blended = blendStyles(styles);
  const region = input.region?.trim();
  const culture = input.cultureId
    ? nameCultures.find((candidate) => candidate.id === input.cultureId)
    : region
      ? nameCultures.find((candidate) =>
          candidate.regions.some(
            (candidateRegion) => normalizeName(candidateRegion) === normalizeName(region)
          )
        )
      : undefined;

  return {
    id: culture?.id ?? blended.id,
    label: culture?.label ?? blended.label,
    world: culture?.world ?? input.world ?? blended.world,
    regions: culture?.regions ?? (region ? [region] : []),
    styleIds: blended.styleIds,
    givenPrefixes: blended.givenPrefixes,
    givenSuffixes: blended.givenSuffixes,
    standaloneGiven: blended.standaloneGiven,
    surnameRoots: blended.surnameRoots,
    surnameSuffixes: blended.surnameSuffixes,
    standaloneSurnames: blended.standaloneSurnames,
    roleHints: blended.roleHints
  };
}

function poolForInput(input: GenerateNamePoolInput) {
  const styles = stylesForNameRequest(input);
  const blended = blendStyles(styles);
  const culture = cultureForNameRequest(input);

  return {
    ...blended,
    id: culture.id,
    label: culture.label,
    world: culture.world,
    regions: culture.regions
  };
}

function hasPronounceableShape(name: string) {
  const normalized = normalizeName(name);

  if (normalized.length < 5 || normalized.length > 36) {
    return false;
  }

  if (causticClusters.some((cluster) => normalized.includes(cluster))) {
    return false;
  }

  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(normalized)) {
    return false;
  }

  if (nameTokens(name).some((token) => token.length >= 6 && !/[aeiouy].*[aeiouy]/i.test(token))) {
    return false;
  }

  if (/[aeiouy]{4,}/i.test(normalized)) {
    return false;
  }

  if ((normalized.match(/['-]/g)?.length ?? 0) > 1) {
    return false;
  }

  return true;
}

function finalToken(value: string) {
  return nameTokens(value).at(-1) ?? "";
}

function tokenEnding(value: string, length: number) {
  const token = meaningfulNameTokens(value).at(-1) ?? finalToken(value);
  return token.slice(Math.max(0, token.length - length));
}

function sharesForbiddenPart(candidate: string) {
  const tokens = nameTokens(candidate);
  const bannedNameTokens = globalBannedNames.flatMap((name) => nameTokens(name));

  if (tokens.some((token) => bannedNameTokens.includes(token))) {
    return true;
  }

  return globalBannedSurnameParts.some((part) => {
    const normalizedPart = normalizeName(part);
    return tokens.some((token) => {
      if (token === normalizedPart) {
        return true;
      }

      return (
        token.length >= 4 &&
        normalizedPart.length >= 4 &&
        similarity(token, normalizedPart) >= 0.78
      );
    });
  });
}

function isNearDuplicate(candidate: string, existingName: string) {
  const normalizedCandidate = normalizeName(candidate);
  const normalizedExisting = normalizeName(existingName);

  if (normalizedCandidate === normalizedExisting) {
    return true;
  }

  if (similarity(normalizedCandidate, normalizedExisting) >= 0.82) {
    return true;
  }

  const candidateTokens = meaningfulNameTokens(candidate);
  const existingTokens = meaningfulNameTokens(existingName);
  const sharedTokens = candidateTokens.filter((token) =>
    existingTokens.includes(token)
  );

  if (
    candidateTokens.length >= 2 &&
    existingTokens.length >= 2 &&
    similarity(candidateTokens[0]!, existingTokens[0]!) >= 0.72 &&
    similarity(candidateTokens.at(-1)!, existingTokens.at(-1)!) >= 0.67
  ) {
    return true;
  }

  if (
    sharedTokens.length > 0 &&
    tokenEnding(candidate, 3) === tokenEnding(existingName, 3)
  ) {
    return true;
  }

  const candidateSkeleton = consonantSkeleton(candidate);
  const existingSkeleton = consonantSkeleton(existingName);

  return (
    candidateSkeleton.length >= 4 &&
    existingSkeleton.length >= 4 &&
    candidateSkeleton === existingSkeleton &&
    vowelPattern(candidate) === vowelPattern(existingName)
  );
}

function batchHasTooMuchEnding(candidate: string, accepted: string[]) {
  const ending = tokenEnding(candidate, 4);

  if (ending.length < 3) {
    return false;
  }

  return accepted.filter((name) => tokenEnding(name, 4) === ending).length >= 3;
}

function batchHasTooMuchPrefix(candidate: string, accepted: string[]) {
  const prefix = meaningfulNameTokens(candidate)[0]?.slice(0, 3) ?? "";

  if (prefix.length < 3) {
    return false;
  }

  return accepted.filter((name) => meaningfulNameTokens(name)[0]?.startsWith(prefix)).length >= 2;
}

function roleBiasedParts(pool: BlendedStylePool, role: NameRole | undefined) {
  const hints = role ? pool.roleHints[role] ?? [] : [];

  return {
    roots: [
      ...pool.surnameRoots.filter((part) => hints.includes(part)),
      ...pool.surnameRoots
    ],
    suffixes: [
      ...pool.surnameSuffixes.filter((part) => hints.includes(part)),
      ...pool.surnameSuffixes
    ],
    standalone: [
      ...pool.standaloneSurnames.filter((part) =>
        hints.some((hint) => part.includes(hint))
      ),
      ...pool.standaloneSurnames
    ]
  };
}

function normalizeNameGender(gender: NameGender | undefined): NameGender {
  return gender ?? "any";
}

function genderedGivenNamePool(pool: BlendedStylePool, gender: NameGender | undefined) {
  const normalizedGender = normalizeNameGender(gender);

  if (normalizedGender === "masculine") {
    return masculineGivenNames;
  }

  if (normalizedGender === "feminine") {
    return feminineGivenNames;
  }

  if (normalizedGender === "neutral") {
    return neutralGivenNames;
  }

  return pool.standaloneGiven;
}

function makePersonName(
  pool: BlendedStylePool,
  random: RandomSource,
  role: NameRole | undefined,
  gender: NameGender | undefined
) {
  const normalizedGender = normalizeNameGender(gender);
  const useGenderedGiven = normalizedGender !== "any";
  const useStandaloneGiven = useGenderedGiven || random.next() < 0.34;
  const givenName = useStandaloneGiven
    ? choose(genderedGivenNamePool(pool, normalizedGender), random)
    : `${choose(pool.givenPrefixes, random)}${choose(pool.givenSuffixes, random)}`;
  const surnameParts = roleBiasedParts(pool, role);
  const useStandaloneSurname = random.next() < 0.42;
  const familyName = useStandaloneSurname
    ? choose(surnameParts.standalone, random)
    : `${choose(surnameParts.roots, random)}${choose(surnameParts.suffixes, random)}`;

  return {
    name: compactSpaces(`${givenName} ${familyName}`),
    givenName,
    familyName,
    gender: normalizedGender
  };
}

function makePlaceName(pool: BlendedStylePool, random: RandomSource, target: NameTarget) {
  const root = choose(pool.placeRoots, random);
  const suffix = choose(pool.placeSuffixes, random);
  const spaced = random.next() < 0.18;
  const name = target === "district" && random.next() < 0.35
    ? `${root} ${choose(["Court", "Market", "Row", "Ward", "Yard"], random)}`
    : spaced
      ? `${root} ${suffix[0]!.toUpperCase()}${suffix.slice(1)}`
      : `${root}${suffix}`;

  return {
    name: compactSpaces(name),
    givenName: root,
    familyName: suffix
  };
}

function makeTheName(adjectives: string[], nouns: string[], random: RandomSource) {
  const adjective = choose(adjectives, random);
  const noun = choose(nouns, random);
  return {
    name: compactSpaces(`The ${adjective} ${noun}`),
    givenName: adjective,
    familyName: noun
  };
}

function makeTavernName(pool: BlendedStylePool, random: RandomSource) {
  const adjective = choose(pool.tavernAdjectives, random);
  const noun = choose(pool.tavernNouns, random);
  const secondNoun = choose([...pool.tavernNouns, ...pool.artifactRoots], random);
  const placeRoot = choose(pool.placeRoots, random);
  const form = Math.floor(random.next() * 7);
  const name =
    form === 0
      ? `The ${adjective} ${noun}`
      : form === 1
        ? `The ${noun} and ${secondNoun}`
        : form === 2
          ? `${adjective} ${noun} Inn`
          : form === 3
            ? `${placeRoot} ${noun}`
            : form === 4
              ? `The ${noun} at ${placeRoot}`
              : form === 5
                ? `${placeRoot} Rest`
                : `The ${adjective} ${secondNoun}`;

  return {
    name: compactSpaces(name),
    givenName: adjective,
    familyName: noun
  };
}

function makeShipName(pool: BlendedStylePool, random: RandomSource) {
  const adjective = choose([...pool.tavernAdjectives, "Wandering", "Storm", "Silver"], random);
  const noun = choose([...pool.tavernNouns, "Promise", "Wager", "Wake", "Star"], random);
  const placeRoot = choose(pool.placeRoots, random);
  const artifactRoot = choose(pool.artifactRoots, random);
  const form = Math.floor(random.next() * 7);
  const name =
    form === 0
      ? `The ${adjective} ${noun}`
      : form === 1
        ? `${placeRoot}'s ${noun}`
        : form === 2
          ? `The ${noun} of ${placeRoot}`
          : form === 3
            ? `${adjective} ${artifactRoot}`
            : form === 4
              ? `The ${artifactRoot} Wake`
              : form === 5
                ? `${placeRoot} Promise`
                : `The ${adjective} ${placeRoot}`;

  return {
    name: compactSpaces(name),
    givenName: adjective,
    familyName: noun
  };
}

function makeFactionName(pool: BlendedStylePool, random: RandomSource) {
  const root = choose(pool.factionRoots, random);
  const descriptor = choose(
    [
      ...pool.placeRoots,
      ...pool.artifactRoots,
      ...pool.tavernAdjectives,
      ...pool.tavernNouns
    ],
    random
  );
  const secondDescriptor = choose(
    [
      ...pool.placeRoots,
      ...pool.artifactRoots,
      ...pool.tavernAdjectives,
      ...pool.tavernNouns
    ],
    random
  );
  const institution = choose(
    [
      "Accord",
      "Circle",
      "Compact",
      "Company",
      "Court",
      "Fellowship",
      "Guild",
      "House",
      "League",
      "Order",
      "Pact",
      "Watch"
    ],
    random
  );
  const form = Math.floor(random.next() * 8);
  const rootAlreadyInstitutional =
    /Guild|League|Compact|Company|Circle|Court|Watch|Choir|Clans|Union|College|Order|Concord|Fleet|Pilots|Wardens|Keepers|Speakers|Delvers|Archivists|Factors|Freeholders|Millers|Folk|Born/i.test(root);
  const name =
    form === 0
      ? `The ${descriptor} ${root}`
      : form === 1
        ? `The ${root} of ${descriptor}`
        : form === 2
          ? `The ${descriptor} ${institution}`
          : form === 3
            ? `${institution} of the ${descriptor} ${secondDescriptor}`
            : form === 4
              ? `The ${descriptor} and ${secondDescriptor} ${institution}`
              : form === 5
                ? `${descriptor} ${rootAlreadyInstitutional ? institution : root}`
                : form === 6
                  ? `The ${secondDescriptor} ${rootAlreadyInstitutional ? root : institution}`
                  : `${institution} of ${rootAlreadyInstitutional ? descriptor : root}`;

  return {
    name: compactSpaces(name),
    givenName: root,
    familyName: descriptor
  };
}

function makeArtifactName(pool: BlendedStylePool, random: RandomSource) {
  const adjective = choose(
    [
      "Ashen",
      "Black",
      "Bright",
      "Broken",
      "Buried",
      "Hidden",
      "Last",
      "Pale",
      "Red",
      "Silver",
      ...pool.tavernAdjectives
    ],
    random
  );
  const artifact = choose(pool.artifactRoots, random);
  const placeRoot = choose(pool.placeRoots, random);
  const familyRoot = choose(pool.surnameRoots, random);
  const suffix = choose(["Blade", "Charm", "Codex", "Crown", "Lens", "Mark", "Seal", "Stone", "Vessel"], random);
  const form = Math.floor(random.next() * 8);
  const name =
    form === 0
      ? `The ${adjective} ${artifact}`
      : form === 1
        ? `${artifact} of ${placeRoot}`
        : form === 2
          ? `The ${placeRoot} ${artifact}`
          : form === 3
            ? `${familyRoot}${suffix}`
            : form === 4
              ? `The ${artifact} ${suffix}`
              : form === 5
                ? `${adjective} ${placeRoot} ${suffix}`
                : form === 6
                  ? `The ${familyRoot} ${suffix}`
                  : `${placeRoot}'s ${artifact}`;

  return {
    name: compactSpaces(name),
    givenName: artifact,
    familyName: placeRoot
  };
}

function makeMonsterName(pool: BlendedStylePool, random: RandomSource) {
  const descriptor = choose(
    [
      "Ashen",
      "Bleak",
      "Bone",
      "Briar",
      "Cinder",
      "Crowned",
      "Dusk",
      "Frost",
      "Hollow",
      "Iron",
      "Moon",
      "Pale",
      "Red",
      "Root",
      "Salt",
      "Shard",
      "Storm",
      "Thorn",
      "Veil",
      ...pool.tavernAdjectives
    ],
    random
  );
  const creature = choose(
    [
      "Apparition",
      "Basilisk",
      "Beast",
      "Caller",
      "Crawler",
      "Drake",
      "Eater",
      "Fiend",
      "Gazer",
      "Giant",
      "Hound",
      "Hunter",
      "Lurker",
      "Maw",
      "Oracle",
      "Prince",
      "Queen",
      "Revenant",
      "Rider",
      "Serpent",
      "Shade",
      "Shrieker",
      "Sleeper",
      "Stalker",
      "Thing",
      "Wight",
      "Wraith",
      "Wyrm"
    ],
    random
  );
  const placeRoot = choose(pool.placeRoots, random);
  const artifactRoot = choose(pool.artifactRoots, random);
  const form = Math.floor(random.next() * 7);
  const name =
    form === 0
      ? `The ${descriptor} ${creature}`
      : form === 1
        ? `${placeRoot} ${creature}`
      : form === 2
          ? `The ${creature} of ${placeRoot}`
          : form === 3
            ? `${descriptor} ${artifactRoot} ${creature}`
            : form === 4
              ? `The ${placeRoot} Maw`
            : form === 5
              ? `${artifactRoot} Stalker`
              : `${placeRoot}'s ${descriptor} ${creature}`;

  return {
    name: compactSpaces(name),
    givenName: creature,
    familyName: placeRoot
  };
}

function makeCandidateName(
  pool: BlendedStylePool,
  random: RandomSource,
  role: NameRole | undefined,
  target: NameTarget,
  gender: NameGender | undefined
): NameCandidate {
  const parts: CandidateNameParts =
    target === "person" || target === "family" || target === "title"
      ? makePersonName(pool, random, role, target === "person" ? gender : undefined)
      : target === "tavern"
        ? makeTavernName(pool, random)
        : target === "ship"
          ? makeShipName(pool, random)
          : target === "faction"
            ? makeFactionName(pool, random)
            : target === "artifact"
              ? makeArtifactName(pool, random)
              : target === "monster"
                ? makeMonsterName(pool, random)
              : makePlaceName(pool, random, target);
  const name = target === "family" ? parts.familyName || parts.name : parts.name;

  return {
    name,
    givenName: parts.givenName,
    familyName: parts.familyName,
    ...(target === "person" && parts.gender ? { gender: parts.gender } : {}),
    cultureId: pool.id,
    cultureLabel: pool.label,
    target,
    styleIds: pool.styleIds,
    score: scoreName(name, pool, role, target)
  };
}

function scoreName(
  name: string,
  pool: BlendedStylePool,
  role: NameRole | undefined,
  target: NameTarget
) {
  const tokens = nameTokens(name);
  let score = 100;

  if (target === "person" && tokens.length !== 2) {
    score -= 12;
  }

  if (name.length >= 8 && name.length <= 26) {
    score += 8;
  }

  if (role) {
    const hints = pool.roleHints[role] ?? [];
    if (hints.some((hint) => name.includes(hint))) {
      score += 8;
    }
  }

  if (/[qxz]/i.test(name)) {
    score -= 3;
  }

  return score;
}

export function validateCandidateName(input: {
  candidate: string;
  existingNames?: string[] | undefined;
  avoidNames?: string[] | undefined;
  acceptedNames?: string[] | undefined;
}): NameValidationResult {
  const candidate = compactSpaces(input.candidate);
  const normalizedCandidate = normalizeName(candidate);
  const existingNames = [
    ...globalBannedNames,
    ...(input.existingNames ?? []),
    ...(input.avoidNames ?? []),
    ...(input.acceptedNames ?? [])
  ];
  const reasons: string[] = [];

  if (!hasPronounceableShape(candidate)) {
    reasons.push("name has an awkward or hard-to-pronounce shape");
  }

  if (sharesForbiddenPart(candidate)) {
    reasons.push("name uses an overfamiliar forbidden surname shape");
  }

  if (existingNames.some((name) => normalizeName(name) === normalizedCandidate)) {
    reasons.push("name exactly matches an existing or avoided name");
  }

  const nearDuplicate = existingNames.find((name) => isNearDuplicate(candidate, name));

  if (nearDuplicate) {
    reasons.push(`name is too similar to ${nearDuplicate}`);
  }

  if (batchHasTooMuchEnding(candidate, input.acceptedNames ?? [])) {
    reasons.push("name repeats a family-name ending already used in this batch");
  }

  if (batchHasTooMuchPrefix(candidate, input.acceptedNames ?? [])) {
    reasons.push("name repeats a given-name prefix too often in this batch");
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

export function generateNamePool(input: GenerateNamePoolInput = {}) {
  const target = targetForInput(input);
  const pool = poolForInput(input);
  const culture = cultureForNameRequest(input);
  const count = Math.max(1, Math.min(input.count ?? defaultNameCount, 40));
  const random = seededRandom(
    [
      input.seed ?? "ai-taverns-name-director",
      pool.id,
      pool.styleIds.join("+"),
      target,
      input.region ?? "",
      input.role ?? "",
      input.gender ?? "",
      input.kind ?? "",
      count
    ].join("|")
  );
  const accepted: NameCandidate[] = [];
  const rejected: Array<{ name: string; reasons: string[] }> = [];

  for (
    let attempt = 0;
    attempt < maxGeneratedNameAttempts && accepted.length < count;
    attempt += 1
  ) {
    const candidate = makeCandidateName(
      pool,
      random,
      input.role,
      target,
      input.gender
    );
    const validation = validateCandidateName({
      candidate: candidate.name,
      existingNames: input.existingNames,
      avoidNames: input.avoidNames,
      acceptedNames: accepted.map((name) => name.name)
    });

    if (validation.ok) {
      accepted.push(candidate);
    } else {
      rejected.push({
        name: candidate.name,
        reasons: validation.reasons
      });
    }
  }

  return {
    culture,
    names: accepted.sort((left, right) => right.score - left.score),
    rejected
  };
}

const promptTargetLabels: Record<NameTarget, string> = {
  person: "People",
  family: "Families",
  settlement: "Settlements and landmarks",
  district: "Districts",
  tavern: "Taverns and inns",
  ship: "Ships",
  road: "Roads",
  ruin: "Ruins",
  temple: "Temples and shrines",
  faction: "Factions and organizations",
  artifact: "Artifacts and objects",
  monster: "Threats and creatures",
  title: "Titles"
};

const defaultPromptNameTargets: NameTarget[] = [
  "person",
  "family",
  "settlement",
  "tavern",
  "faction",
  "artifact",
  "monster"
];

export function formatNameDirectorPromptContext(
  input: NameDirectorPromptContextInput = {}
) {
  const targets = input.targets?.length ? input.targets : defaultPromptNameTargets;
  const perTargetCount = Math.max(2, Math.min(input.perTargetCount ?? 8, 16));
  const existingNames = input.existingNames ?? [];
  const sections = targets
    .map((target) => {
      const pool = generateNamePool({
        ...input,
        target,
        count: perTargetCount,
        seed: [
          input.seed ?? "prompt-name-bank",
          target,
          input.world ?? "",
          input.region ?? ""
        ].join("|"),
        existingNames
      });
      const names = pool.names.map((candidate) => candidate.name);

      if (names.length === 0) {
        return "";
      }

      return `${promptTargetLabels[target]}: ${names.join(", ")}`;
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return "";
  }

  return [
    input.heading ?? "Suggested name bank:",
    "Use these validated candidate names preferentially when inventing new people, families, places, factions, taverns, objects, or threats. Do not force every name into the output. Do not rename any player-authored or already established names.",
    ...sections
  ].join("\n");
}
