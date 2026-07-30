import assert from "node:assert/strict";
import { test } from "node:test";
import type { MechanicsState } from "@ai-dnd/contracts";
import {
  assertMechanicsActionAllowed,
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
