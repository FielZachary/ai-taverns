const backstoryBoundary =
  "Backstory Expansion|Core Stats|Ability Scores|Saving Throws|Skills|Proficiencies and Languages|Attacks|Features and Traits|Equipment|Inventory|Currency|Spells|DM Brief|Level Progression|Appearance|Personality|Notes";

export type BackstoryGlossaryEntry = {
  term: string;
  definition: string;
  aliases?: string[];
};

export const eldermereBackstoryGlossary: BackstoryGlossaryEntry[] = [
  {
    term: "Ashfell Marches",
    definition:
      "A northern highland region of open moor, clan holdings, oath politics, and hard-won border settlements."
  },
  {
    term: "Oath-Ring Warden",
    aliases: ["Oath Warden"],
    definition:
      "A Marcher title for the leader trusted to hold clan oaths together when rival families, claimants, and warbands threaten to fracture them."
  },
  {
    term: "Ferrant Concord",
    definition:
      "A hard industrial power in the eastern mountains, known for foundries, mercenary contracts, fortified towns, and weapon trade."
  },
  {
    term: "Thornwake Vale",
    definition:
      "A deep western forest-vale where old roads, market towns, and older powers meet beneath a dangerous green canopy."
  },
  {
    term: "Sallowholt",
    definition:
      "A Thornwake Vale settlement on the forest edge, useful to traders, scouts, smugglers, and anyone following rumors through the woods."
  },
  {
    term: "Suncross",
    definition:
      "The bright crossroads settlement of Cael Ambrose, where heartland roads, farms, and obligations gather."
  },
  {
    term: "Cael Ambrose",
    definition:
      "Eldermere's fertile heartland, shaped by roads, farms, noble duties, and old claims."
  },
  {
    term: "Salt Concordat",
    definition:
      "A coastal sea power of ports, ships, lighthouse holdings, and haunted waters around the Drowned City."
  },
  {
    term: "Drowned City",
    definition:
      "A luminous ruin beneath the Salt Concordat's waters, remembered as one of Eldermere's strangest old scars."
  },
  {
    term: "Cinderspine",
    definition:
      "Volcanic mountain country of iron towns, smoke, ore, and severe bargains."
  },
  {
    term: "Sundered Vale",
    definition:
      "Broken ground marked by ruin and blue fire, where the old catastrophe has never gone fully quiet."
  }
];

function normalizeBackstoryText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sentenceChunks(value: string) {
  return value
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

export function formatBackstoryParagraphs(backstory: string) {
  const normalizedBackstory = normalizeBackstoryText(backstory);

  if (!normalizedBackstory) {
    return [];
  }

  const explicitParagraphs = normalizedBackstory
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  const sentences = sentenceChunks(normalizedBackstory);
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }

  return paragraphs.length > 0 ? paragraphs : [normalizedBackstory];
}

function glossaryPattern(value: string) {
  return new RegExp(
    `\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i"
  );
}

export function glossaryEntriesForBackstory(backstory: string) {
  return eldermereBackstoryGlossary.filter((entry) =>
    [entry.term, ...(entry.aliases ?? [])].some((term) =>
      glossaryPattern(term).test(backstory)
    )
  );
}

export function extractPlayerBackstory(characterSheet: string) {
  const normalizedSheet = characterSheet.replace(/\r\n/g, "\n");
  const labelledBackstory = normalizedSheet.match(
    new RegExp(
      `(?:^|\\n)(?:#{1,6}\\s*)?Backstory\\s*\\n([\\s\\S]*?)(?=\\n(?:#{1,6}\\s*)?(?:${backstoryBoundary})\\b|$)`,
      "i"
    )
  );

  if (labelledBackstory?.[1]) {
    return normalizeBackstoryText(labelledBackstory[1]);
  }

  const inlineBackstory = normalizedSheet.match(
    /(?:^|\n)(?:Backstory|Background)\s*:\s*([^\n]+(?:\n(?![A-Z][A-Za-z ]+:\s).+)*)/i
  );

  return inlineBackstory?.[1] ? normalizeBackstoryText(inlineBackstory[1]) : "";
}
