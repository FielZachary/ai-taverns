import assert from "node:assert/strict";
import { test } from "node:test";
import type { MechanicsState } from "@ai-dnd/contracts";
import {
  applyDeathSavingThrow,
  assertMechanicsActionAllowed,
  firstDyingPlayerActorKey,
  isDyingPlayerActor,
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
