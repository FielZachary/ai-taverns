const backstoryBoundary =
  "Backstory Expansion|Core Stats|Ability Scores|Saving Throws|Skills|Proficiencies and Languages|Attacks|Features and Traits|Equipment|Inventory|Currency|Spells|DM Brief|Level Progression|Appearance|Personality|Notes";

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
