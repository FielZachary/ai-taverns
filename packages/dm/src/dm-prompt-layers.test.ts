import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dungeonMasterInstructions } from "./dm-prompt-layers.js";

describe("dungeonMasterInstructions examples", () => {
  it("fences examples off from campaign content reuse", () => {
    assert.match(
      dungeonMasterInstructions,
      /examples demonstrate response shape, pacing, and roll structure only/i,
    );
    assert.match(
      dungeonMasterInstructions,
      /Do not reuse their names, places, NPCs, clues, objects, monsters, destinations, or premises/,
    );
  });

  it("does not inject sticky starter-adventure nouns", () => {
    const forbiddenExampleAnchors = [
      "Thornwood",
      "Marta",
      "Barrow seal",
      "Crimson shard",
      "Edrin Vale",
      "Warden awake",
    ];

    for (const anchor of forbiddenExampleAnchors) {
      assert.doesNotMatch(dungeonMasterInstructions, new RegExp(anchor, "i"));
    }
  });
});
