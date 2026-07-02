"use client";

import { X } from "lucide-react";

type CharacterSheetOverlayProps = {
  characterSheet: string;
  onClose: () => void;
};

type ParsedSheet = {
  fields: Record<string, string>;
  sections: Record<string, string[]>;
  raw: string;
};

const abilityNames = [
  "Strength",
  "Dexterity",
  "Constitution",
  "Intelligence",
  "Wisdom",
  "Charisma"
];

const skillNames = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival"
];

const topFields = [
  {
    label: "Class & Level",
    value: (sheet: ParsedSheet) =>
      `${fieldValue(sheet, ["Class"])} / ${fieldValue(sheet, ["Level"])}`
  },
  {
    label: "Background",
    value: (sheet: ParsedSheet) => fieldValue(sheet, ["Background"])
  },
  {
    label: "Player Name",
    value: (sheet: ParsedSheet) => fieldValue(sheet, ["Player Name"])
  },
  {
    label: "Species",
    value: (sheet: ParsedSheet) => fieldValue(sheet, ["Species", "Race", "Ancestry"])
  },
  {
    label: "Alignment",
    value: (sheet: ParsedSheet) => fieldValue(sheet, ["Alignment"])
  },
  {
    label: "Experience Points",
    value: () => "-"
  }
];

const knownSections = new Set([
  "Core Stats",
  "Ability Scores",
  "Saving Throws",
  "Skills",
  "Proficiencies and Languages",
  "Attacks",
  "Features and Traits",
  "Equipment",
  "Spells",
  "Personality",
  "Inventory",
  "Notes",
  "DM Brief"
]);

function parseCharacterSheet(rawSheet: string): ParsedSheet {
  const fields: Record<string, string> = {};
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  rawSheet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        return;
      }

      if (knownSections.has(line)) {
        currentSection = line;
        sections[currentSection] ??= [];
        return;
      }

      const fieldMatch = line.match(/^([^:]+):\s*(.*)$/);

      if (fieldMatch) {
        const [, key, value] = fieldMatch;
        const trimmedKey = key.trim();
        const trimmedValue = value.trim();

        if (currentSection) {
          sections[currentSection] ??= [];
          sections[currentSection].push(line);
        } else {
          fields[trimmedKey] = trimmedValue;
        }

        fields[trimmedKey] = trimmedValue;
        return;
      }

      if (currentSection) {
        sections[currentSection] ??= [];
        sections[currentSection].push(line);
        return;
      }

      sections.Notes ??= [];
      sections.Notes.push(line);
    });

  return { fields, sections, raw: rawSheet };
}

function fieldValue(sheet: ParsedSheet, labels: string[], fallback = "-") {
  for (const label of labels) {
    const value = sheet.fields[label]?.trim();

    if (value) {
      return value;
    }
  }

  return fallback;
}

function parseScore(line: string) {
  const [, label = "", score = "", modifier = ""] =
    line.match(/^([^:]+):\s*(\d+)?\s*(?:\(([^)]+)\))?/) ?? [];

  return {
    label: label.trim(),
    score: score.trim() || "-",
    modifier: modifier.trim() || "-"
  };
}

function findSectionLine(sheet: ParsedSheet, section: string, label: string) {
  return sheet.sections[section]?.find((line) => line.startsWith(`${label}:`));
}

function statValue(sheet: ParsedSheet, label: string, fallback = "-") {
  const line = findSectionLine(sheet, "Core Stats", label);

  return line?.split(":").slice(1).join(":").trim() || fieldValue(sheet, [label], fallback);
}

function listWithoutLabels(lines: string[] = []) {
  return lines.map((line) => line.replace(/^[^:]+:\s*/, "").trim()).filter(Boolean);
}

