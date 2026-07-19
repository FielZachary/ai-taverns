import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiTavernsProductPersonality,
  gameRulesAndDesignDefaults,
  hardRuntimeContract
} from "./dm-prompt-layers.js";

describe("DM prompt spell saving throw guidance", () => {
  it("instructs the DM to roll NPC saves before requesting player damage", () => {
    assert.match(
      hardRuntimeContract,
      /roll those NPC\/enemy saving throws immediately as the DM/
    );
    assert.match(hardRuntimeContract, /report each target's exact d20 total/);
    assert.match(
      hardRuntimeContract,
      /Do not put NPC\/enemy saving throws in `roll_requests`/
    );
    assert.match(hardRuntimeContract, /Roll <damage dice> for <spell> damage/);
  });

  it("exempts pending spell damage from normal narration length and vividness pressure", () => {
    assert.match(aiTavernsProductPersonality, /unless the turn must stop for unresolved dice/);
    assert.match(
      aiTavernsProductPersonality,
      /spell saving throws followed by pending damage/
    );
    assert.match(hardRuntimeContract, /exempt from the normal minimum word count/);
    assert.match(hardRuntimeContract, /vivid narration guidance/);
  });

  it("includes a mechanical Fireball example with saves and one damage request", () => {
    assert.match(gameRulesAndDesignDefaults, /KAKA casts Fireball/);
    assert.match(gameRulesAndDesignDefaults, /Elara Thornwood rolls 9 and fails/);
    assert.match(gameRulesAndDesignDefaults, /The first ash guard rolls 17 and succeeds/);
    assert.match(gameRulesAndDesignDefaults, /"dice": "8d6"/);
    assert.match(gameRulesAndDesignDefaults, /"label": "Fireball damage"/);
  });

  it("requires mechanics state updates for tracked combat HP and conditions", () => {
    assert.match(hardRuntimeContract, /Always include top-level `mechanics_state_update`/);
    assert.match(hardRuntimeContract, /every affected tracked actor/);
    assert.match(hardRuntimeContract, /even if they remain above 0 HP/);
    assert.match(hardRuntimeContract, /`currentHp` above 0/);
  });

  it("instructs the DM to start and advance initiative during combat", () => {
    assert.match(hardRuntimeContract, /When hostilities start/);
    assert.match(hardRuntimeContract, /ask the acting player to roll initiative/);
    assert.match(hardRuntimeContract, /include the same initiative roll in `roll_requests`/);
    assert.match(hardRuntimeContract, /include `mechanics_state_update\.combat`/);
    assert.match(hardRuntimeContract, /provisional `initiativeOrder` as an array of actor-key strings/);
    assert.match(hardRuntimeContract, /`turnOwner` to the acting player/);
    assert.match(hardRuntimeContract, /advance `turnOwner` to the next actor/);
    assert.match(hardRuntimeContract, /Combat-capable enemies should act on their turns/);
  });
});
