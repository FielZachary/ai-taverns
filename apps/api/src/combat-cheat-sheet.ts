import { createHash } from "node:crypto";
import { z } from "zod";
import type { CombatCheatSheetTarget } from "@ai-dnd/db";
import { askDungeonMasterProvider } from "./dm-provider.js";

type ParsedCharacterSheet = {
  fields: Record<string, string>;
  sections: Record<string, string[]>;
};

type WhitelistedCombatFeature = {
  name: string;
  mechanics: string;
  actionType?: string;
  uses?: string;
};

type ClassCombatIdentity = {
  className: string;
  combatRole: string;
  subclassName?: string;
  subclassCombatRole?: string;
  combatApproach?: string;
};

const CombatCheatSheetResponseSchema = z.object({
  cheatSheetMarkdown: z.string().min(1)
});

const sectionHeadings = new Set([
  "Core Stats",
  "Ability Scores",
  "Saving Throws",
  "Skills",
  "Proficiencies and Languages",
  "Attacks",
  "Spells",
  "Equipment",
  "Inventory",
  "Currency",
  "Personality",
  "Features and Traits",
  "Backstory",
  "DM Brief",
  "Level Progression",
  "Appearance",
  "Notes"
]);

function normalizeClassName(value: string) {
  return value
    .replace(/\s+\/\s*\d+.*$/i, "")
    .replace(/\blevel\s+\d+\b/gi, "")
    .trim();
}