function SheetBox({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="dnd-sheet-box">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function LinedPanel({
  title,
  lines,
  empty = "-"
}: {
  title: string;
  lines?: string[];
  empty?: string;
}) {
  const visibleLines = lines?.filter(Boolean) ?? [];

  return (
    <section className="dnd-sheet-lined-panel">
      <div className="dnd-sheet-lined-content">
        {visibleLines.length > 0 ? (
          visibleLines.map((line, index) => <p key={`${title}-${index}`}>{line}</p>)
        ) : (
          <p>{empty}</p>
        )}
      </div>
      <h3>{title}</h3>
    </section>
  );
}

export function CharacterSheetOverlay({
  characterSheet,
  onClose
}: CharacterSheetOverlayProps) {
  const sheet = parseCharacterSheet(characterSheet.trim());
  const abilityLines = abilityNames.map(
    (ability) =>
      findSectionLine(sheet, "Ability Scores", ability) ?? `${ability}:`
  );
  const savingThrowLines = abilityNames.map(
    (ability) =>
      findSectionLine(sheet, "Saving Throws", ability) ?? `${ability}:`
  );
  const skillLines =
    sheet.sections.Skills?.filter((line) =>
      skillNames.some((skill) => line.startsWith(`${skill}:`))
    ) ?? [];
  const attackLines = sheet.sections.Attacks ?? [];
  const featureLines = sheet.sections["Features and Traits"] ?? [];
  const equipmentLines = sheet.sections.Equipment ?? sheet.sections.Inventory ?? [];
  const proficiencyLines = sheet.sections["Proficiencies and Languages"] ?? [];
  const spells = sheet.sections.Spells ?? [];
  const dmBrief = sheet.sections["DM Brief"] ?? [];

  return (
    <section
      className="character-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-sheet-title"
    >
      <div className="character-sheet-overlay-panel dnd-sheet">
        <header className="dnd-sheet-header">
          <div className="dnd-sheet-nameplate">
            <span>Character Name</span>
            <h2 id="character-sheet-title">
              {fieldValue(sheet, ["Character Name", "Name"], "Unnamed Adventurer")}
            </h2>
          </div>
          <div className="dnd-sheet-meta-grid">
            {topFields.map((field) => (
              <div key={field.label}>
                <strong>{field.value(sheet)}</strong>
                <span>{field.label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close character sheet"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="dnd-sheet-body">
          <section className="dnd-sheet-left">
            <SheetBox
              label="Proficiency Bonus"
              value={statValue(sheet, "Proficiency Bonus")}
            />
            <div className="dnd-ability-list">
              {abilityLines.map((line) => {
                const ability = parseScore(line);
                const saveLine =
                  savingThrowLines.find((save) => save.startsWith(`${ability.label}:`)) ??
                  "";

                return (
                  <article className="dnd-ability-card" key={ability.label}>
                    <div className="dnd-ability-score">
                      <strong>{ability.score}</strong>
                      <span>{ability.modifier}</span>
                    </div>
                    <h3>{ability.label}</h3>
                    <p>{saveLine || "Saving Throw -"}</p>
                  </article>
                );
              })}
            </div>
            <SheetBox
              label="Passive Wisdom (Perception)"
              value={fieldValue(sheet, ["Passive Perception"])}
            />
            <LinedPanel title="Skills" lines={skillLines} />
            <LinedPanel
              title="Other Proficiencies & Languages"
              lines={proficiencyLines}
            />
          </section>

          <section className="dnd-sheet-center">
            <div className="dnd-combat-grid">
              <SheetBox label="Armor Class" value={statValue(sheet, "Armor Class")} />
              <SheetBox label="Initiative" value={statValue(sheet, "Initiative")} />
              <SheetBox label="Speed" value={statValue(sheet, "Speed")} />
            </div>
            <LinedPanel
              title="Hit Points"
              lines={[
                `Max: ${statValue(sheet, "Max HP")}`,
                `Current: ${statValue(sheet, "Current HP")}`,
                `Temporary: ${statValue(sheet, "Temporary HP")}`,
                `Hit Dice: ${statValue(sheet, "Hit Dice")}`
              ]}
            />
            <LinedPanel title="Attacks & Spellcasting" lines={attackLines} />
            <LinedPanel title="Equipment" lines={equipmentLines} />
          </section>

          <section className="dnd-sheet-right">
            <LinedPanel
              title="Personality Traits"
              lines={listWithoutLabels(sheet.sections.Personality)}
            />
            <LinedPanel title="Ideals" lines={[]} />
            <LinedPanel title="Bonds" lines={[]} />
            <LinedPanel title="Flaws" lines={[]} />
            <LinedPanel title="Features & Traits" lines={featureLines} />
            <LinedPanel title="Spells" lines={spells} empty="None" />
            <LinedPanel title="DM Brief" lines={dmBrief} />
          </section>
        </div>
      </div>
    </section>
  );
}
