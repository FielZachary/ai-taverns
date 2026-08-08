import assert from "node:assert/strict";
import { test } from "node:test";
import type { MechanicsState } from "@ai-dnd/contracts";
import {
  applyRestMechanics,
  applyDeathSavingThrow,
  assertMechanicsActionAllowed,
  deriveResourcesForClass,
  firstDyingPlayerActorKey,
  formatResourceLines,
  formatSpellSlotLines,
  isDyingPlayerActor,
  mechanicsSeedFromCharacterInput,
  projectMechanicsIntoCharacterSheet,
  reviveDeadPlayerActor,
  resolveMechanicsState
} from "./mechanics.js";

const player = {
  id: "vayne",
  character_name: "Vayne",
  character_sheet: "A spellcaster."
};

function combatState(turnOwner: string): MechanicsState {
  return {
    combat: {
      active: true,
      round: 2,
      turnOwner,
      initiativeOrder: ["player:vayne", "npc:cutlass-raider"]
    },
    actors: {
      "player:vayne": {
        characterName: "Vayne",
        currentHp: 20,
        maxHp: 20,
        conditions: []
      },
      "player:nyra": {
        characterName: "Nyra",
        currentHp: 18,
        maxHp: 18,
        conditions: []
      },
      "npc:cutlass-raider": {
        characterName: "Cutlass raider",
        currentHp: 12,
        maxHp: 12,
        conditions: []
      }
    }
  };
}

test("combat action guard allows player input when NPC actor key owns the turn", () => {
  assert.doesNotThrow(() =>
    assertMechanicsActionAllowed({
      state: combatState("npc:cutlass-raider"),
      player,
      message: "I cast Scorching Ray."
    })
  );
});

test("combat action guard allows player input when NPC display name owns the turn", () => {
  assert.doesNotThrow(() =>
    assertMechanicsActionAllowed({
      state: combatState("Cutlass raider"),
      player,
      message: "I cast Scorching Ray."
    })
  );
});

test("combat action guard still rejects combat actions owned by another player", () => {
  assert.throws(
    () =>
      assertMechanicsActionAllowed({
        state: combatState("player:nyra"),
        player,
        message: "I cast Scorching Ray."
      }),
    /It is not your turn/
  );
});

test("mechanics state infers tracked spell slots from explicit caster prose", () => {
  const state = resolveMechanicsState(
    { metadata: {} },
    [
      {
        id: "seren",
        character_name: "Seren",
        character_sheet:
          "A level 5 wizard with AC 14, 20 HP, initiative +2, Fireball, and poor impulse control."
      }
    ]
  );

  assert.deepEqual(state.actors["player:seren"]?.spellSlots, {
    "1": { max: 4, used: 0 },
    "2": { max: 3, used: 0 },
    "3": { max: 2, used: 0 }
  });
  assert.equal(state.actors["player:seren"]?.maxHp, 20);
  assert.equal(state.actors["player:seren"]?.currentHp, 20);
  assert.equal(state.actors["player:seren"]?.characterClass, "wizard");
  assert.equal(state.actors["player:seren"]?.level, 5);

  assert.doesNotThrow(() =>
    assertMechanicsActionAllowed({
      state,
      player: {
        id: "seren",
        character_name: "Seren",
        character_sheet:
          "A level 5 wizard with AC 14, 20 HP, initiative +2, Fireball, and poor impulse control."
      },
      message: "I cast Fireball on Mara."
    })
  );
});

test("mechanics state backfills class and level from sheet for old actors", () => {
  const state = resolveMechanicsState(
    {
      metadata: {
        mechanicsState: {
          combat: {
            active: false,
            round: 0,
            turnOwner: null,
            initiativeOrder: []
          },
          actors: {
            "player:jacki": {
              characterName: "Jacki",
              currentHp: 28,
              maxHp: 28,
              spellSlots: {
                "3": { max: 2, used: 1 }
              },
              concentration: null,
              conditions: []
            }
          }
        }
      }
    },
    [
      {
        id: "jacki",
        character_name: "Jacki",
        character_sheet: "Character Name: Jacki\nLevel: 5\nClass: Warlock\nMax HP: 28"
      }
    ]
  );

  assert.equal(state.actors["player:jacki"]?.characterClass, "Warlock");
  assert.equal(state.actors["player:jacki"]?.level, 5);
  assert.deepEqual(state.actors["player:jacki"]?.spellSlots, {
    "3": { max: 2, used: 1 }
  });
});

