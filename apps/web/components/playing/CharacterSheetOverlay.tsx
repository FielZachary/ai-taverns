"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound, X } from "lucide-react";
import type { CampaignNpcCard } from "@/lib/campaign-api";
import {
  spellDetailFor,
  spellEffectSummaryFor,
  type SpellLevelLabel
} from "@/app/new-adventure/new-adventure-form";
import {
  extractPlayerBackstory,
  formatBackstoryParagraphs
} from "./backstory-intro";

type CharacterSheetOverlayProps = {
  characterSheet: string;
  initialTab?: PlayerResourcesTab;
  portraitUrl?: string;
  isLoadingNpcCards?: boolean;
  npcCards?: CampaignNpcCard[];
  npcCardsError?: string;
  onClose: () => void;
  onNpcCardUpdate?: (input: {
    npcCardId: string;
    markdown: string;
  }) => Promise<CampaignNpcCard>;
};

type ParsedSheet = {
  fields: Record<string, string>;
  sections: Record<string, string[]>;
  raw: string;
};

type SheetTableRow = {
  name: string;
  range: string;
  hitDc: string;
  effect: string;
  onClick?: () => void;
};

export type PlayerResourcesTab =
  | "character_sheet"
  | "inventory"
  | "weapons_spells"
  | "backstory"
  | "npc_cards"
  | "eldermere_lore";

type ParsedNpcCard = CampaignNpcCard & {
  fields: Record<string, string>;
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
    label: "Gender",
    value: (sheet: ParsedSheet) => fieldValue(sheet, ["Gender"])
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
  "Inventory",
  "Currency",
  "Spells",
  "Personality",
  "Notes",
  "DM Brief"
]);

const npcFieldLabels = [
  "Name",
  "Location",
  "Appearance",
  "Personality",
  "Motivations",
  "Disposition Towards You",
  "Known History",
  "Secrets",
  "Open Threads",
  "Last Seen"
];

const compactNpcFields = new Set(["Name", "Location", "Last Seen"]);

const playerResourceTabs: { id: PlayerResourcesTab; label: string }[] = [
  { id: "character_sheet", label: "Character Sheet" },
  { id: "inventory", label: "Inventory" },
  { id: "weapons_spells", label: "Weapons & Spells" },
  { id: "backstory", label: "Backstory" },
  { id: "npc_cards", label: "NPC Cards" },
  { id: "eldermere_lore", label: "Eldermere Lore" }
];

const playerResourceTitleIds: Record<PlayerResourcesTab, string> = {
  character_sheet: "character-sheet-title",
  inventory: "player-inventory-title",
  weapons_spells: "player-weapons-spells-title",
  backstory: "player-backstory-title",
  npc_cards: "npc-cards-title",
  eldermere_lore: "eldermere-lore-title"
};

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

function parseNpcCard(card: CampaignNpcCard): ParsedNpcCard {
  const fields = Object.fromEntries(
    npcFieldLabels.map((label) => [label, "Unknown."])
  );
  let currentField = "";
  const title =
    card.markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || card.title || "NPC";

  for (const rawLine of card.markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(.+)$/);

    if (heading) {
      currentField = heading[1]?.trim() ?? "";
      if (npcFieldLabels.includes(currentField)) {
        fields[currentField] = "";
      }
      continue;
    }

    if (!currentField || !npcFieldLabels.includes(currentField)) {
      continue;
    }

    const line = rawLine.trimEnd();
    fields[currentField] = fields[currentField]
      ? `${fields[currentField]}\n${line}`.trim()
      : line.trim();
  }

  return {
    ...card,
    title,
    fields: Object.fromEntries(
      npcFieldLabels.map((label) => [
        label,
        fields[label]?.trim() || "Unknown."
      ])
    )
  };
}

function npcFieldPreview(value: string) {
  const line = value
    .split(/\r?\n/)
    .map((part) => part.replace(/^[-*]\s*/, "").trim())
    .find(Boolean);

  return line && line !== "Unknown." ? line : "Unknown";
}

