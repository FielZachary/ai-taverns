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