test("warlock spell slot projection uses pact magic labels", () => {
  assert.deepEqual(
    formatSpellSlotLines(
      {
        "3": { max: 2, used: 2 }
      },
      { characterClass: "Warlock" }
    ),
    [
      "Pact Magic slots: 2 total, 2 used, 0 remaining",
      "Pact slot level: 3rd"
    ]
  );

  const projected = projectMechanicsIntoCharacterSheet(
    [
      "Character Name: Jacki",
      "Level: 5",
      "Class: Warlock",
      "",
      "Spell Slots",
      "1st-level slots: 4 total, 0 used, 4 remaining",
      "2nd-level slots: 3 total, 0 used, 3 remaining",
      "3rd-level slots: 2 total, 2 used, 0 remaining"
    ].join("\n"),
    {
      characterName: "Jacki",
      characterClass: "Warlock",
      level: 5,
      spellSlots: {
        "3": { max: 2, used: 2 }
      },
      concentration: null,
      conditions: []
    }
  );

  assert.match(projected, /Pact Magic slots: 2 total, 2 used, 0 remaining/);
  assert.match(projected, /Pact slot level: 3rd/);
  assert.doesNotMatch(projected, /1st-level slots/);
  assert.doesNotMatch(projected, /2nd-level slots/);
  assert.doesNotMatch(projected, /3rd-level slots/);
});

test("mechanics seed derives common class resources from class and level", () => {
  const sorcererSeed = mechanicsSeedFromCharacterInput({
    characterClass: "Sorcerer",
    level: 5,
    maxHp: 32
  });

  assert.deepEqual(sorcererSeed.resources?.sorcery_points, {
    label: "Sorcery Points",
    max: 5,
    used: 0,
    recharge: "long_rest",
    source: "Sorcerer"
  });

  assert.deepEqual(deriveResourcesForClass("Monk", 5)?.ki_points, {
    label: "Ki Points",
    max: 5,
    used: 0,
    recharge: "short_rest",
    source: "Monk"
  });

  assert.deepEqual(deriveResourcesForClass("Barbarian", 5)?.rages, {
    label: "Rages",
    max: 3,
    used: 0,
    recharge: "long_rest",
    source: "Barbarian"
  });

  assert.deepEqual(deriveResourcesForClass("Fighter", 2), {
    second_wind: {
      label: "Second Wind",
      max: 1,
      used: 0,
      recharge: "short_rest",
      source: "Fighter"
    },
    action_surge: {
      label: "Action Surge",
      max: 1,
      used: 0,
      recharge: "short_rest",
      source: "Fighter"
    }
  });

  assert.deepEqual(deriveResourcesForClass("Paladin", 3), {
    lay_on_hands: {
      label: "Lay on Hands",
      max: 15,
      used: 0,
      recharge: "long_rest",
      source: "Paladin"
    },
    channel_divinity: {
      label: "Channel Divinity",
      max: 1,
      used: 0,
      recharge: "short_rest",
      source: "Paladin"
    }
  });

  assert.deepEqual(deriveResourcesForClass("Wizard", 5)?.arcane_recovery, {
    label: "Arcane Recovery",
    max: 1,
    used: 0,
    recharge: "long_rest",
    source: "Wizard"
  });

  assert.equal(deriveResourcesForClass("Rogue", 5), undefined);
});

test("mechanics state infers class resources from legacy character sheet", () => {
  const state = resolveMechanicsState(
    { metadata: {} },
    [
      {
        id: "tem",
        character_name: "Tem",
        character_sheet: "Class: Monk\nLevel: 5\nMax HP: 34"
      }
    ]
  );

  assert.equal(state.actors["player:tem"]?.resources?.ki_points?.max, 5);
});

test("mechanics state infers explicit sheet-only class resources", () => {
  const state = resolveMechanicsState(
    { metadata: {} },
    [
      {
        id: "lute",
        character_name: "Lute",
        character_sheet:
          "Class: Bard\nLevel: 5\nMax HP: 31\nBardic Inspiration: 3 total, 0 used, 3 remaining"
      },
      {
        id: "brann",
        character_name: "Brann",
        character_sheet:
          "Class: Fighter\nLevel: 5\nMax HP: 44\nBattle Master\nSuperiority Dice"
      },
      {
        id: "sera",
        character_name: "Sera",
        character_sheet:
          "Class: Paladin\nLevel: 5\nMax HP: 42\nDivine Sense: 4 total, 0 used, 4 remaining"
      },
      {
        id: "shade",
        character_name: "Shade",
        character_sheet: "Class: Rogue\nLevel: 5\nMax HP: 33"
      }
    ]
  );

  assert.deepEqual(state.actors["player:lute"]?.resources?.bardic_inspiration, {
    label: "Bardic Inspiration",
    max: 3,
    used: 0,
    recharge: "short_rest",
    source: "Bard"
  });
  assert.deepEqual(state.actors["player:brann"]?.resources?.superiority_dice, {
    label: "Superiority Dice",
    max: 4,
    used: 0,
    recharge: "short_rest",
    source: "Fighter"
  });
  assert.deepEqual(state.actors["player:sera"]?.resources?.divine_sense, {
    label: "Divine Sense",
    max: 4,
    used: 0,
    recharge: "long_rest",
    source: "Paladin"
  });
  assert.equal(state.actors["player:shade"]?.resources, undefined);
});

