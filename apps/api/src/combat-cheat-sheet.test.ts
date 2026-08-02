import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCombatCheatSheetPrompt,
  generateCombatCheatSheet
} from "./combat-cheat-sheet.js";

const baseTarget = {
  campaignId: "campaign-1",
  sessionId: "session-1",
  playerDbId: "player-db-1",
  playerId: "player-1",
  username: "Fiel",
  characterName: "Kael",
  existingCombatCheatSheet: null,
  existingCombatCheatSheetSourceHash: null
};

test("combat cheat sheet prompt prioritizes Blood Hunter class and order features", () => {
  const { whitelist, instructions } = buildCombatCheatSheetPrompt({
    campaignId: "campaign-1",
    sessionId: "session-1",
    playerDbId: "player-db-1",
    playerId: "player-1",
    username: "Fiel",
    characterName: "Kael",
    existingCombatCheatSheet: null,
    existingCombatCheatSheetSourceHash: null,
    characterSheet: [
      "Character Name: Kael",
      "Class: Blood Hunter",
      "Subclass: Order of the Ghostslayer",
      "Level: 5",
      "",
      "Core Stats",
      "Armor Class: 14",
      "",
      "Attacks",
      "Longsword: +3 to hit, 1d8 slashing",
      "Hand crossbow: +3 to hit, 1d6 piercing, range 30/120 ft",
      "",
      "Features and Traits",
      "Blood Hunter Order: Order of the Ghostslayer",
      "Crimson Rite focus: Rite of the Flame",
      "Tiefling Traits: Darkvision and fire resistance",
      "",
      "Skills",
      "Athletics",
      "Survival"
    ].join("\n")
  });

  assert.equal(whitelist.classIdentity?.className, "Blood Hunter");
  assert.match(
    whitelist.classIdentity?.combatRole ?? "",
    /weapon-focused occult striker/
  );
  assert.equal(whitelist.classIdentity?.subclassName, "Order of the Ghostslayer");
  assert.match(
    whitelist.classIdentity?.subclassCombatRole ?? "",
    /undead, spirits, and other supernatural foes/
  );
  assert.match(
    whitelist.classIdentity?.combatApproach ?? "",
    /activate Crimson Rite/
  );
  assert.match(instructions, /Prioritize classIdentity and features first/);
  assert.match(instructions, /at least half of the entries/);
  assert.match(instructions, /For Blood Hunters, include Crimson Rite/);
  assert.match(instructions, /Use no more than 2 entries total/);
  assert.match(instructions, /Order of the Ghostslayer/);
  assert.deepEqual(
    whitelist.features
      .filter((feature) => /crimson rite|extra attack/i.test(feature.name))
      .map((feature) => ({
        name: feature.name,
        mechanics: feature.mechanics,
        actionType: feature.actionType
      })),
    [
      {
        name: "Crimson Rite (Rite of the Flame)",
        mechanics:
          "Activate your crimson rite to empower a weapon and add 1d4 rite damage to that weapon's attacks. If the rite is Rite of the Flame, use that damage type.",
        actionType: "Bonus action"
      },
      {
        name: "Extra Attack",
        mechanics: "Attack twice when you take the Attack action.",
        actionType: undefined
      }
    ]
  );
  assert.match(instructions, /exact damage dice or bonus/);
  assert.match(instructions, /Do not give every skill its own entry/);
});

test("combat cheat sheet prompt infers common class combat features", () => {
  const cases = [
    {
      classLine: "Class: Rogue",
      levelLine: "Level: 3",
      expectedRole: /precision striker/,
      expectedFeatures: [/Sneak Attack.*2d6/s, /Cunning Action.*bonus action/is]
    },
    {
      classLine: "Class: Fighter",
      levelLine: "Level: 5",
      expectedRole: /reliable weapon combatant/,
      expectedFeatures: [/Second Wind.*1d10/s, /Action Surge.*1 extra action/s, /Extra Attack.*Attack twice/s]
    },
    {
      classLine: "Class: Barbarian",
      levelLine: "Level: 2",
      expectedRole: /frontline bruiser/,
      expectedFeatures: [/Rage.*\+2 melee damage/s]
    },
    {
      classLine: "Class: Paladin",
      levelLine: "Level: 4",
      expectedRole: /frontline defender/,
      expectedFeatures: [/Lay on Hands.*20 hit points/s, /Divine Smite.*2d8 radiant/s]
    },
    {
      classLine: "Class: Monk",
      levelLine: "Level: 2",
      expectedRole: undefined,
      expectedFeatures: [/Martial Arts.*bonus action/s, /Ki.*2 ki points/s]
    },
    {
      classLine: "Class: Warlock",
      levelLine: "Level: 1",
      expectedRole: undefined,
      expectedFeatures: [/Pact Magic.*short rest/s]
    }
  ];

  for (const testCase of cases) {
    const { whitelist } = buildCombatCheatSheetPrompt({
      ...baseTarget,
      characterSheet: [
        "Character Name: Kael",
        testCase.classLine,
        testCase.levelLine,
        "",
        "Attacks",
        "Dagger: +5 to hit, 1d4 + 3 piercing"
      ].join("\n")
    });
    const featureText = whitelist.features
      .map((feature) =>
        [
          feature.name,
          feature.mechanics,
          feature.actionType,
          feature.uses
        ]
          .filter(Boolean)
          .join(": ")
      )
      .join("\n");

    if (testCase.expectedRole) {
      assert.match(
        whitelist.classIdentity?.combatRole ?? "",
        testCase.expectedRole
      );
    }

    for (const expectedFeature of testCase.expectedFeatures) {
      assert.match(featureText, expectedFeature);
    }
  }
});

