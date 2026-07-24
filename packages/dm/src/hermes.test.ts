import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debugHermesDmContractFailure,
  extractHermesRollRequest,
  extractHermesRollRequests,
  isInternalHermesMessage,
  normalizeHermesContent,
  normalizeHermesDmContent,
  normalizeRollRequest,
  normalizeRollRequests,
  parseHermesDmContract,
  titleFromSessionId
} from "./hermes.js";

function contract(publicNarration: string) {
  return JSON.stringify({
    public_narration: publicNarration,
    roll_requests: [],
    next_input_needed: "player_actions"
  });
}

describe("parseHermesDmContract", () => {
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
    assert.equal(result.resolutionMode, "resolved_without_dice");
  });

  it("infers and validates resolution_mode", () => {
    const resolved = parseHermesDmContract(
      JSON.stringify({
        public_narration: "The door opens. What do you do?",
        roll_requests: [],
        next_input_needed: "player_actions"
      })
    );
    const needsDice = parseHermesDmContract(
      JSON.stringify({
        public_narration: "Roll 1d20 for Athletics.",
        resolution_mode: "needs_dice",
        roll_requests: [{ dice: "1d20", label: "Athletics" }],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(resolved.resolutionMode, "resolved_without_dice");
    assert.equal(needsDice.resolutionMode, "needs_dice");
    assert.throws(
      () =>
        parseHermesDmContract(
          JSON.stringify({
            public_narration: "Roll 1d20 for Athletics.",
            resolution_mode: "resolved_without_dice",
            roll_requests: [{ dice: "1d20", label: "Athletics" }],
            next_input_needed: "dice_results"
          })
        ),
      /resolution_mode that conflicts/
    );
  });

  it("rejects attack roll and AC contradictions", () => {
    assert.throws(
      () =>
        parseHermesDmContract(
          contract(
            "The raider fires. Attack roll: 13 vs AC 10 - miss. The bolt skips off the stone. What do you do?"
          )
        ),
      /contradicted an attack roll and AC comparison/
    );

    assert.throws(
      () =>
        parseHermesDmContract(
          contract(
            "The arcanist hurls fire. Spell attack roll: 9 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
          )
        ),
      /contradicted an attack roll and AC comparison/
    );

    assert.throws(
      () =>
        parseHermesDmContract(
          contract(
            "The arcanist hurls fire. Spell attack roll: d20 + 7 = 10 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
          )
        ),
      /contradicted an attack roll and AC comparison/
    );
  });

  it("accepts correct attack roll and AC comparisons", () => {
    const hit = parseHermesDmContract(
      contract(
        "The raider fires. Attack roll: 13 vs AC 10 - hit. Damage roll: 1d8 + 2 = 7 piercing damage."
      )
    );
    const miss = parseHermesDmContract(
      contract("The archer fires. Attack roll: 9 vs AC 15 - miss.")
    );
    const spellHit = parseHermesDmContract(
      contract(
        "The arcanist hurls fire. Spell attack roll: d20 + 7 = 18 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
      )
    );

    assert.match(hit.publicNarration, /13 vs AC 10 - hit/);
    assert.match(miss.publicNarration, /9 vs AC 15 - miss/);
    assert.match(spellHit.publicNarration, /18 vs AC 15 - hit/);
  });

  it("normalizes settings, input targeting, roll narration, and legacy field names", () => {
    const result = parseHermesDmContract(
      JSON.stringify({
        public_narration: "The shadow slips behind the altar.",
        roll_requests: [
          {
            id: "roll-1",
            dice: "1d20",
            label: "Perception",
            modifier: 3,
            advantage_state: "advantage"
          }
        ],
        next_input_needed: "dice_results",
        inputTargets: ["Mira"],
        inputPolicy: "only_targeted_players",
        setting: {
          displayLocation: "Saltwatch Chapel",
          worldName: "Brinefall",
          startingLocation: "Harbor Road"
        }
      })
    );

    assert.equal(
      result.publicNarration,
      "The shadow slips behind the altar.\n\nRoll 1d20 + 3 at advantage for Perception."
    );
    assert.equal(result.nextInputNeeded, "dice_results");
    assert.equal(result.inputPolicy, "only_targeted_players");
    assert.deepEqual(result.inputTargets, ["Mira"]);
    assert.deepEqual(result.setting, {
      displayLocation: "Saltwatch Chapel",
      worldName: "Brinefall",
      startingLocation: "Harbor Road"
    });
  });

  it("keeps roll narration unchanged when dice are already covered", () => {
    const result = parseHermesDmContract(
      JSON.stringify({
        public_narration: "Roll 1d20 to wrench the wheel free.",
        roll_requests: [{ id: "roll-1", dice: "1d20", label: "Athletics" }],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(result.publicNarration, "Roll 1d20 to wrench the wheel free.");
  });

  it("rejects invalid contract shapes", () => {
    assert.throws(
      () => parseHermesDmContract("not json"),
      /invalid JSON/
    );
    assert.throws(
      () =>
        parseHermesDmContract(
          JSON.stringify({
            public_narration: "",
            roll_requests: [],
            next_input_needed: "player_actions"
          })
        ),
      /missing public_narration/
    );
    assert.throws(
      () =>
        parseHermesDmContract(
          JSON.stringify({
            public_narration: "The tide growls below.",
            roll_requests: [],
            next_input_needed: "wait"
          })
        ),
      /invalid next_input_needed/
    );
    assert.throws(
      () =>
        parseHermesDmContract(
          JSON.stringify({
            public_narration: "The ledge cracks underfoot.",
            roll_requests: [],
            next_input_needed: "dice_results"
          })
        ),
      /without structured roll_requests/
    );
    assert.throws(
      () =>
        parseHermesDmContract(
          JSON.stringify({
            public_narration: "Make a Dexterity saving throw.",
            roll_requests: [],
            next_input_needed: "player_actions"
          })
        ),
      /without structured roll_requests/
    );
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

  it("preserves mechanics state updates from DM JSON", () => {
    const result = parseHermesDmContract(
      JSON.stringify({
        public_narration: "Mara staggers but keeps her feet. What do you do?",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players",
        mechanics_state_update: {
          actors: {
            "npc:mara": {
              characterName: "Mara",
              currentHp: 33,
              maxHp: 45,
              conditions: []
            }
          }
        }
      })
    );

    assert.deepEqual(result.mechanicsStateUpdate, {
      actors: {
        "npc:mara": {
          characterName: "Mara",
          currentHp: 33,
          maxHp: 45,
          conditions: []
        }
      }
    });
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

  it("accepts combat outcomes narrated without structured roll requests", () => {
    const result = parseHermesDmContract(
      contract("Your sword hits the goblin and wounds it badly."),
      {
        currentPlayerAction: "I attack the goblin with my sword"
      }
    );

    assert.equal(
      result.publicNarration,
      "Your sword hits the goblin and wounds it badly."
    );
    assert.equal(result.nextInputNeeded, "player_actions");
    assert.deepEqual(result.rollRequests, []);
  });

  it("accepts spell outcomes narrated without structured roll requests", () => {
    const result = parseHermesDmContract(
      contract("The fireball detonates among the skeletons, destroying them."),
      {
        currentPlayerAction: "I cast fireball at the skeletons"
      }
    );

    assert.equal(
      result.publicNarration,
      "The fireball detonates among the skeletons, destroying them."
    );
    assert.equal(result.nextInputNeeded, "player_actions");
    assert.deepEqual(result.rollRequests, []);
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

describe("Hermes DM helpers", () => {
  it("derives display titles and recognizes internal prompts", () => {
    assert.equal(titleFromSessionId("ai-dnd-123456789"), "D&D Session 456789");
    assert.equal(titleFromSessionId("ai-dnd-salt-wind"), "Salt Wind");
    assert.equal(isInternalHermesMessage("AI_DND_INTERNAL_OPENING_REQUEST: begin"), true);
    assert.equal(isInternalHermesMessage("The harbor bell rings."), false);
  });

  it("normalizes visible narration from contracts and legacy provider text", () => {
    assert.equal(
      normalizeHermesDmContent(contract("The lantern guttered. What do you do?")),
      "The lantern guttered.\n\nWhat do you do?"
    );
    assert.equal(
      normalizeHermesContent('Table{"success":true}\nDungeon Master The door opens.'),
      "The door opens."
    );
    assert.equal(normalizeHermesContent("Plain tavern talk."), "Plain tavern talk.");
    assert.equal(normalizeHermesContent(undefined), "");
  });

  it("normalizes roll request variants", () => {
    const request = normalizeRollRequest({
      check: "Investigation",
      player: "Nia",
      modifier: -1,
      advantageState: "disadvantage"
    });

    assert.equal(request?.dice, "1d20");
    assert.equal(request?.label, "Investigation");
    assert.equal(request?.player, "Nia");
    assert.equal(request?.modifier, -1);
    assert.equal(request?.advantageState, "disadvantage");

    assert.deepEqual(normalizeRollRequest(null), null);
    assert.equal(normalizeRollRequests({ reason: "Stealth" }).length, 1);
    assert.deepEqual(normalizeRollRequests(undefined), []);
  });

  it("extracts roll requests from contract and legacy response shapes", () => {
    const contractRequests = extractHermesRollRequests({
      message: {
        content: JSON.stringify({
          public_narration: "The lock resists.",
          roll_requests: [{ id: "roll-1", dice: "1d20", label: "Thieves' Tools" }],
          next_input_needed: "dice_results"
        })
      }
    });

    assert.equal(contractRequests[0]?.label, "Thieves' Tools");

    assert.equal(
      extractHermesRollRequest({
        message: {
          content: "legacy prose",
          roll_request: { dice: "1d20", reason: "Survival" }
        }
      })?.label,
      "Survival"
    );
    assert.deepEqual(extractHermesRollRequests("no request"), []);
  });

  it("summarizes contract failures for debug output", () => {
    const debug = debugHermesDmContractFailure(
      JSON.stringify({
        public_narration: "Make a Wisdom save.",
        roll_requests: [{ dice: "1d20", label: "Wisdom save" }],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(debug.hasJsonObject, true);
    assert.equal(debug.publicNarrationLength > 0, true);
    assert.equal(debug.rollRequestsCount, 1);
    assert.deepEqual(debug.rollRequestLabels, ["Wisdom save"]);
    assert.equal(debug.mentionsPlayerFacingRoll, true);
  });
});