test("mechanics state sanitizes persisted class resources", () => {
  const state = resolveMechanicsState(
    {
      metadata: {
        mechanicsState: {
          combat: {
            active: false,
            round: 0,
            turnOwner: null,
            initiativeOrder: []
          },
          actors: {
            "player:seren": {
              characterName: "Seren",
              resources: {
                sorcery_points: {
                  label: "Sorcery Points",
                  max: 5,
                  used: 9,
                  recharge: "long_rest",
                  source: "Sorcerer"
                },
                broken: {
                  label: "Broken",
                  max: 1,
                  used: 0,
                  recharge: "whenever"
                }
              }
            }
          }
        }
      }
    },
    []
  );

  assert.deepEqual(state.actors["player:seren"]?.resources, {
    sorcery_points: {
      label: "Sorcery Points",
      max: 5,
      used: 5,
      recharge: "long_rest",
      source: "Sorcerer"
    }
  });
});

test("projected character sheet includes class resource lines", () => {
  const projected = projectMechanicsIntoCharacterSheet("Max HP: 32", {
    characterName: "Seren",
    resources: {
      sorcery_points: {
        label: "Sorcery Points",
        max: 5,
        used: 2,
        recharge: "long_rest"
      }
    }
  });

  assert.match(projected, /Class Resources/);
  assert.match(projected, /Sorcery Points: 5 total, 2 used, 3 remaining/);
  assert.deepEqual(formatResourceLines({
    ki_points: {
      label: "Ki Points",
      max: 5,
      used: 1,
      recharge: "short_rest"
    }
  }), ["Ki Points: 5 total, 1 used, 4 remaining, recovers on short rest"]);
});

test("rest mechanics restores resources and long-rest spell slots", () => {
  const baseState: MechanicsState = {
    combat: {
      active: false,
      round: 0,
      turnOwner: null,
      initiativeOrder: []
    },
    actors: {
      "player:seren": {
        characterName: "Seren",
        currentHp: 10,
        maxHp: 32,
        spellSlots: {
          "1": { max: 4, used: 2 }
        },
        resources: {
          sorcery_points: {
            label: "Sorcery Points",
            max: 5,
            used: 3,
            recharge: "long_rest"
          },
          channel_divinity: {
            label: "Channel Divinity",
            max: 1,
            used: 1,
            recharge: "short_rest"
          }
        }
      }
    }
  };

  const shortRest = applyRestMechanics({
    state: baseState,
    actorKey: "player:seren",
    restType: "short_rest"
  });

  assert.equal(shortRest.actors["player:seren"]?.spellSlots?.["1"]?.used, 2);
  assert.equal(
    shortRest.actors["player:seren"]?.resources?.sorcery_points?.used,
    3
  );
  assert.equal(
    shortRest.actors["player:seren"]?.resources?.channel_divinity?.used,
    0
  );

  const longRest = applyRestMechanics({
    state: baseState,
    actorKey: "player:seren",
    restType: "long_rest"
  });

  assert.equal(longRest.actors["player:seren"]?.currentHp, 32);
  assert.equal(longRest.actors["player:seren"]?.spellSlots?.["1"]?.used, 0);
  assert.equal(
    longRest.actors["player:seren"]?.resources?.sorcery_points?.used,
    0
  );
});

test("mechanics state clamps persisted negative HP to zero", () => {
  const state = resolveMechanicsState(
    {
      metadata: {
        mechanicsState: {
          combat: {
            active: false,
            round: 0,
            turnOwner: null,
            initiativeOrder: []
          },
          actors: {
            "player:vayne": {
              characterName: "Vayne",
              currentHp: -2,
              maxHp: 20,
              conditions: ["unconscious"]
            }
          }
        }
      }
    },
    []
  );

  assert.equal(state.actors["player:vayne"]?.currentHp, 0);
  assert.equal(state.actors["player:vayne"]?.maxHp, 20);
  assert.deepEqual(state.actors["player:vayne"]?.conditions, ["unconscious"]);
});

