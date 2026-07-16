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
  it("accepts valid DM JSON wrapped in surrounding text", () => {
    const result = parseHermesDmContract(
      [
        "Here is the response:",
        contract("The red banner snaps in the wind. What do you do?"),
        "Done."
      ].join("\n")
    );

    assert.equal(
      result.publicNarration,
      "The red banner snaps in the wind.\n\nWhat do you do?"
    );
    assert.equal(result.nextInputNeeded, "player_actions");
  });

  it("accepts valid DM JSON inside a fenced code block", () => {
    const result = parseHermesDmContract(
      [
        "```json",
        contract("The campfire pops as Yenna gestures you inside. What do you do?"),
        "```"
      ].join("\n")
    );

    assert.equal(
      result.publicNarration,
      "The campfire pops as Yenna gestures you inside.\n\nWhat do you do?"
    );
    assert.equal(result.nextInputNeeded, "player_actions");
  });

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
          "Player: I go east out of town towards the marked destination"
        ].join("\n"),
        currentPlayerAction: "I go east out of town towards the marked destination"
      }
    );

    assert.equal(result.nextInputNeeded, "player_actions");
    assert.equal(result.rollRequests.length, 0);
  });

  it("does not treat multiplayer character sheet equipment as submitted combat", () => {
    const result = parseHermesDmContract(
      contract(
        "The wounded courier goes still long enough to listen, then points toward the chapel door. What do you do?"
      ),
      {
        currentAction: [
          "Canonical player characters:",
          "1. Player One playing Character One",
          "Character sheet:",
          "Class: Fighter",
          "Equipment: longsword, shield, bow",
          "",
          "2. Player Two playing Character Two",
          "Character sheet:",
          "Spells: fire bolt, magic missile",
          "",
          "Current party actions:",
          "Player One (Character One): I ask the courier who attacked the village.",
          "Player Two (Character Two): I watch the chapel windows."
        ].join("\n"),
        currentPlayerAction: [
          "Player One (Character One): I ask the courier who attacked the village.",
          "Player Two (Character Two): I watch the chapel windows."
        ].join("\n")
      }
    );

    assert.equal(result.nextInputNeeded, "player_actions");
    assert.equal(result.rollRequests.length, 0);
  });

  it("does not treat non-attacking weapon references as combat actions", () => {
    const result = parseHermesDmContract(
      contract(
        "The wounded guard accepts the sword hilt-first and tells you the bridge is still held. What do you do?"
      ),
      {
        currentPlayerAction: "I offer my sword to the wounded guard hilt-first."
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

  it("allows campaign openers to narrate danger without treating setup text as a player attack", () => {
    const result = parseHermesDmContract(
      contract(
        "Smoke rises from the watchtower where the first attack has already left the gate blackened. The road ahead splits between a wounded courier and a blocked bridge. What do you do?"
      ),
      {
        currentAction: [
          "Current player action:",
          "Begin the campaign with a strong opener.",
          "Introduce an immediate obstacle, threat, discovery, or combat trigger.",
          "Return no player-facing roll requests unless danger already requires dice."
        ].join("\n"),
        allowResolvedCombatWithoutRolls: true
      }
    );

    assert.equal(result.nextInputNeeded, "player_actions");
    assert.equal(result.rollRequests.length, 0);
  });
});