function parseLevel(...values: string[]) {
  for (const value of values) {
    const match = value.match(/\b(?:level\s*)?(\d{1,2})\b/i);

    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

function parseCharacterSheet(rawSheet: string): ParsedCharacterSheet {
  const fields: Record<string, string> = {};
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;

  for (const rawLine of rawSheet.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (sectionHeadings.has(line)) {
      currentSection = line;
      sections[currentSection] = sections[currentSection] ?? [];
      continue;
    }

    const fieldMatch = line.match(/^([A-Z][A-Za-z /()'-]+):\s*(.*)$/);

    if (fieldMatch?.[1] && currentSection === null) {
      fields[fieldMatch[1].trim()] = fieldMatch[2]?.trim() ?? "";
      continue;
    }

    if (currentSection) {
      sections[currentSection] = [...(sections[currentSection] ?? []), line];
    }
  }

  return { fields, sections };
}

function fieldValue(sheet: ParsedCharacterSheet, labels: string[]) {
  for (const label of labels) {
    const value = sheet.fields[label];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function sectionValue(sheet: ParsedCharacterSheet, section: string, label: string) {
  const line = sheet.sections[section]?.find((entry) =>
    entry.toLowerCase().startsWith(`${label.toLowerCase()}:`)
  );

  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function sneakAttackDice(level: number | null) {
  if (!level || level < 1) {
    return "";
  }

  return `${Math.ceil(level / 2)}d6`;
}

function crimsonRiteDamageDice() {
  return "1d4";
}

function inferSubclassName(
  features: WhitelistedCombatFeature[],
  explicitSubclassName?: string
) {
  if (explicitSubclassName?.trim()) {
    return explicitSubclassName.trim();
  }

  const orderFeature = features.find((feature) =>
    /^blood hunter order\b/i.test(feature.name)
  );
  const orderMatch = orderFeature?.mechanics.match(/\(([^)]+)\)/);

  if (orderMatch?.[1]) {
    return orderMatch[1].trim();
  }

  const subclassFeature = features.find((feature) =>
    /\b(?:archetype|circle|college|domain|oath|order|patron|school|tradition)\b/i.test(
      feature.name
    )
  );

  return (
    subclassFeature?.mechanics.split(":")[1]?.trim() || subclassFeature?.name
  );
}

function inferClassCombatIdentity(
  className: string,
  features: WhitelistedCombatFeature[],
  explicitSubclassName?: string
): ClassCombatIdentity | null {
  const normalizedClass = className.toLowerCase();
  const subclassName = inferSubclassName(features, explicitSubclassName);

  if (normalizedClass === "blood hunter") {
    const isGhostslayer = /ghostslayer/i.test(subclassName ?? "");

    return {
      className,
      combatRole:
        "A weapon-focused occult striker who improves weapon attacks with blood magic and hunts supernatural threats.",
      combatApproach:
        "At the start of a serious fight, activate Crimson Rite on the weapon you expect to use, then use the Attack action and Extra Attack to apply weapon damage plus rite damage as often as possible.",
      ...(subclassName ? { subclassName } : {}),
      ...(isGhostslayer
        ? {
            subclassCombatRole:
              "Your order specializes you toward undead, spirits, and other supernatural foes; highlight these options when the enemy type matters."
          }
        : {})
    };
  }

  if (normalizedClass === "rogue") {
    return {
      className,
      combatRole:
        "A precision striker who wins by positioning for one strong hit, then using mobility or stealth to stay safe.",
      ...(subclassName ? { subclassName } : {})
    };
  }

  if (normalizedClass === "fighter") {
    return {
      className,
      combatRole:
        "A reliable weapon combatant who turns strong attacks, durability, and short-rest resources into steady pressure.",
      ...(subclassName ? { subclassName } : {})
    };
  }

  if (normalizedClass === "barbarian") {
    return {
      className,
      combatRole:
        "A frontline bruiser who uses rage, resistance, and high-impact melee attacks to absorb danger and hit hard.",
      ...(subclassName ? { subclassName } : {})
    };
  }

  if (normalizedClass === "paladin") {
    return {
      className,
      combatRole:
        "A frontline defender and burst-damage striker who combines weapons, healing, and divine magic.",
      ...(subclassName ? { subclassName } : {})
    };
  }

  return className
    ? {
        className,
        combatRole:
          "Your class features are the most important combat options on the sheet; prioritize them over generic gear when they affect a fight.",
        ...(subclassName ? { subclassName } : {})
      }
    : null;
}

function enhanceSheetCombatFeature(
  feature: WhitelistedCombatFeature
): WhitelistedCombatFeature {
  if (
    /crimson rite|rite of/i.test(`${feature.name} ${feature.mechanics}`) &&
    !/\b\d+d\d+\b/i.test(feature.mechanics)
  ) {
    const riteNameMatch = feature.mechanics.match(/\bRite of [A-Za-z ]+\b/i);
    const riteName = riteNameMatch?.[0]?.trim();

    return {
      name: riteName ? `Crimson Rite (${riteName})` : "Crimson Rite",
      mechanics: `Activate your crimson rite to empower a weapon and add ${crimsonRiteDamageDice()} rite damage to that weapon's attacks. If the rite is ${riteName ?? "elemental"}, use that damage type.`,
      actionType: "Bonus action"
    };
  }

  return feature;
}

function inferStandardCombatFeatures(
  className: string,
  level: number | null
): WhitelistedCombatFeature[] {
  const normalizedClass = className.toLowerCase();
  const features: WhitelistedCombatFeature[] = [];

  if (normalizedClass === "rogue") {
    const dice = sneakAttackDice(level);

    features.push({
      name: "Sneak Attack",
      mechanics: dice
        ? `Adds ${dice} damage once per turn when you have advantage on the attack roll, or when an ally is next to your target.`
        : "Adds extra damage once per turn when you have advantage on the attack roll, or when an ally is next to your target."
    });

    if ((level ?? 0) >= 2) {
      features.push({
        name: "Cunning Action",
        mechanics: "Dash, Disengage, or Hide as a bonus action.",
        actionType: "Bonus action"
      });
    }
  }

  if (normalizedClass === "fighter") {
    features.push({
      name: "Second Wind",
      mechanics: "Regain 1d10 + your Fighter level hit points.",
      actionType: "Bonus action",
      uses: "Once per short rest"
    });

    if ((level ?? 0) >= 2) {
      features.push({
        name: "Action Surge",
        mechanics: "Take 1 extra action on your turn.",
        uses: "Once per short rest"
      });
    }

    if ((level ?? 0) >= 5) {
      features.push({
        name: "Extra Attack",
        mechanics: "Attack twice when you take the Attack action."
      });
    }
  }

  if (normalizedClass === "barbarian") {
    features.push({
      name: "Rage",
      mechanics:
        "Gain +2 melee damage with Strength attacks, advantage on Strength checks and saves, and resistance to bludgeoning, piercing, and slashing damage.",
      actionType: "Bonus action"
    });
  }

  if (normalizedClass === "paladin") {
    features.push({
      name: "Lay on Hands",
      mechanics: `Heal from a pool of ${(level ?? 1) * 5} hit points.`,
      actionType: "Action"
    });

    if ((level ?? 0) >= 2) {
      features.push({
        name: "Divine Smite",
        mechanics:
          "Spend a spell slot after hitting with a melee weapon to add 2d8 radiant damage, plus 1d8 per slot level above 1st."
      });
    }
  }

  if (normalizedClass === "monk") {
    features.push({
      name: "Martial Arts",
      mechanics:
        "Use Dexterity for monk weapons and unarmed strikes, and make 1 unarmed strike as a bonus action after attacking."
    });

    if ((level ?? 0) >= 2) {
      features.push({
        name: "Ki",
        mechanics:
          "Spend ki for Flurry of Blows, Patient Defense, or Step of the Wind.",
        uses: `${level ?? "your Monk level"} ki points`
      });
    }
  }

  if (normalizedClass === "warlock") {
    features.push({
      name: "Pact Magic",
      mechanics: "Your spell slots return on a short rest."
    });
  }

  if (normalizedClass === "blood hunter") {
    if (level !== null && level >= 5) {
      features.push({
        name: "Extra Attack",
        mechanics: "Attack twice when you take the Attack action."
      });
    }
  }

  return features;
}

function buildWhitelist(target: CombatCheatSheetTarget) {
  const parsed = parseCharacterSheet(target.characterSheet);
  const classField = fieldValue(parsed, ["Class", "Class / Level"]);
  const levelField = fieldValue(parsed, ["Level", "Class / Level"]);
  const className = normalizeClassName(classField);
  const subclassName = fieldValue(parsed, ["Subclass"]);
  const level = parseLevel(levelField, classField);

  const sheetFeatures = (parsed.sections["Features and Traits"] ?? []).map(
    (line) =>
      enhanceSheetCombatFeature({
        name: line.split(":")[0]?.trim() || line,
        mechanics: line
      })
  );
  const features = [
    ...sheetFeatures,
    ...inferStandardCombatFeatures(className, level)
  ];

  return {
    character: {
      name:
        fieldValue(parsed, ["Character Name", "Name"]) ||
        target.characterName ||
        "Unnamed Adventurer",
      playerName: target.username,
      className,
      level,
      armorClass: sectionValue(parsed, "Core Stats", "Armor Class") || fieldValue(parsed, ["Armor Class"]),
      hitPoints:
        sectionValue(parsed, "Core Stats", "Hit Points") ||
        fieldValue(parsed, ["Hit Points"]) ||
        [
          sectionValue(parsed, "Core Stats", "Current HP") || fieldValue(parsed, ["Current HP"]),
          sectionValue(parsed, "Core Stats", "Max HP") || fieldValue(parsed, ["Max HP"])
        ]
          .filter(Boolean)
          .join(" / "),
      speed: sectionValue(parsed, "Core Stats", "Speed") || fieldValue(parsed, ["Speed"]),
      proficiencyBonus:
        sectionValue(parsed, "Core Stats", "Proficiency Bonus") ||
        fieldValue(parsed, ["Proficiency Bonus"])
    },
    classIdentity: inferClassCombatIdentity(className, features, subclassName),
    attacks: parsed.sections.Attacks ?? [],
    spells: parsed.sections.Spells ?? [],
    features,
    skills: parsed.sections.Skills ?? [],
    savingThrows: parsed.sections["Saving Throws"] ?? [],
    abilityScores: parsed.sections["Ability Scores"] ?? [],
    proficienciesAndLanguages:
      parsed.sections["Proficiencies and Languages"] ?? [],
    equipment: parsed.sections.Equipment ?? [],
    inventory: parsed.sections.Inventory ?? [],
    currency: parsed.sections.Currency ?? [],
    allSheetFields: parsed.fields,
    allSheetSections: parsed.sections
  };
}

export function combatCheatSheetSourceHash(
  target: Pick<CombatCheatSheetTarget, "characterSheet" | "username" | "characterName">
) {
  const whitelist = buildWhitelist({
    campaignId: "",
    sessionId: "",
    playerDbId: "",
    playerId: "",
    existingCombatCheatSheet: null,
    existingCombatCheatSheetSourceHash: null,
    ...target
  });

  return createHash("sha256")
    .update(JSON.stringify(whitelist))
    .digest("hex");
}

export function buildCombatCheatSheetPrompt(target: CombatCheatSheetTarget) {
  const whitelist = buildWhitelist(target);

  return {
    whitelist,
    instructions: [
      "You are writing a player-facing combat cheat sheet for a D&D-style character.",
      "",
      "Use ONLY the whitelisted options in the user message. Do not invent weapons, spells, items, resources, damage numbers, ranges, uses, or class features. If a useful combat option is not in the whitelist, omit it.",
      "",
      "Return exactly one JSON object with this shape:",
      "{\"cheatSheetMarkdown\":\"## Cheat Sheet\\n\\n...\"}",
      "",
      "Output rules for cheatSheetMarkdown:",
      "- Start with exactly: ## Cheat Sheet",
      "- Write 6 to 9 short entries.",
      "- Each entry must start with a bolded available thing from the whitelist.",
      "- Prioritize classIdentity and features first. The sheet should feel like it teaches the player how their class fights, not like it lists gear.",
      "- If class/subclass/order features are available, at least half of the entries must be about those class/subclass/order features or the class combat role.",
      "- Class/subclass/order entries are things tied to the class name, subclass/order name, spellcasting, or class resources. Do not count ancestry traits, skills, armor, or generic proficiencies toward that class-focused half.",
      "- For Blood Hunters, include Crimson Rite, the order/subclass, Extra Attack when available, and the classIdentity.combatApproach before saving throws, skills, ancestry traits, or generic equipment.",
      "- Include weapons, armor, ancestry traits, proficiencies, and skills only after the most important class/subclass combat options are covered.",
      "- Avoid entries about saving throws, passive defenses, background skills, or exploration traits unless they create a clear immediate combat decision.",
      "- Use no more than 2 entries total for saving throws, passive defenses, background skills, ancestry traits, or exploration traits.",
      "- Proficiency is not possession. Do not recommend equipping, using, or switching to an item unless attacks, equipment, or inventory lists that item.",
      "- When a subclass/order is listed, explain what it means in combat using classIdentity.subclassCombatRole if available.",
      "- If a class feature is named but has no exact mechanics, explain the combat purpose from the whitelist wording, but do not invent action costs, uses, damage dice, save DCs, or conditions.",
      "- Include exact numbers whenever available.",
      "- For class damage features such as Crimson Rite, Sneak Attack, Divine Smite, or Rage, the entry must include the exact damage dice or bonus from the whitelist.",
      "- Bold important numbers, especially damage dice, attack bonuses, save DCs, healing, range, AC, uses, and action costs.",
      "- Write in second person.",
      "- Explain when to use each thing during combat.",
      "- Prefer direct combat actions over general character flavor.",
      "- Do not mention that you are using a whitelist.",
      "",
      "Good examples:",
      "",
      "**Longsword** is your best melee weapon. It attacks at **+6 to hit** and deals **1d8 + 3 slashing** damage, or **1d10 + 3** if you use it with two hands.",
      "",
      "**Shortbow** is your safest ranged option. It attacks at **+5 to hit** and deals **1d6 + 3 piercing** damage from **80/320 ft** away.",
      "",
      "**Sneak Attack** is your main damage spike. Add **2d6** damage once per turn when you have advantage on the attack roll, or when an ally is next to your target.",
      "",
      "**Action Surge** gives you **1 extra action** on your turn. Use it when another attack, dash, or key action can finish the fight or save an ally.",
      "",
      "**Crimson Rite** is your Blood Hunter damage engine. Activate it as a bonus action, then add the listed rite damage, such as **1d4 fire damage**, to your weapon attacks while it lasts.",
      "",
      "**Order of the Ghostslayer** means your Blood Hunter is built to hunt undead, spirits, and supernatural foes. When those enemies appear, look first for your order features before spending generic attacks.",
      "",
      "**Extra Attack** lets you attack **twice** when you take the Attack action. Once Crimson Rite is active, both hits can benefit from your rite damage if they use the empowered weapon.",
      "",
      "**Shield** uses your reaction to add **+5 AC** until the start of your next turn. Use it when that bonus can turn a hit into a miss.",
      "",
      "Bad examples:",
      "- Do not say \"use Fireball\" unless Fireball is in the spell whitelist.",
      "- Do not say \"attack twice\" unless Extra Attack, Action Surge, or another listed feature supports it.",
      "- Do not give every skill its own entry when class features, spells, or combat resources are available.",
      "- Do not invent damage like **2d8** if the whitelist only says **1d8 + 3**."
    ].join("\n")
  };
}

function parseProviderJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Combat cheat sheet response was not valid JSON.");
    }

    return JSON.parse(match[0]) as unknown;
  }
}

function stripMarkdownFormatting(markdown: string) {
  return markdown.replace(/[*_`]/g, "").toLowerCase();
}

function missingRequiredCombatDetails(
  markdown: string,
  whitelist: ReturnType<typeof buildWhitelist>
) {
  const normalizedMarkdown = stripMarkdownFormatting(markdown);
  const carriedItems = [
    ...whitelist.attacks,
    ...whitelist.equipment,
    ...whitelist.inventory
  ]
    .join("\n")
    .toLowerCase();
  const missing: string[] = [];

  for (const feature of whitelist.features) {
    const damageDice = feature.mechanics.match(/\b\d+d\d+\b/i)?.[0];

    if (!damageDice) {
      continue;
    }

    if (
      /crimson rite|sneak attack|divine smite|rage/i.test(feature.name) &&
      !normalizedMarkdown.includes(damageDice.toLowerCase())
    ) {
      missing.push(`${feature.name} must include ${damageDice}`);
    }
  }

  if (
    whitelist.classIdentity?.className.toLowerCase() === "blood hunter" &&
    !normalizedMarkdown.includes("crimson rite")
  ) {
    missing.push("Blood Hunter cheat sheets must include Crimson Rite");
  }

  if (
    /\bshield\b/i.test(normalizedMarkdown) &&
    !/\bshield\b/i.test(carriedItems)
  ) {
    missing.push(
      "Do not recommend a shield because the character is proficient with shields but does not carry one"
    );
  }

  return missing;
}

export async function generateCombatCheatSheet(target: CombatCheatSheetTarget) {
  const { whitelist, instructions } = buildCombatCheatSheetPrompt(target);
  const baseMessage = [
    "Whitelisted character options:",
    JSON.stringify(whitelist, null, 2),
    "",
    "Full character sheet for tone and context only. The whitelist remains authoritative:",
    target.characterSheet
  ].join("\n");
  let parsed: z.infer<typeof CombatCheatSheetResponseSchema> | null = null;
  let feedback = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await askDungeonMasterProvider({
      instructions,
      dmJob: "combat",
      message: feedback ? [baseMessage, "", feedback].join("\n") : baseMessage
    });
    parsed = CombatCheatSheetResponseSchema.parse(
      parseProviderJson(response.content)
    );

    const missingDetails = missingRequiredCombatDetails(
      parsed.cheatSheetMarkdown,
      whitelist
    );

    if (missingDetails.length === 0) {
      break;
    }

    feedback = [
      "Repair the cheat sheet. The previous answer missed required whitelisted combat details:",
      ...missingDetails.map((detail) => `- ${detail}`),
      "Return the full corrected JSON object. Keep the same output rules."
    ].join("\n");
  }

  if (!parsed) {
    throw new Error("Combat cheat sheet response was empty.");
  }

  return {
    markdown: parsed.cheatSheetMarkdown.trim(),
    sourceHash: createHash("sha256")
      .update(JSON.stringify(whitelist))
      .digest("hex")
  };
}