test("mechanics state preserves persisted NPC armor class", () => {
  const state = resolveMechanicsState(
    {
      metadata: {
        mechanicsState: {
          combat: {
            active: true,
            round: 1,
            turnOwner: "player:vayne",
            initiativeOrder: ["player:vayne", "npc:acolyte-1"]
          },
          actors: {
            "npc:acolyte-1": {
              characterName: "Unbound Word Acolyte",
              currentHp: 9,
              maxHp: 9,
              armorClass: 13,
              attackBonus: 4,
              damageFormula: "1d6 + 2",
              saveBonuses: {
                dex: 2,
                wis: -1
              },
              abilityModifiers: {
                str: 1,
                dex: 2
              },
              allegiance: "hostile",
              isPlayerControlled: false,
              conditions: []
            }
          }
        }
      }
    },
    []
  );

  assert.equal(state.actors["npc:acolyte-1"]?.armorClass, 13);
  assert.equal(state.actors["npc:acolyte-1"]?.attackBonus, 4);
  assert.equal(state.actors["npc:acolyte-1"]?.damageFormula, "1d6 + 2");
  assert.equal(state.actors["npc:acolyte-1"]?.saveBonuses?.dex, 2);
  assert.equal(state.actors["npc:acolyte-1"]?.saveBonuses?.wis, -1);
  assert.equal(state.actors["npc:acolyte-1"]?.abilityModifiers?.str, 1);
  assert.equal(state.actors["npc:acolyte-1"]?.allegiance, "hostile");
  assert.equal(state.actors["npc:acolyte-1"]?.isPlayerControlled, false);
});

function dyingState(
  deathSaves: { successes: number; failures: number } = {
    successes: 0,
    failures: 0
  }
): MechanicsState {
  return {
    combat: {
      active: true,
      round: 4,
      turnOwner: "player:vayne",
      initiativeOrder: ["player:vayne", "npc:cutlass-raider"]
    },
    actors: {
      "player:vayne": {
        characterName: "Vayne",
        currentHp: 0,
        maxHp: 20,
        allegiance: "ally",
        isPlayerControlled: true,
        conditions: ["unconscious"],
        deathSaves
      }
    }
  };
}

test("death save helper detects dying player actors", () => {
  const state = dyingState();

  assert.equal(firstDyingPlayerActorKey(state), "player:vayne");
  assert.equal(isDyingPlayerActor(state.actors["player:vayne"]), true);
});

test("death save natural 1 counts as two failures", () => {
  const result = applyDeathSavingThrow({
    state: dyingState({ successes: 1, failures: 0 }),
    actorKey: "player:vayne",
    roll: 1
  });
  const actor = result.state.actors["player:vayne"];

  assert.equal(result.outcome, "failure");
  assert.deepEqual(actor?.deathSaves, { successes: 1, failures: 2 });
  assert.deepEqual(actor?.conditions, ["unconscious"]);
});

test("death save natural 20 revives at 1 HP", () => {
  const result = applyDeathSavingThrow({
    state: dyingState({ successes: 0, failures: 2 }),
    actorKey: "player:vayne",
    roll: 20
  });
  const actor = result.state.actors["player:vayne"];

  assert.equal(result.outcome, "revived");
  assert.equal(actor?.currentHp, 1);
  assert.equal(actor?.deathSaves, undefined);
  assert.deepEqual(actor?.conditions, []);
});

test("three death save successes stabilize at 0 HP", () => {
  const result = applyDeathSavingThrow({
    state: dyingState({ successes: 2, failures: 1 }),
    actorKey: "player:vayne",
    roll: 12
  });
  const actor = result.state.actors["player:vayne"];

  assert.equal(result.outcome, "stabilized");
  assert.equal(actor?.currentHp, 0);
  assert.equal(actor?.deathSaves, undefined);
  assert.deepEqual(actor?.conditions, ["unconscious", "stable"]);
});

test("three death save failures kill the character", () => {
  const result = applyDeathSavingThrow({
    state: dyingState({ successes: 1, failures: 2 }),
    actorKey: "player:vayne",
    roll: 3
  });
  const actor = result.state.actors["player:vayne"];

  assert.equal(result.outcome, "dead");
  assert.equal(actor?.currentHp, 0);
  assert.equal(actor?.deathSaves, undefined);
  assert.deepEqual(actor?.conditions, ["dead"]);
});

test("revive dead player restores full HP and clears death conditions", () => {
  const deadState = applyDeathSavingThrow({
    state: dyingState({ successes: 0, failures: 2 }),
    actorKey: "player:vayne",
    roll: 2
  }).state;
  const revived = reviveDeadPlayerActor({
    state: deadState,
    actorKey: "player:vayne"
  });
  const actor = revived.actors["player:vayne"];

  assert.equal(actor?.currentHp, 20);
  assert.equal(actor?.deathSaves, undefined);
  assert.deepEqual(actor?.conditions, []);
  assert.deepEqual(revived.combat, {
    active: false,
    round: 0,
    turnOwner: null,
    initiativeOrder: []
  });
});