function npcMarkdownFromFields(fields: Record<string, string>) {
  const name = fields.Name?.trim() || "Unnamed NPC";

  return [
    `# ${name}`,
    "",
    ...npcFieldLabels.flatMap((label) => [
      `## ${label}`,
      fields[label]?.trim() || "Unknown.",
      ""
    ])
  ].join("\n").trim();
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

function spellStatValue(lines: string[], label: string) {
  const line = lines.find((spellLine) =>
    spellLine.toLowerCase().startsWith(`${label.toLowerCase()}:`)
  );

  return line?.split(":").slice(1).join(":").trim() ?? "";
}

function parseAttackLine(line: string): SheetTableRow {
  const [rawName = line, rawDetails = ""] = line.split(/:\s(.+)/);
  const detailParts = rawDetails
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const rangeIndex = detailParts.findIndex((part) =>
    /\b(range|thrown|reach)\b/i.test(part)
  );
  const hitDcIndex = detailParts.findIndex((part) =>
    /\b(to hit|dc|save)\b/i.test(part)
  );
  const range = rangeIndex >= 0 ? detailParts.splice(rangeIndex, 1)[0] : "";
  const adjustedHitDcIndex =
    rangeIndex >= 0 && hitDcIndex > rangeIndex ? hitDcIndex - 1 : hitDcIndex;
  const hitDc =
    adjustedHitDcIndex >= 0 ? detailParts.splice(adjustedHitDcIndex, 1)[0] : "";

  return {
    name: rawName.trim(),
    range,
    hitDc,
    effect: detailParts.join(", ")
  };
}

function spellTableRow(
  name: string,
  level: SpellLevelLabel | null,
  spellStats: { attackBonus: string; saveDc: string }
): SheetTableRow {
  const spellDetail = spellDetailFor(name, level);
  const rollText = spellDetail.rolls;

  return {
    name,
    range: spellDetail.range,
    hitDc: spellHitDcForRolls(rollText, spellStats),
    effect: spellEffectSummaryFor(name)
  };
}

function spellHitDcForRolls(
  rolls: string,
  spellStats: { attackBonus: string; saveDc: string }
) {
  if (/^Resolve with your spell save DC or spell attack bonus/i.test(rolls)) {
    return "Varies";
  }

  if (/spell attack roll/i.test(rolls)) {
    return spellStats.attackBonus
      ? `Spell attack ${spellStats.attackBonus}`
      : "Spell attack";
  }

  if (/saving throw|spell save dc/i.test(rolls)) {
    return spellStats.saveDc ? `DC ${spellStats.saveDc}` : "Spell save DC";
  }

  if (/no attack roll|usually no attack roll/i.test(rolls)) {
    return "No attack roll";
  }

  if (/healing|temporary hit point/i.test(rolls)) {
    return "Healing roll";
  }

  return "Varies";
}

const spellLevels: Record<string, string> = {
  "Absorb Elements": "Level 1",
  Aid: "Level 2",
  "Armor of Agathys": "Level 1",
  Bless: "Level 1",
  "Burning Hands": "Level 1",
  "Call Lightning": "Level 3",
  "Charm Person": "Level 1",
  Command: "Level 1",
  "Cure Wounds": "Level 1",
  "Detect Magic": "Level 1",
  "Dissonant Whispers": "Level 1",
  "Eldritch Blast": "Cantrips",
  Entangle: "Level 1",
  "Faerie Fire": "Level 1",
  Fireball: "Level 3",
  "Fire Bolt": "Cantrips",
  Goodberry: "Level 1",
  Guidance: "Cantrips",
  "Guiding Bolt": "Level 1",
  "Healing Word": "Level 1",
  "Hellish Rebuke": "Level 1",
  "Hex": "Level 1",
  "Hunger of Hadar": "Level 3",
  "Hypnotic Pattern": "Level 3",
  Invisibility: "Level 2",
  "Lesser Restoration": "Level 2",
  "Mage Armor": "Level 1",
  "Mage Hand": "Cantrips",
  "Magic Missile": "Level 1",
  "Mirror Image": "Level 2",
  "Misty Step": "Level 2",
  Moonbeam: "Level 2",
  "Pass without Trace": "Level 2",
  Prestidigitation: "Cantrips",
  "Produce Flame": "Cantrips",
  Revivify: "Level 3",
  "Sacred Flame": "Cantrips",
  Shield: "Level 1",
  "Shield of Faith": "Level 1",
  "Speak with Animals": "Level 1",
  "Spike Growth": "Level 2",
  "Spiritual Weapon": "Level 2",
  Suggestion: "Level 2",
  "Vicious Mockery": "Cantrips",
  Web: "Level 2",
  "Wrathful Smite": "Level 1"
};

const spellGroupOrder = [
  "Cantrips",
  "Level 1",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
  "Level 6",
  "Level 7",
  "Level 8",
  "Level 9",
  "Other"
];

const spellLevelLabels: Record<string, SpellLevelLabel> = {
  Cantrips: "Cantrip",
  "Level 1": "1st level",
  "Level 2": "2nd level",
  "Level 3": "3rd level"
};

function parseSpellList(value = "") {
  return value
    .split(",")
    .map((spell) => spell.trim())
    .filter((spell) => spell && spell.toLowerCase() !== "none");
}

function normalizeSpellGroupLabel(label: string) {
  const trimmedLabel = label.trim();
  const levelMatch = trimmedLabel.match(/(?:level\s*(\d+)|(\d+)(?:st|nd|rd|th)?(?:\s|-)*level)/i);

  if (/cantrips?/i.test(trimmedLabel)) {
    return "Cantrips";
  }

  if (levelMatch) {
    return `Level ${levelMatch[1] ?? levelMatch[2]}`;
  }

  return trimmedLabel;
}

function parseSpellLines(lines: string[] = []) {
  const groups = new Map<string, string[]>();
  const details: string[] = [];

  lines.forEach((line) => {
    const groupedLine = line.match(
      /^(Cantrips?|Level\s+\d+|(?:\d+)(?:st|nd|rd|th)?(?:\s|-)*level(?: spells?)?):\s*(.*)$/i
    );
    const knownPreparedLine = line.match(/^Known \/ Prepared:\s*(.*)$/i);

    if (groupedLine) {
      const [, rawLabel, rawSpells] = groupedLine;
      const label = normalizeSpellGroupLabel(rawLabel);
      const spells = parseSpellList(rawSpells);

      if (spells.length > 0) {
        groups.set(label, [...(groups.get(label) ?? []), ...spells]);
      }

      return;
    }

    if (knownPreparedLine) {
      parseSpellList(knownPreparedLine[1]).forEach((spell) => {
        const label = spellLevels[spell] ?? "Other";
        groups.set(label, [...(groups.get(label) ?? []), spell]);
      });

      return;
    }

    if (line.toLowerCase() !== "none") {
      details.push(line);
    }
  });

  const spellGroups = spellGroupOrder
    .map((label) => ({
      label,
      spells: groups.get(label) ?? []
    }))
    .filter((group) => group.spells.length > 0);

  return {
    spellGroups,
    details
  };
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

function SheetTable({
  rows,
  empty = "-"
}: {
  rows: SheetTableRow[];
  empty?: string;
}) {
  return (
    <div className="dnd-sheet-table-wrap">
      <table className="dnd-sheet-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Range</th>
            <th>Hit/DC</th>
            <th>Damage/Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={`${row.name}-${index}`}>
                <td>
                  {row.onClick ? (
                    <button
                      className="dnd-sheet-table-action"
                      type="button"
                      onClick={row.onClick}
                    >
                      {row.name}
                    </button>
                  ) : (
                    row.name
                  )}
                </td>
                <td>{row.range}</td>
                <td>{row.hitDc}</td>
                <td>{row.effect}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AttackPanel({ lines }: { lines?: string[] }) {
  const rows = lines?.filter(Boolean).map(parseAttackLine) ?? [];

  return (
    <section className="dnd-sheet-lined-panel dnd-attack-panel">
      <div className="dnd-sheet-lined-content">
        <SheetTable rows={rows} />
      </div>
      <h3>Attacks</h3>
    </section>
  );
}

function SpellPanel({
  lines,
  spellStats,
  onSpellClick
}: {
  lines?: string[];
  spellStats: { attackBonus: string; saveDc: string };
  onSpellClick?: (spell: string, level: SpellLevelLabel | null) => void;
}) {
  const { spellGroups, details } = parseSpellLines(lines);

  return (
    <section className="dnd-sheet-lined-panel dnd-spell-panel">
      <div className="dnd-sheet-lined-content">
        {spellGroups.length > 0 ? (
          <div className="dnd-spell-groups" aria-label="Spell list">
            {spellGroups.map((group) => (
              <div className="dnd-spell-group" key={group.label}>
                <h4>{group.label}</h4>
                <SheetTable
                  rows={group.spells.map((spell) => {
                    const level = spellLevelLabels[group.label] ?? null;

                    return {
                      ...spellTableRow(spell, level, spellStats),
                      onClick: onSpellClick
                        ? () => onSpellClick(spell, level)
                        : undefined
                    };
                  })}
                  empty="None"
                />
              </div>
            ))}
          </div>
        ) : (
          <p>None</p>
        )}
        {details.length > 0 ? (
          <div className="dnd-spell-details">
            {details.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </div>
      <h3>Spells</h3>
    </section>
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
  initialTab = "character_sheet",
  portraitUrl,
  isLoadingNpcCards = false,
  npcCards = [],
  npcCardsError = "",
  onClose,
  onNpcCardUpdate
}: CharacterSheetOverlayProps) {
  const [activeTab, setActiveTab] = useState<PlayerResourcesTab>(initialTab);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const parsedNpcCards = useMemo(
    () => npcCards.map((card) => parseNpcCard(card)),
    [npcCards]
  );
  const selectedNpc =
    parsedNpcCards.find((card) => card.id === selectedNpcId) ?? null;
  const [editableNpcFields, setEditableNpcFields] = useState<
    Record<string, string>
  >(() => Object.fromEntries(npcFieldLabels.map((label) => [label, ""])));
  const [npcSaveStatus, setNpcSaveStatus] = useState("");
  const [isSavingNpc, setIsSavingNpc] = useState(false);
  const [activeSpellDetail, setActiveSpellDetail] = useState<{
    name: string;
    level: SpellLevelLabel | null;
  } | null>(null);
  const sheet = parseCharacterSheet(characterSheet.trim());
  const playerBackstory = extractPlayerBackstory(characterSheet);
  const backstoryParagraphs = formatBackstoryParagraphs(playerBackstory);
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
  const equipmentLines = sheet.sections.Equipment ?? [];
  const inventoryLines = sheet.sections.Inventory ?? [];
  const currencyLines = sheet.sections.Currency ?? [];
  const proficiencyLines = sheet.sections["Proficiencies and Languages"] ?? [];
  const spells = sheet.sections.Spells ?? [];
  const spellStats = {
    attackBonus: spellStatValue(spells, "Spell attack bonus"),
    saveDc: spellStatValue(spells, "Spell save DC")
  };
  const dmBrief = sheet.sections["DM Brief"] ?? [];
  const activeSpellRuleProfile = activeSpellDetail
    ? spellDetailFor(activeSpellDetail.name, activeSpellDetail.level)
    : null;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!selectedNpc) {
      return;
    }

    setEditableNpcFields(selectedNpc.fields);
    setNpcSaveStatus("");
  }, [selectedNpc]);

  async function saveSelectedNpcCard() {
    if (!selectedNpc || !onNpcCardUpdate) {
      return;
    }

    setIsSavingNpc(true);
    setNpcSaveStatus("");

    try {
      const updatedCard = await onNpcCardUpdate({
        npcCardId: selectedNpc.id,
        markdown: npcMarkdownFromFields(editableNpcFields)
      });

      setEditableNpcFields(parseNpcCard(updatedCard).fields);
      setNpcSaveStatus("Saved.");
    } catch (error) {
      setNpcSaveStatus(
        error instanceof Error ? error.message : "NPC card could not be saved."
      );
    } finally {
      setIsSavingNpc(false);
    }
  }

  return (
    <section
      className="character-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={playerResourceTitleIds[activeTab]}
    >
      <div className="character-sheet-overlay-panel dnd-sheet">
        <div className="player-resources-tabs" role="tablist" aria-label="Player resources">
          {playerResourceTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className="player-resource-tab"
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button
            className="player-resources-close"
            type="button"
            aria-label="Close player resources"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {activeTab === "character_sheet" ? (
          <>
            <header className="dnd-sheet-header">
              {portraitUrl ? (
                <div className="dnd-sheet-portrait" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={portraitUrl} alt="" />
                </div>
              ) : null}
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
                  <SheetBox
                    label="Hit Points"
                    value={`${statValue(sheet, "Current HP")} / ${statValue(sheet, "Max HP")}`}
                  />
                  <SheetBox label="Hit Dice" value={statValue(sheet, "Hit Dice")} />
                </div>
                <AttackPanel lines={attackLines} />
                <SpellPanel
                  lines={spells}
                  spellStats={spellStats}
                  onSpellClick={(name, level) => setActiveSpellDetail({ name, level })}
                />
                <LinedPanel title="Equipment" lines={equipmentLines} />
                <LinedPanel title="Inventory" lines={inventoryLines} />
                <LinedPanel title="Currency" lines={currencyLines} />
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
                <LinedPanel title="DM Brief" lines={dmBrief} />
              </section>
            </div>
          </>
        ) : activeTab === "inventory" ? (
          <section
            aria-labelledby="player-inventory-title"
            className="player-resource-panel player-inventory-panel"
            role="region"
          >
            <div className="npc-cards-header">
              <div>
                <p className="eyebrow">Player Resources</p>
                <h2 id="player-inventory-title">Inventory</h2>
              </div>
              <span>Gear & currency</span>
            </div>
            <div className="player-resource-grid">
              <LinedPanel title="Equipment" lines={equipmentLines} />
              <LinedPanel title="Inventory" lines={inventoryLines} />
              <LinedPanel title="Currency" lines={currencyLines} />
            </div>
          </section>
        ) : activeTab === "weapons_spells" ? (
          <section
            aria-labelledby="player-weapons-spells-title"
            className="player-resource-panel player-weapons-spells-panel"
            role="region"
          >
            <div className="npc-cards-header">
              <div>
                <p className="eyebrow">Player Resources</p>
                <h2 id="player-weapons-spells-title">Weapons & Spells</h2>
              </div>
              <span>Actions & magic</span>
            </div>
            <div className="player-resource-grid player-weapons-spells-grid">
              <AttackPanel lines={attackLines} />
              <SpellPanel
                lines={spells}
                spellStats={spellStats}
                onSpellClick={(name, level) => setActiveSpellDetail({ name, level })}
              />
            </div>
          </section>
        ) : activeTab === "backstory" ? (
          <section
            aria-labelledby="player-backstory-title"
            className="player-backstory-panel"
            role="region"
          >
            <div className="npc-cards-header">
              <div>
                <p className="eyebrow">Player Resources</p>
                <h2 id="player-backstory-title">Your Backstory</h2>
              </div>
              <span>Character memory</span>
            </div>
            {backstoryParagraphs.length > 0 ? (
              <div className="player-backstory-copy">
                {backstoryParagraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 18)}`}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="npc-cards-status">No backstory yet.</p>
            )}
          </section>
        ) : activeTab === "npc_cards" ? (
          <section
            aria-labelledby="npc-cards-title"
            className="npc-cards-panel"
            role="region"
          >
            <div className="npc-cards-header">
              <div>
                <p className="eyebrow">Player Resources</p>
                <h2 id="npc-cards-title">NPC Cards</h2>
              </div>
              <span>{parsedNpcCards.length} known</span>
            </div>

            {npcCardsError ? (
              <p className="npc-cards-status" role="alert">{npcCardsError}</p>
            ) : null}
            {isLoadingNpcCards ? (
              <p className="npc-cards-status">Loading NPC cards...</p>
            ) : null}
            {!isLoadingNpcCards && parsedNpcCards.length === 0 ? (
              <p className="npc-cards-status">No NPC cards yet.</p>
            ) : null}

            <div className="npc-card-grid">
              {parsedNpcCards.map((npc) => (
                <button
                  className="npc-card"
                  key={npc.id}
                  type="button"
                  onClick={() => setSelectedNpcId(npc.id)}
                >
                  <span className="npc-card-portrait" aria-hidden="true">
                    <UserRound size={34} />
                  </span>
                  <span className="npc-card-copy">
                    <strong>{npc.fields.Name || npc.title}</strong>
                    <small>{npcFieldPreview(npc.fields.Location)}</small>
                    <span>{npcFieldPreview(npc.fields.Motivations)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section
            aria-labelledby="eldermere-lore-title"
            className="eldermere-lore-panel"
            role="region"
          >
            <div className="npc-cards-header">
              <div>
                <p className="eyebrow">Player Resources</p>
                <h2 id="eldermere-lore-title">Eldermere Lore</h2>
              </div>
              <span>World primer</span>
            </div>
            <div className="eldermere-lore-copy">
              <p>
                Eldermere is a fractured realm where old roads, drowned cities,
                ashland fortresses, and living forests still remember the age
                before the sundering.
              </p>
              <div className="eldermere-lore-grid">
                <article>
                  <h3>Cael Ambrose</h3>
                  <p>
                    The fertile heartland around Suncross, threaded by roads,
                    farms, old claims, and noble obligations.
                  </p>
                </article>
                <article>
                  <h3>Ashfell Marches</h3>
                  <p>
                    Grey northern country of border towns, open moor, and
                    watchful settlements along the Sern.
                  </p>
                </article>
                <article>
                  <h3>Thornwake Vale</h3>
                  <p>
                    A deep green western vale where Sallowholt and Bramblegate
                    sit beneath older, less forgiving woods.
                  </p>
                </article>
                <article>
                  <h3>Salt Concordat</h3>
                  <p>
                    A sea power of ports, ships, lighthouse holdings, and the
                    haunted glow of the Drowned City.
                  </p>
                </article>
                <article>
                  <h3>Cinderspine</h3>
                  <p>
                    Ironhold and Cragfoot cling to volcanic heights ruled by
                    smoke, ore, ambition, and hard bargains.
                  </p>
                </article>
                <article>
                  <h3>Sundered Vale</h3>
                  <p>
                    Broken ground and blue fire around Stakehold and Rimshaft,
                    where ruin has never gone fully quiet.
                  </p>
                </article>
              </div>
            </div>
          </section>
        )}
      </div>

      {selectedNpc ? (
        <div className="npc-detail-backdrop" role="presentation">
          <div
            aria-modal="true"
            aria-labelledby="npc-detail-title"
            className="npc-detail-modal"
            role="dialog"
          >
            <div className="npc-detail-header">
              <div>
                <p className="eyebrow">NPC Card</p>
                <h2 id="npc-detail-title">
                  {editableNpcFields.Name || selectedNpc.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close NPC card"
                onClick={() => setSelectedNpcId(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="npc-detail-portrait" aria-hidden="true">
              <UserRound size={58} />
            </div>

            <div className="npc-detail-fields">
              {npcFieldLabels.map((label) => (
                <label key={label}>
                  <span>{label}</span>
                  {compactNpcFields.has(label) ? (
                    <input
                      type="text"
                      value={editableNpcFields[label] ?? ""}
                      onChange={(event) =>
                        setEditableNpcFields((fields) => ({
                          ...fields,
                          [label]: event.target.value
                        }))
                      }
                    />
                  ) : (
                    <textarea
                      value={editableNpcFields[label] ?? ""}
                      onChange={(event) =>
                        setEditableNpcFields((fields) => ({
                          ...fields,
                          [label]: event.target.value
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="npc-detail-actions">
              {npcSaveStatus ? <span>{npcSaveStatus}</span> : null}
              <button
                type="button"
                disabled={!onNpcCardUpdate || isSavingNpc}
                onClick={() => void saveSelectedNpcCard()}
              >
                {isSavingNpc ? "Saving..." : "Save NPC Card"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeSpellDetail && activeSpellRuleProfile ? (
        <div
          className="spell-detail-modal-backdrop"
          role="presentation"
          onClick={() => setActiveSpellDetail(null)}
        >
          <section
            aria-modal="true"
            aria-labelledby="spell-detail-modal-title"
            className="spell-detail-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="spell-detail-modal-header">
              <div>
                <span>{activeSpellDetail.level ?? "Spell"}</span>
                <h2 id="spell-detail-modal-title">{activeSpellDetail.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Close spell details"
                onClick={() => setActiveSpellDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="spell-detail-modal-body">
              <p>{activeSpellRuleProfile.description}</p>
              <section>
                <h3>Rolls Involved</h3>
                <p>{activeSpellRuleProfile.rolls}</p>
              </section>
            </div>
            <dl className="spell-detail-meta">
              <div>
                <dt>School</dt>
                <dd>{activeSpellRuleProfile.school}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{activeSpellRuleProfile.duration}</dd>
              </div>
              <div>
                <dt>Casting Time</dt>
                <dd>{activeSpellRuleProfile.castingTime}</dd>
              </div>
              <div>
                <dt>Range</dt>
                <dd>{activeSpellRuleProfile.range}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </section>
  );
}
