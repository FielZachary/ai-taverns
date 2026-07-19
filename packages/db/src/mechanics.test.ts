import assert from "node:assert/strict";
import { test } from "node:test";
import type { MechanicsState } from "@ai-dnd/contracts";
import { assertMechanicsActionAllowed } from "./mechanics.js";

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
