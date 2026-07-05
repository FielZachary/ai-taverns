import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHermesDmContract } from "./hermes.js";

function contract(publicNarration: string) {
  return JSON.stringify({
    public_narration: publicNarration,
    roll_requests: [],
    next_input_needed: "player_actions"
  });
}

describe("parseHermesDmContract combat roll guard", () => {
  it("does not treat character sheet combat terms as the submitted action", () => {
    const result = parseHermesDmContract(
      contract(
        "You follow the muddy path until a hooded lantern burns steadily at the fork. What do you do?"
      ),
      {
        currentAction: [
          "Canonical player characters:",
          "Class: Fighter",
          "Equipment: longsword, shield, bow",
          "",
          "Current player action:",
          "Player: I go east out of town towards the barrow"
        ].join("\n"),
        currentPlayerAction: "I go east out of town towards the barrow"
      }
    );

    assert.equal(result.nextInputNeeded, "player_actions");
    assert.equal(result.rollRequests.length, 0);
  });

  it("still rejects an unresolved attack narrated as a hit", () => {
    assert.throws(
      () =>
        parseHermesDmContract(
          contract("Your sword hits the goblin and wounds it badly."),
          {
            currentPlayerAction: "I attack the goblin with my sword"
          }
        ),
      /resolved a player combat action without structured roll_requests/
    );
  });

  it("still rejects an unresolved spell narrated as damage", () => {
    assert.throws(
      () =>
        parseHermesDmContract(
          contract("The fireball detonates among the skeletons, destroying them."),
          {
            currentPlayerAction: "I cast fireball at the skeletons"
          }
        ),
      /resolved a player combat action without structured roll_requests/
    );
  });
});
