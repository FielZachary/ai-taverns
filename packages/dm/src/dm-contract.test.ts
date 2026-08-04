import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debugDmContractFailure,
  extractDmProviderRollRequest,
  extractDmProviderRollRequests,
  isInternalDmProviderMessage,
  normalizeDmProviderContent,
  normalizeDmContractContent,
  normalizeRollRequest,
  normalizeRollRequests,
  parseDmContract,
  rollRequestDiagnostics,
  titleFromSessionId
} from "./dm-contract.js";

function contract(publicNarration: string) {
  return JSON.stringify({
    public_narration: publicNarration,
    roll_requests: [],
    next_input_needed: "player_actions"
  });
}

describe("parseDmContract", () => {
  it("accepts valid DM JSON wrapped in surrounding text", () => {
    const result = parseDmContract(
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

  it("normalizes narration highlights from exact public narration phrases", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration:
          "Captain Vael lowers the black key onto the Harbor Watch ledger. What do you do?",
        narration_highlights: [
          { text: "Captain Vael", color_role: "npc" },
          { text: "black key", color_role: "object" },
          { text: "missing phrase", color_role: "clue" },
          { text: "Harbor Watch", color_role: "invalid" }
        ],
        roll_requests: [],
        next_input_needed: "player_actions"
      })
    );

    assert.deepEqual(result.narrationHighlights, [
      { text: "Captain Vael", colorRole: "npc" },
      { text: "black key", colorRole: "object" }
    ]);
  });

  it("preserves many exact narration highlights for combat math", () => {
    const phrases = Array.from({ length: 8 }, (_, index) => {
      const roll = 10 + index;
      return `rolled a ${roll}`;
    });
    const result = parseDmContract(
      JSON.stringify({
        public_narration: `${phrases.join(". ")}. What do you do?`,
        narration_highlights: phrases.map((text) => ({
          text,
          color_role: "clue"
        })),
        roll_requests: [],
        next_input_needed: "player_actions"
      })
    );

    assert.equal(result.narrationHighlights.length, phrases.length);
    assert.deepEqual(
      result.narrationHighlights.map((highlight) => highlight.text),
      phrases
    );
  });

  it("infers and validates resolution_mode", () => {
    const resolved = parseDmContract(
      JSON.stringify({
        public_narration: "The door opens. What do you do?",
        roll_requests: [],
        next_input_needed: "player_actions"
      })
    );
    const needsDice = parseDmContract(
      JSON.stringify({
        public_narration: "Roll 1d20 for Athletics.",
        resolution_mode: "needs_dice",
        roll_requests: [{ dice: "1d20", label: "Athletics" }],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(resolved.resolutionMode, "resolved_without_dice");
    assert.equal(needsDice.resolutionMode, "needs_dice");
    const mismatchedNeedsDice = parseDmContract(
      JSON.stringify({
        public_narration: "Roll 1d20 for Athletics.",
        resolution_mode: "resolved_without_dice",
        roll_requests: [{ dice: "1d20", label: "Athletics" }],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(mismatchedNeedsDice.resolutionMode, "needs_dice");
  });

  it("accepts clarification as a first-class input state", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration:
          "Seren, are you casting one spell this turn, or do you have a feature that lets you cast both?",
        resolution_mode: "needs_dice",
        roll_requests: [],
        next_input_needed: "clarification",
        input_targets: ["player:seren"],
        input_policy: "only_targeted_players"
      })
    );

    assert.equal(result.nextInputNeeded, "clarification");
    assert.equal(result.resolutionMode, "resolved_without_dice");
    assert.deepEqual(result.inputTargets, ["player:seren"]);
    assert.equal(result.inputPolicy, "only_targeted_players");
  });


  it("rejects attack roll and AC contradictions", () => {
    assert.throws(
      () =>
        parseDmContract(
          contract(
            "The raider fires. Attack roll: 13 vs AC 10 - miss. The bolt skips off the stone. What do you do?"
          )
        ),
      /contradicted an attack roll and AC comparison/
    );

    assert.throws(
      () =>
        parseDmContract(
          contract(
            "The arcanist hurls fire. Spell attack roll: 9 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
          )
        ),
      /contradicted an attack roll and AC comparison/
    );

    assert.throws(
      () =>
        parseDmContract(
          contract(
            "The arcanist hurls fire. Spell attack roll: d20 + 7 = 10 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
          )
        ),
      /contradicted an attack roll and AC comparison/
    );
  });

  it("accepts correct attack roll and AC comparisons", () => {
    const hit = parseDmContract(
      contract(
        "The raider fires. Attack roll: 13 vs AC 10 - hit. Damage roll: 1d8 + 2 = 7 piercing damage."
      )
    );
    const miss = parseDmContract(
      contract("The archer fires. Attack roll: 9 vs AC 15 - miss.")
    );
    const spellHit = parseDmContract(
      contract(
        "The arcanist hurls fire. Spell attack roll: d20 + 7 = 18 vs AC 15 - hit. Damage roll: 2d10 = 11 fire damage."
      )
    );

    assert.match(hit.publicNarration, /13 vs AC 10 - hit/);
    assert.match(miss.publicNarration, /9 vs AC 15 - miss/);
    assert.match(spellHit.publicNarration, /18 vs AC 15 - hit/);
  });

  it("normalizes settings, input targeting, roll narration, and legacy field names", () => {
    const result = parseDmContract(
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
          regionName: "The Salt Concordat",
          settlementName: "Saltwatch",
          sceneLocation: "Saltwatch Chapel",
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
      regionName: "The Salt Concordat",
      settlementName: "Saltwatch",
      sceneLocation: "Saltwatch Chapel",
      startingLocation: "Harbor Road"
    });
  });

  it("preserves combat roll metadata from roll requests", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration:
          "Your second flurry strike lands. Roll 1d4 + 2 for Flurry of Blows Damage.",
        roll_requests: [
          {
            id: "oktai-flurry-damage-2",
            dice: "1d4",
            label: "Flurry of Blows Damage",
            modifier: 2,
            player: "player:oktai",
            combat: {
              actionId: "oktai-round1-turn",
              actorKey: "player:oktai",
              targetActorKey: "npc:acolyte-1",
              kind: "damage_roll",
              sourceAttackRollId: "oktai-flurry-attack-2",
              damageType: "bludgeoning"
            }
          }
        ],
        next_input_needed: "dice_results"
      })
    );

    assert.equal(
      result.rollRequests[0]?.combat?.targetActorKey,
      "npc:acolyte-1"
    );
    assert.equal(result.rollRequests[0]?.combat?.kind, "damage_roll");
  });

  it("infers multiplayer initiative roll targets from initiative labels", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration: "The thing is aware. Roll initiative.",
        resolution_mode: "needs_dice",
        roll_requests: [
          {
            id: "initiative-tart",
            dice: "1d20",
            label: "Initiative (Tart)",
            modifier: 0
          },
          {
            id: "initiative-por",
            dice: "1d20",
            label: "Initiative (Por)",
            modifier: 0
          }
        ],
        next_input_needed: "dice_results",
        input_targets: [],
        input_policy: "all_players"
      })
    );

    assert.deepEqual(
      result.rollRequests.map((request) => request.player),
      ["Tart", "Por"]
    );
  });

  it("infers targeted saving throw rolls from narration and roll ids", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration: [
          "It casts a spell. Make a Wisdom saving throw, Por.",
          "",
          "Roll 1d20 + your Wisdom modifier (0)."
        ].join("\n"),
        resolution_mode: "needs_dice",
        roll_requests: [
          {
            id: "por-wisdom-save-vs-creature-spell",
            dice: "1d20",
            label: "Wisdom Saving Throw",
            modifier: 0
          }
        ],
        next_input_needed: "dice_results",
        input_targets: [],
        input_policy: "acting_player",
        mechanics_state_update: {
          combat: {
            active: true,
            round: 1,
            turnOwner: "player:por",
            initiativeOrder: ["npc:green-eye-figure", "player:por", "player:tart"]
          }
        }
      })
    );

    assert.equal(result.rollRequests[0]?.player, "Por");
    assert.equal(result.inputPolicy, "all_players");
  });

  it("keeps roll narration unchanged when dice are already covered", () => {
    const result = parseDmContract(
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
      () => parseDmContract("not json"),
      /invalid JSON/
    );
    assert.throws(
      () =>
        parseDmContract(
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
        parseDmContract(
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
        parseDmContract(
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
        parseDmContract(
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
    const result = parseDmContract(
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
    const result = parseDmContract(
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

  it("preserves inventory state updates from DM JSON", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration:
          "The barkeep takes the coins and slides the cup across. Inventory update: you spent 3 CP.",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players",
        inventory_state_update: {
          patches: [
            {
              actor_key: "player:owner-client",
              type: "currency",
              currency: "CP",
              delta: -3,
              reason: "Paid 3 copper for a drink."
            }
          ]
        }
      })
    );

    assert.deepEqual(result.inventoryStateUpdate, {
      patches: [
        {
          actor_key: "player:owner-client",
          type: "currency",
          currency: "CP",
          delta: -3,
          reason: "Paid 3 copper for a drink."
        }
      ]
    });
  });

  it("does not treat character sheet combat terms as the submitted action", () => {
    const result = parseDmContract(
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
    const result = parseDmContract(
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
    const result = parseDmContract(
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
    const result = parseDmContract(
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
    const result = parseDmContract(
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
    const result = parseDmContract(
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

describe("DM provider helpers", () => {
  it("derives display titles and recognizes internal prompts", () => {
    assert.equal(titleFromSessionId("ai-dnd-123456789"), "D&D Session 456789");
    assert.equal(titleFromSessionId("ai-dnd-salt-wind"), "Salt Wind");
    assert.equal(isInternalDmProviderMessage("AI_DND_INTERNAL_OPENING_REQUEST: begin"), true);
    assert.equal(isInternalDmProviderMessage("The harbor bell rings."), false);
  });

  it("normalizes visible narration from contracts and legacy provider text", () => {
    assert.equal(
      normalizeDmContractContent(contract("The lantern guttered. What do you do?")),
      "The lantern guttered.\n\nWhat do you do?"
    );
    assert.equal(
      normalizeDmProviderContent('Table{"success":true}\nDungeon Master The door opens.'),
      "The door opens."
    );
    assert.equal(normalizeDmProviderContent("Plain tavern talk."), "Plain tavern talk.");
    assert.equal(normalizeDmProviderContent(undefined), "");
  });

  it("normalizes roll request variants", () => {
    const request = normalizeRollRequest({
      check: "Investigation",
      player: "Nia",
      modifier: -1,
      target_dc: 14,
      reason: "how the sigils fit together",
      advantageState: "disadvantage"
    });

    assert.equal(request?.dice, "1d20");
    assert.equal(request?.label, "Investigation");
    assert.equal(request?.player, "Nia");
    assert.equal(request?.modifier, -1);
    assert.equal(request?.targetDc, 14);
    assert.equal(request?.reason, "how the sigils fit together");
    assert.equal(request?.advantageState, "disadvantage");

    const magicMissileRequest = normalizeRollRequest({
      dice: "3d4+3",
      label: "Magic Missile damage",
      modifier: 0
    });

    assert.equal(magicMissileRequest?.dice, "3d4");
    assert.equal(magicMissileRequest?.modifier, 3);

    const penaltyRequest = normalizeRollRequest({
      dice: "1d20 - 1",
      label: "Penalty check",
      modifier: 2
    });

    assert.equal(penaltyRequest?.dice, "1d20");
    assert.equal(penaltyRequest?.modifier, 1);

    assert.deepEqual(normalizeRollRequest(null), null);
    assert.equal(normalizeRollRequests({ reason: "Stealth" }).length, 1);
    assert.deepEqual(normalizeRollRequests(undefined), []);
  });

  it("adds visible DC guidance for investigation roll requests only", () => {
    const investigation = parseDmContract(
      JSON.stringify({
        public_narration: "The symbols resist easy reading.",
        resolution_mode: "needs_dice",
        roll_requests: [
          {
            dice: "1d20",
            modifier: 6,
            label: "Study the Dominion symbols",
            target_dc: 15,
            reason: "the correct pressure and sequence pattern"
          }
        ],
        next_input_needed: "dice_results",
        input_targets: [],
        input_policy: "all_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] }
      }),
      { dmJob: "investigation" }
    );

    assert.match(
      investigation.publicNarration,
      /Roll 1d20 \+ 6 for Study the Dominion symbols DC 15 reveals the correct pressure and sequence pattern\./
    );
    assert.equal(investigation.rollRequests[0]?.targetDc, 15);

    const sceneDirector = parseDmContract(
      JSON.stringify({
        public_narration: "The cliff face is slick.",
        resolution_mode: "needs_dice",
        roll_requests: [
          {
            dice: "1d20",
            modifier: 2,
            label: "Athletics",
            target_dc: 13,
            reason: "a stable handhold"
          }
        ],
        next_input_needed: "dice_results",
        input_targets: [],
        input_policy: "all_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] }
      }),
      { dmJob: "scene_director" }
    );

    assert.equal(
      sceneDirector.publicNarration,
      "The cliff face is slick.\n\nRoll 1d20 + 2 for Athletics."
    );
  });

  it("does not duplicate investigation check prose that already includes a DC", () => {
    const publicNarration =
      "Make an Insight check. DC 14 reveals a gut feeling about the safe path based on the hum and air currents; DC 18 may reveal that the traps react to *intent* or *fear* rather than just weight.";
    const result = parseDmContract(
      JSON.stringify({
        public_narration: publicNarration,
        resolution_mode: "needs_dice",
        roll_requests: [
          {
            dice: "1d20",
            modifier: 3,
            skill: "Insight",
            target_dc: 14,
            reason:
              "a gut feeling about the safe path; DC 18 may reveal the traps react to intent or fear"
          }
        ],
        next_input_needed: "dice_results",
        input_targets: ["player:oktai"],
        input_policy: "only_targeted_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] }
      }),
      { dmJob: "investigation" }
    );

    assert.equal(result.publicNarration, publicNarration);
    assert.equal(result.rollRequests[0]?.label, "Insight");
    assert.equal(
      result.rollRequests[0]?.reason,
      "a gut feeling about the safe path; DC 18 may reveal the traps react to intent or fear"
    );
    assert.equal(result.rollRequests[0]?.targetDc, 14);
  });

  it("does not append investigation DC guidance when no roll is requested", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration: "The symbols are strange, but you need a closer look.",
        resolution_mode: "resolved_without_dice",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] }
      }),
      { dmJob: "investigation" }
    );

    assert.equal(
      result.publicNarration,
      "The symbols are strange, but you need a closer look."
    );
  });

  it("preserves structured single-line breaks in public narration", () => {
    const result = parseDmContract(
      JSON.stringify({
        public_narration: [
          "Combat begins.",
          "",
          "**Inquisitor Manifold initiative roll: 14.**",
          "**Unbound Word Acolyte 1 initiative roll: 10.**",
          "**Unbound Word Acolyte 2 initiative roll: 8.**",
          "**Unbound Word Acolyte 3 initiative roll: 12.**",
          "",
          "**Initiative Order:**",
          "1. Oktai Uni (16)",
          "2. Inquisitor Manifold (14)",
          "3. Unbound Word Acolyte 3 (12)"
        ].join("\n"),
        resolution_mode: "resolved_without_dice",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: ["player:oktai"],
        input_policy: "only_targeted_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] }
      })
    );

    assert.equal(
      result.publicNarration,
      [
        "Combat begins.",
        "",
        "**Inquisitor Manifold initiative roll: 14.**",
        "**Unbound Word Acolyte 1 initiative roll: 10.**",
        "**Unbound Word Acolyte 2 initiative roll: 8.**",
        "**Unbound Word Acolyte 3 initiative roll: 12.**",
        "",
        "**Initiative Order:**",
        "1. Oktai Uni (16)",
        "2. Inquisitor Manifold (14)",
        "3. Unbound Word Acolyte 3 (12)"
      ].join("\n")
    );
  });

  it("diagnoses unsupported roll request dice without rejecting them", () => {
    assert.deepEqual(
      rollRequestDiagnostics([
        {
          id: "ok",
          dice: "3d4",
          label: "Magic Missile damage"
        }
      ]),
      []
    );
    assert.deepEqual(
      rollRequestDiagnostics([
        {
          id: "complex",
          dice: "2d4+1d6",
          label: "Complex damage"
        }
      ]),
      [
        {
          severity: "error",
          code: "unsupported_dice_notation",
          id: "complex",
          label: "Complex damage",
          dice: "2d4+1d6",
          message:
            "Roll request dice must be bare supported dice notation so the UI can queue it."
        }
      ]
    );
  });

  it("extracts roll requests from contract and legacy response shapes", () => {
    const contractRequests = extractDmProviderRollRequests({
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
      extractDmProviderRollRequest({
        message: {
          content: "legacy prose",
          roll_request: { dice: "1d20", reason: "Survival" }
        }
      })?.label,
      "Survival"
    );
    assert.deepEqual(extractDmProviderRollRequests("no request"), []);
  });

  it("summarizes contract failures for debug output", () => {
    const debug = debugDmContractFailure(
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
