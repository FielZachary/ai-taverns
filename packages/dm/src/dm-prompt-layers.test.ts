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
});
