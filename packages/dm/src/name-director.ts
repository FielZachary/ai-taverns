import { eldermereRegions } from "./flagship-world.js";

export type NameKind = "npc" | "place" | "faction" | "family" | "title";

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

export type NameCulture = {
  id: string;
  label: string;
  world: string;
  regions: string[];
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
  cultureId: string;
  cultureLabel: string;
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
  role?: NameRole | undefined;
  kind?: NameKind | undefined;
  count?: number | undefined;
  seed?: string | undefined;
  existingNames?: string[] | undefined;
  avoidNames?: string[] | undefined;
};

type RandomSource = {
  next(): number;
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

const globalBannedSurnameParts = [
  "Vael",
  "Vale",
  "Vell",
  "Venn",
  "Vey"
];

const causticClusters = [
  "aa",
  "aei",
  "rrx",
  "xq",
  "qx",
  "kkk",
  "rrr",
  "'''",
  "--"
];

const defaultNameCount = 12;
const maxGeneratedNameAttempts = 260;

const baseCulture: NameCulture = {
  id: "eldermere-general",
  label: "Eldermere Common",
  world: "Eldermere",
  regions: eldermereRegions.map((region) => region.name),
  givenPrefixes: [
    "Ald",
    "Bren",
    "Cor",
    "Dessa",
    "Edr",
    "Fenn",
    "Garr",
    "Harl",
    "Iven",
    "Jessa",
    "Lorn",
    "Nessa",
    "Orin",
    "Pella",
    "Rusk",
    "Sella",
    "Tams",
    "Wren"
  ],
  givenSuffixes: [
    "a",
    "an",
    "ard",
    "el",
    "en",
    "eth",
    "ic",
    "in",
    "or",
    "ra"
  ],
  standaloneGiven: [
    "Ansel",
    "Bram",
    "Cora",
    "Dain",
    "Edda",
    "Garrick",
    "Hessa",
    "Ilan",
    "Joren",
    "Lysa",
    "Noll",
    "Perrin",
    "Rotha",
    "Soren",
    "Tilda",
    "Willa"
  ],
  surnameRoots: [
    "Ash",
    "Bell",
    "Cairn",
    "Dawn",
    "Ember",
    "Frost",
    "Gate",
    "Hearth",
    "Iron",
    "Lantern",
    "Morrow",
    "Reed",
    "Road",
    "Stone",
    "Thorn",
    "Ward"
  ],
  surnameSuffixes: [
    "brook",
    "cross",
    "ford",
    "glass",
    "hall",
    "holt",
    "mark",
    "mere",
    "ridge",
    "ward"
  ],
  standaloneSurnames: [
    "Ashbrook",
    "Bellweather",
    "Dawnglass",
    "Emberhall",
    "Gateward",
    "Hearthcross",
    "Lanternmere",
    "Morrowmark",
    "Reedholt",
    "Stoneford"
  ],
  roleHints: {
    authority: ["Iron", "Ward", "Hall", "Mark"],
    family: ["Hearth", "Reed", "Brook", "Morrow"],
    merchant: ["Gate", "Road", "Cross", "Mark"],
    mystic: ["Ash", "Dawn", "Glass", "Ember"],
    patron: ["Lantern", "Ward", "Hearth", "Road"],
    rival: ["Iron", "Thorn", "Cairn", "Frost"]
  }
};

const eldermereCultures: NameCulture[] = [
  {
    ...baseCulture,
    id: "eldermere-cael-ambrose",
    label: "Cael Ambrose",
    regions: ["Cael Ambrose"],
    givenPrefixes: ["Ald", "Bren", "Cai", "Dessa", "Edric", "Garr", "Joss", "Lorn", "Merr", "Sern"],
    givenSuffixes: ["a", "an", "ard", "el", "en", "ic", "or", "yn"],
    surnameRoots: ["Guest", "Hearth", "Road", "Sern", "Sun", "Thistle", "Wain", "Warden"],
    surnameSuffixes: ["bridge", "cross", "field", "ford", "hall", "mark", "stead", "ward"],
    standaloneSurnames: ["Guestward", "Hearthford", "Suncross", "Thistlemark", "Wainstead"]
  },
  {
    ...baseCulture,
    id: "eldermere-thornwake-vale",
    label: "Thornwake Vale",
    regions: ["Thornwake Vale"],
    givenPrefixes: ["Bria", "Erl", "Fern", "Hessa", "Ivr", "Leth", "Moss", "Nara", "Sylla", "Tovin"],
    givenSuffixes: ["a", "an", "el", "eth", "in", "ra", "un"],
    surnameRoots: ["Bramble", "Elder", "Fern", "Grove", "Root", "Sallow", "Thorn", "Willow"],
    surnameSuffixes: ["bark", "brook", "hollow", "holt", "root", "shade", "wake", "wood"],
    standaloneSurnames: ["Brambleholt", "Elderroot", "Fernhollow", "Sallowshade", "Willowwake"]
  },
  {
    ...baseCulture,
    id: "eldermere-ferrant-concord",
    label: "Ferrant Concord",
    regions: ["The Ferrant Concord"],
    givenPrefixes: ["Beld", "Cort", "Durn", "Farr", "Gris", "Halk", "Jor", "Kessa", "Orr", "Tarn"],
    givenSuffixes: ["a", "an", "ek", "ic", "in", "or", "um"],
    surnameRoots: ["Anvil", "Crag", "Dredge", "Gear", "Iron", "Kiln", "Rivet", "Steel"],
    surnameSuffixes: ["brand", "hall", "hold", "mark", "shaft", "spur", "wright"],
    standaloneSurnames: ["Anvilmark", "Cragspur", "Dredgehall", "Ironwright", "Kilnbrand"]
  },
  {
    ...baseCulture,
    id: "eldermere-salt-concordat",
    label: "Salt Concordat",
    regions: ["The Salt Concordat"],
    givenPrefixes: ["Bria", "Cor", "Dessa", "Ivr", "Mael", "Nessa", "Os", "Sella", "Torr", "Yrin"],
    givenSuffixes: ["a", "an", "en", "ic", "in", "or", "ra"],
    surnameRoots: ["Brine", "Harbor", "Keel", "Ledger", "Salt", "Skerry", "Tide", "Wake"],
    surnameSuffixes: ["hook", "lock", "mark", "mere", "scribe", "ward", "watch"],
    standaloneSurnames: ["Brinehook", "Keelmark", "Saltmere", "Skerrywatch", "Tidelock"]
  },
  {
    ...baseCulture,
    id: "eldermere-ashfell-marches",
    label: "Ashfell Marches",
    regions: ["Ashfell Marches"],
    givenPrefixes: ["Ard", "Bar", "Drok", "Edda", "Falk", "Grim", "Harl", "Korr", "Runa", "Vosk"],
    givenSuffixes: ["a", "an", "ek", "eth", "or", "un"],
    surnameRoots: ["Ash", "Bone", "Cinder", "Grey", "Mare", "Oath", "Ridge", "Ward"],
    surnameSuffixes: ["fell", "grip", "hollow", "rider", "ring", "stone", "watch"],
    standaloneSurnames: ["Ashring", "Bonehollow", "Cinderwatch", "Oathrider", "Ridgegrip"]
  },
  {
    ...baseCulture,
    id: "eldermere-veiled-reach",
    label: "Veiled Reach",
    regions: ["The Veiled Reach"],
    givenPrefixes: ["Asha", "Dalim", "Eris", "Hale", "Ishan", "Lira", "Mira", "Nadir", "Oren", "Selis"],
    givenSuffixes: ["a", "an", "el", "im", "ir", "ra", "us"],
    surnameRoots: ["Archive", "Ashen", "Candle", "Dream", "Mask", "Script", "Thanewell", "Veil"],
    surnameSuffixes: ["bind", "glass", "keeper", "rest", "scribe", "shade", "well"],
    standaloneSurnames: ["Ashenscribe", "Candlekeeper", "Maskshade", "Thanewell", "Veilrest"]
  },
  {
    ...baseCulture,
    id: "eldermere-sundered-vale",
    label: "Sundered Vale",
    regions: ["The Sundered Vale"],
    givenPrefixes: ["Amm", "Cask", "Dren", "Elda", "Korr", "Lysk", "Nim", "Perr", "Rill", "Sable"],
    givenSuffixes: ["a", "an", "el", "et", "ic", "in", "or"],
    surnameRoots: ["Claim", "Glass", "Rim", "Shard", "Stake", "Sunder", "Vail", "Well"],
    surnameSuffixes: ["choir", "gate", "hold", "mark", "shaft", "stake", "watch"],
    standaloneSurnames: ["Claimstake", "Rimshaft", "Shardwatch", "Stakehold", "Wellmark"]
  },
  baseCulture
];

export const nameCultures: NameCulture[] = eldermereCultures;

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

function hasPronounceableShape(name: string) {
  const normalized = normalizeName(name);

  if (normalized.length < 5 || normalized.length > 30) {
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
  const token = finalToken(value);
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

  const candidateTokens = nameTokens(candidate);
  const existingTokens = nameTokens(existingName);
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

  if (sharedTokens.length > 0 && tokenEnding(candidate, 3) === tokenEnding(existingName, 3)) {
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
  const prefix = nameTokens(candidate)[0]?.slice(0, 3) ?? "";

  if (prefix.length < 3) {
    return false;
  }

  return accepted.filter((name) => nameTokens(name)[0]?.startsWith(prefix)).length >= 2;
}

function roleBiasedSurnameParts(culture: NameCulture, role: NameRole | undefined) {
  const hints = role ? culture.roleHints[role] ?? [] : [];

  return {
    roots: [
      ...culture.surnameRoots.filter((part) => hints.includes(part)),
      ...culture.surnameRoots
    ],
    suffixes: [
      ...culture.surnameSuffixes.filter((part) => hints.includes(part)),
      ...culture.surnameSuffixes
    ],
    standalone: [
      ...culture.standaloneSurnames.filter((part) =>
        hints.some((hint) => part.includes(hint))
      ),
      ...culture.standaloneSurnames
    ]
  };
}

function makeCandidateName(
  culture: NameCulture,
  random: RandomSource,
  role: NameRole | undefined
): NameCandidate {
  const useStandaloneGiven = random.next() < 0.34;
  const givenName = useStandaloneGiven
    ? choose(culture.standaloneGiven, random)
    : `${choose(culture.givenPrefixes, random)}${choose(culture.givenSuffixes, random)}`;
  const surnameParts = roleBiasedSurnameParts(culture, role);
  const useStandaloneSurname = random.next() < 0.42;
  const familyName = useStandaloneSurname
    ? choose(surnameParts.standalone, random)
    : `${choose(surnameParts.roots, random)}${choose(surnameParts.suffixes, random)}`;
  const name = compactSpaces(`${givenName} ${familyName}`);

  return {
    name,
    givenName,
    familyName,
    cultureId: culture.id,
    cultureLabel: culture.label,
    score: scoreName(name, culture, role)
  };
}

function scoreName(name: string, culture: NameCulture, role: NameRole | undefined) {
  const tokens = nameTokens(name);
  let score = 100;

  if (tokens.length !== 2) {
    score -= 12;
  }

  if (name.length >= 12 && name.length <= 22) {
    score += 8;
  }

  if (role) {
    const hints = culture.roleHints[role] ?? [];
    if (hints.some((hint) => name.includes(hint))) {
      score += 8;
    }
  }

  if (/[qxz]/i.test(name)) {
    score -= 3;
  }

  return score;
}

export function cultureForNameRequest(input: GenerateNamePoolInput) {
  if (input.cultureId) {
    const culture = nameCultures.find((candidate) => candidate.id === input.cultureId);

    if (culture) {
      return culture;
    }
  }

  if (input.region) {
    const normalizedRegion = normalizeName(input.region);
    const culture = nameCultures.find((candidate) =>
      candidate.regions.some((region) => normalizeName(region) === normalizedRegion)
    );

    if (culture) {
      return culture;
    }
  }

  if (normalizeName(input.world ?? "") === "eldermere") {
    return baseCulture;
  }

  return baseCulture;
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
  const culture = cultureForNameRequest(input);
  const count = Math.max(1, Math.min(input.count ?? defaultNameCount, 40));
  const random = seededRandom(
    [
      input.seed ?? "ai-taverns-name-director",
      culture.id,
      input.region ?? "",
      input.role ?? "",
      input.kind ?? "npc",
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
    const candidate = makeCandidateName(culture, random, input.role);
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