test("combat cheat sheet prompt handles fallback parsing branches", () => {
  const withClassLevel = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterSheet: [
      "Character Name: Nox",
      "Class / Level: Rogue / 1",
      "",
      "Core Stats",
      "Current HP: 7",
      "Max HP: 7",
      "Speed: 30 ft",
      "",
      "Features and Traits",
      "Roguish Archetype: Thief"
    ].join("\n")
  }).whitelist;

  assert.equal(withClassLevel.character.className, "Rogue");
  assert.equal(withClassLevel.character.level, 1);
  assert.equal(withClassLevel.character.hitPoints, "7 / 7");
  assert.equal(withClassLevel.classIdentity?.subclassName, "Thief");
  assert.match(
    withClassLevel.features
      .map((feature) => `${feature.name}: ${feature.mechanics}`)
      .join("\n"),
    /Sneak Attack.*1d6/s
  );

  const withoutClass = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterName: "Fallback Name",
    characterSheet: [
      "Name: ",
      "",
      "Features and Traits",
      "Custom Trick"
    ].join("\n")
  }).whitelist;

  assert.equal(withoutClass.character.name, "Fallback Name");
  assert.equal(withoutClass.character.className, "");
  assert.equal(withoutClass.character.level, null);
  assert.equal(withoutClass.classIdentity, null);
});

test("combat cheat sheet prompt covers low-level and generic feature branches", () => {
  const lowLevelFeatureCases = [
    {
      classLine: "Class: Rogue",
      levelLine: "",
      present: [/Sneak Attack: Adds extra damage once per turn/],
      absent: [/Cunning Action/]
    },
    {
      classLine: "Class: Fighter",
      levelLine: "Level: 1",
      present: [/Second Wind/],
      absent: [/Action Surge/, /Extra Attack/]
    },
    {
      classLine: "Class: Paladin",
      levelLine: "Level: 1",
      present: [/Lay on Hands.*5 hit points/s],
      absent: [/Divine Smite/]
    },
    {
      classLine: "Class: Monk",
      levelLine: "Level: 1",
      present: [/Martial Arts/],
      absent: [/Ki/]
    }
  ];

  for (const testCase of lowLevelFeatureCases) {
    const { whitelist } = buildCombatCheatSheetPrompt({
      ...baseTarget,
      characterSheet: [
        "Character Name: Pip",
        testCase.classLine,
        testCase.levelLine
      ].join("\n")
    });
    const featureText = whitelist.features
      .map((feature) => `${feature.name}: ${feature.mechanics}`)
      .join("\n");

    for (const expectedFeature of testCase.present) {
      assert.match(featureText, expectedFeature);
    }

    for (const missingFeature of testCase.absent) {
      assert.doesNotMatch(featureText, missingFeature);
    }
  }

  const lowLevelRogue = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterSheet: [
      "Character Name: Pip",
      "Class: Rogue",
      "Level: 0",
      "",
      "Features and Traits",
      "Roguish Archetype"
    ].join("\n")
  }).whitelist;

  assert.match(
    lowLevelRogue.features
      .map((feature) => `${feature.name}: ${feature.mechanics}`)
      .join("\n"),
    /Sneak Attack: Adds extra damage once per turn/
  );
  assert.equal(lowLevelRogue.classIdentity?.subclassName, "Roguish Archetype");

  const bloodHunter = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterSheet: [
      "Character Name: Ryn",
      "Class: Blood Hunter level 4",
      "",
      "Armor Class: 15",
      "Hit Points: 31",
      "Proficiency Bonus: +2",
      "",
      "Features and Traits",
      "Blood Hunter Order: Order of the Mutant",
      "Crimson Rite: chosen elemental rite",
      "",
      "Equipment",
      "Shield"
    ].join("\n")
  }).whitelist;

  assert.equal(bloodHunter.character.className, "Blood Hunter");
  assert.equal(bloodHunter.character.level, 4);
  assert.equal(bloodHunter.character.armorClass, "15");
  assert.equal(bloodHunter.character.hitPoints, "31");
  assert.equal(bloodHunter.character.proficiencyBonus, "+2");
  assert.equal(bloodHunter.classIdentity?.subclassName, "Order of the Mutant");
  assert.equal(bloodHunter.classIdentity?.subclassCombatRole, undefined);
  assert.deepEqual(
    bloodHunter.features
      .filter((feature) => /crimson rite|extra attack/i.test(feature.name))
      .map((feature) => ({
        name: feature.name,
        mechanics: feature.mechanics
      })),
    [
      {
        name: "Crimson Rite",
        mechanics:
          "Activate your crimson rite to empower a weapon and add 1d4 rite damage to that weapon's attacks. If the rite is elemental, use that damage type."
      }
    ]
  );

  const genericClass = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterSheet: [
      "Character Name: Mira",
      "Class: Wizard",
      "Level: 2",
      "",
      "Features and Traits",
      "Arcane Tradition: War Magic"
    ].join("\n")
  }).whitelist;

  assert.equal(genericClass.classIdentity?.className, "Wizard");
  assert.equal(genericClass.classIdentity?.subclassName, "War Magic");
  assert.match(
    genericClass.classIdentity?.combatRole ?? "",
    /prioritize them over generic gear/
  );
});

test("combat cheat sheet prompt preserves explicit mechanics and default character fallbacks", () => {
  const anonymousBloodHunter = buildCombatCheatSheetPrompt({
    ...baseTarget,
    characterName: "",
    characterSheet: [
      "Class: Blood Hunter",
      "",
      "Core Stats",
      "Hit Points: 18",
      "Armor Class: 13",
      "Proficiency Bonus: +2",
      "",
      "Attacks",
      "Scimitar: +4 to hit, 1d6 + 2 slashing",
      "",
      "Features and Traits",
      "Blood Hunter Order: Order of the Lycan",
      "Crimson Rite: add 1d4 fire damage to your weapon attacks",
      "Brand of Castigation",
      "",
      "Saving Throws",
      "Dexterity +4",
      "",
      "Ability Scores",
      "Dexterity 15",
      "",
      "Proficiencies and Languages",
      "Light armor",
      "",
      "Inventory",
      "Potion of healing",
      "",
      "Currency",
      "12 gp"
    ].join("\n")
  }).whitelist;

  assert.equal(anonymousBloodHunter.character.name, "Unnamed Adventurer");
  assert.equal(anonymousBloodHunter.character.hitPoints, "18");
  assert.equal(anonymousBloodHunter.character.armorClass, "13");
  assert.equal(anonymousBloodHunter.character.proficiencyBonus, "+2");
  assert.deepEqual(anonymousBloodHunter.attacks, [
    "Scimitar: +4 to hit, 1d6 + 2 slashing"
  ]);
  assert.deepEqual(anonymousBloodHunter.savingThrows, ["Dexterity +4"]);
  assert.deepEqual(anonymousBloodHunter.abilityScores, ["Dexterity 15"]);
  assert.deepEqual(anonymousBloodHunter.proficienciesAndLanguages, [
    "Light armor"
  ]);
  assert.deepEqual(anonymousBloodHunter.inventory, ["Potion of healing"]);
  assert.deepEqual(anonymousBloodHunter.currency, ["12 gp"]);
  assert.deepEqual(
    anonymousBloodHunter.features
      .filter((feature) => /crimson rite|brand of castigation|extra attack/i.test(feature.name))
      .map((feature) => ({
        name: feature.name,
        mechanics: feature.mechanics,
        actionType: feature.actionType
      })),
    [
      {
        name: "Crimson Rite",
        mechanics: "Crimson Rite: add 1d4 fire damage to your weapon attacks",
        actionType: undefined
      },
      {
        name: "Brand of Castigation",
        mechanics: "Brand of Castigation",
        actionType: undefined
      }
    ]
  );
});

test("combat cheat sheet generation performs a repair pass for missing required details", async () => {
  const originalTestProvider = process.env.AI_TAVERNS_TEST_DM_PROVIDER;
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";

  try {
    const generated = await generateCombatCheatSheet({
      ...baseTarget,
      characterSheet: [
        "Character Name: Kael",
        "Class: Blood Hunter",
        "Subclass: Order of the Ghostslayer",
        "Level: 5",
        "",
        "Features and Traits",
        "Blood Hunter Order: Order of the Ghostslayer",
        "Crimson Rite focus: Rite of the Flame",
        "",
        "Equipment",
        "Longsword"
      ].join("\n")
    });

    assert.match(generated.markdown, /## Cheat Sheet/);
    assert.match(generated.sourceHash, /^[a-f0-9]{64}$/);
  } finally {
    if (originalTestProvider === undefined) {
      delete process.env.AI_TAVERNS_TEST_DM_PROVIDER;
    } else {
      process.env.AI_TAVERNS_TEST_DM_PROVIDER = originalTestProvider;
    }
  }
});
