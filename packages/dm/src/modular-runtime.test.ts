import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemoryUpdaterPrompt,
  buildRouterPrompt,
  jobPrompt,
  renderContextChunks,
  validateCombatEvents,
  validateMainDmOutput,
  validateMemoryPatches,
  validateRouterOutput
} from "./modular-runtime.js";

describe("modular AI DM runtime contracts", () => {
  it("validates router output and preserves selected context keys", () => {
    const result = validateRouterOutput(
      JSON.stringify({
        job_needed: "npc_dialogue",
        context_keys: {
          npc_context: ["npc:captain-vael", "npc:captain-vael"],
          player_character_context: ["pc:garrick"],
          combat_context: [],
          relevant_world_context: ["region:harbor"],
          quests_open_threads: ["thread:black-key"],
          overarching_big_plot_secrets: ["secret:undertow"],
        },
        reason: "The player is questioning Captain Vael."
      })
    );

    assert.equal(result.jobNeeded, "npc_dialogue");
    assert.equal(result.fallbackUsed, false);
    assert.deepEqual(result.contextKeys.npc_context, ["npc:captain-vael"]);
    assert.deepEqual(result.contextKeys.quests_open_threads, [
      "thread:black-key"
    ]);
  });

  it("falls back from malformed router output without crashing play", () => {
    const result = validateRouterOutput("not-json");

    assert.equal(result.jobNeeded, "scene_director");
    assert.equal(result.fallbackUsed, true);
    assert.match(result.errors.join("\n"), /parseable JSON/);
    assert.deepEqual(result.contextKeys.combat_context, []);
  });

  it("renders selected context chunks as labelled markdown packets", () => {
    const rendered = renderContextChunks([
      {
        id: "npc:captain-vael",
        category: "npc_context",
        title: "Captain Vael",
        visibility: "dm_only",
        priority: 8,
        bodyMarkdown: "Goal: Keep the harbor calm."
      }
    ]);

    assert.match(rendered, /<context_chunk id="npc:captain-vael"/);
    assert.match(rendered, /type="npc_context"/);
    assert.match(rendered, /# Captain Vael/);
    assert.match(rendered, /Goal: Keep the harbor calm/);
  });

  it("validates the main DM output envelope narrowly", () => {
    const output = validateMainDmOutput(
      JSON.stringify({
        public_narration: "Vael watches your hands before he answers.",
        roll_requests: [],
        next_input_needed: "player_actions",
        combat_events: [],
        proposed_context_updates: []
      })
    );

    assert.equal(
      output.publicNarration,
      "Vael watches your hands before he answers."
    );
    assert.equal(output.nextInputNeeded, "player_actions");
    assert.deepEqual(output.combatEvents, []);

    assert.throws(
      () =>
        validateMainDmOutput(
          JSON.stringify({
            public_narration: "",
            roll_requests: [],
            next_input_needed: "player_actions"
          })
        ),
      /missing public_narration/
    );
  });

  it("accepts valid combat events and discards untraceable mechanics changes", () => {
    const result = validateCombatEvents(
      [
        {
          event: "damage",
          actor: "actor:garrick",
          target: "actor:goblin_1",
          from_hp: 10,
          to_hp: 3
        },
        {
          event: "damage",
          actor: "actor:garrick",
          target: "actor:missing",
          from_hp: 10,
          to_hp: -2
        }
      ],
      {
        actors: {
          "actor:garrick": { currentHp: 18, maxHp: 24 },
          "actor:goblin_1": { currentHp: 10, maxHp: 10 }
        }
      }
    );

    assert.equal(result.accepted.length, 1);
    assert.equal(result.discarded.length, 1);
    assert.match(result.discarded[0]?.reasons.join("\n") ?? "", /unknown/);
    assert.match(result.discarded[0]?.reasons.join("\n") ?? "", /below 0/);
  });

  it("accepts valid memory patches and discards unsafe ones", () => {
    const result = validateMemoryPatches(
      [
        {
          operation: "append",
          context_id: "thread:black-key",
          markdown: "- Vael confirmed the key points to Pier 6."
        },
        {
          operation: "append",
          context_id: "thread:missing",
          markdown: "- This should not apply."
        },
        {
          operation: "create_chunk",
          context_id: "npc:marra",
          context_type: "npc_context",
          visibility: "dm_only",
          markdown: "# Marra\n\nGoal: stay alive."
        }
      ],
      new Set(["thread:black-key"])
    );

    assert.equal(result.accepted.length, 2);
    assert.equal(result.discarded.length, 1);
    assert.match(
      result.discarded[0]?.reasons.join("\n") ?? "",
      /does not exist/
    );
  });

  it("keeps prompts modular and explicit", () => {
    const routerPrompt = buildRouterPrompt();
    const removedOpeningJob = ["campaign", "starter"].join("_");

    assert.match(routerPrompt, /select context chunk keys only/i);
    assert.match(routerPrompt, /Campaign opening scenes are handled/i);
    assert.match(routerPrompt, /combat_active is true, default to combat/i);
    assert.match(routerPrompt, /Choose clarification when the player's intended action is too underspecified/i);
    assert.match(routerPrompt, /without a clear target, target area, or necessary tactical detail/i);
    assert.match(routerPrompt, /Do not choose clarification merely because an action is risky/i);
    assert.doesNotMatch(routerPrompt, new RegExp(removedOpeningJob));
    assert.match(jobPrompt("scene_director"), /concrete sensory detail/i);
    assert.match(jobPrompt("scene_director"), /observable behavior/i);
    assert.match(jobPrompt("scene_director"), /Keep player agency intact/i);
    assert.match(jobPrompt("scene_director"), /pause for dice/i);
    assert.match(jobPrompt("scene_director"), /next_input_needed to dice_results/i);
    assert.match(jobPrompt("scene_director"), /structured roll_requests entry/i);
    assert.match(jobPrompt("scene_director"), /must not resolve success/i);
    assert.match(jobPrompt("scene_director"), /rich scene hook, no roll/i);
    assert.match(jobPrompt("scene_director"), /mixed social action plus risky theft roll/i);
    assert.match(jobPrompt("scene_director"), /failed roll consequence/i);
    assert.match(jobPrompt("scene_director"), /Do not copy their names/i);
    assert.match(jobPrompt("scene_director"), /\\n\\nWhat do you do\\?/);
    assert.doesNotMatch(
      jobPrompt("scene_director"),
      /Roll Sleight of Hand:[^"]*\\n\\nWhat do you do\?/
    );
    assert.match(jobPrompt("npc_dialogue"), /Do not make social checks into mind control/i);
    assert.match(jobPrompt("npc_dialogue"), /If a lie contradicts known facts/i);
    assert.match(jobPrompt("npc_dialogue"), /very high Deception against a known contradiction/i);
    assert.match(jobPrompt("npc_dialogue"), /Persuasion partial success/i);
    assert.match(jobPrompt("npc_dialogue"), /failed Intimidation/i);
    assert.match(jobPrompt("npc_dialogue"), /conversational texture/i);
    assert.match(jobPrompt("combat"), /strict turn ownership/i);
    assert.match(jobPrompt("combat"), /attack roll: X vs AC Y - hit\/miss/i);
    assert.match(jobPrompt("combat"), /Dexterity save: X vs DC Y - success\/failure/i);
    assert.match(jobPrompt("combat"), /list each target's save result separately/i);
    assert.match(jobPrompt("combat"), /full damage, the halved damage/i);
    assert.match(jobPrompt("combat"), /turnOwner is an NPC actor key/i);
    assert.match(jobPrompt("combat"), /final active enemy is defeated/i);
    assert.match(jobPrompt("combat"), /do not infer an attack, spell, target/i);
    assert.match(jobPrompt("combat"), /roll_requests \[\]/i);
    assert.match(jobPrompt("combat"), /merely because initiative has reached/i);
    assert.match(
      jobPrompt("combat"),
      /needs a concrete tactical choice before dice can be interpreted/i
    );
    assert.match(
      jobPrompt("combat"),
      /For missing tactical choices, return next_input_needed player_actions, roll_requests \[\]/i
    );
    assert.match(
      jobPrompt("combat"),
      /Only request player-controlled initiative rolls in roll_requests/i
    );
    assert.match(
      jobPrompt("combat"),
      /Roll NPC and enemy initiative yourself every time/i
    );
    assert.match(
      jobPrompt("combat"),
      /Never ask players to roll initiative, saving throws, attacks, damage, checks, or any other dice for NPCs or enemies/i
    );
    assert.match(jobPrompt("combat"), /dice must be bare dice notation only/i);
    assert.match(
      jobPrompt("combat"),
      /Magic Missile uses dice "3d4" and modifier 3/i
    );
    assert.match(
      jobPrompt("combat"),
      /When a player-controlled attack roll hits and damage was not already submitted/i
    );
    assert.match(
      jobPrompt("combat"),
      /On a resolved hit where damage is known or DM-side/i
    );
    assert.match(
      jobPrompt("combat"),
      /When a player spell or feature forces an NPC or enemy saving throw/i
    );
    assert.match(
      jobPrompt("combat"),
      /Never narrate a spell or feature as failing, succeeding, taking hold, being resisted, or being shaken off/i
    );
    assert.match(jobPrompt("combat"), /combat starts, initiative first/i);
    assert.match(
      jobPrompt("combat"),
      /Bandit captain initiative roll: 15\. Cutthroat initiative rolls: 11 and 8\./i
    );
    assert.match(
      jobPrompt("combat"),
      /initiative submitted, NPC wins and acts immediately/i
    );
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: listing the initiative order, saying the wardens move first/i
    );
    assert.match(
      jobPrompt("combat"),
      /Warden lift-guard 1 attack roll: 18 vs Komer's AC 15 - hit/i
    );
    assert.match(jobPrompt("combat"), /surprise opener resolves before initiative/i);
    assert.match(jobPrompt("combat"), /Magic Missile needs target distribution before damage/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: requesting Magic Missile damage before POKE chooses/i
    );
    assert.match(jobPrompt("combat"), /"input_targets": \[\s+"player:poke"\s+\]/);
    assert.match(
      jobPrompt("combat"),
      /NPC turn catches up before an off-turn player intent/i
    );
    assert.match(
      jobPrompt("combat"),
      /NPC resolves, then a fresh player turn begins/i
    );
    assert.match(jobPrompt("combat"), /Bad response to avoid: requesting Tart's attack roll/i);
    assert.match(jobPrompt("combat"), /"input_targets": \[\s+"player:tart"\s+\]/);
    assert.match(jobPrompt("combat"), /player attack hits, request player damage/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: inventing greataxe damage/i
    );
    assert.match(
      jobPrompt("combat"),
      /"dice": "1d12"/i
    );
    assert.match(jobPrompt("combat"), /area spell saves and damage are explicit/i);
    assert.match(jobPrompt("combat"), /player spell forces an NPC save/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: saying the spell fails, Hesk resists/i
    );
    assert.match(
      jobPrompt("combat"),
      /Warden Captain Hesk Wisdom save: 11 vs DC 13 - failure/i
    );
    assert.match(jobPrompt("combat"), /Robed priest Dexterity save: 16 vs DC 14 - success/i);
    assert.match(jobPrompt("combat"), /final enemy defeated and combat ends/i);
    assert.match(jobPrompt("combat"), /Never silently modify HP/);
    assert.match(jobPrompt("combat"), /Do not copy their names, actor keys/i);
    assert.match(
      jobPrompt("combat"),
      /Do not include 'What do you do\?'[^.]*next_input_needed dice_results/i
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /Roll initiative:[^"]*\\n\\nWhat do you do\?/
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /Roll Fireball damage:[^"]*\\n\\nWhat do you do\?/
    );
    assert.match(jobPrompt("clarification"), /Ask one concise/);
    assert.match(jobPrompt("clarification"), /table-facing guidance rather than in-world NPC dialogue/i);
    assert.match(jobPrompt("clarification"), /Do not advance fictional time/i);
    assert.match(jobPrompt("clarification"), /have NPCs speak or react/i);
    assert.match(jobPrompt("clarification"), /Do not reframe or soften the player's declared intent/i);
    assert.match(buildMemoryUpdaterPrompt(), /Allowed operations/);
  });

  it("renders mode-specific job guidance without duplicating job prompts", () => {
    const soloCombatPrompt = jobPrompt("combat", "single_player");
    const multiplayerCombatPrompt = jobPrompt("combat", "multiplayer");
    const soloScenePrompt = jobPrompt("scene_director", "single_player");
    const multiplayerScenePrompt = jobPrompt("scene_director", "multiplayer");

    assert.match(soloCombatPrompt, /This is singleplayer combat/i);
    assert.match(soloCombatPrompt, /solo player actor key/i);
    assert.doesNotMatch(soloCombatPrompt, /This is multiplayer combat/i);
    assert.doesNotMatch(soloCombatPrompt, /multiplayer all-player prompt/i);

    assert.match(multiplayerCombatPrompt, /This is multiplayer combat/i);
    assert.match(multiplayerCombatPrompt, /all-player prompt/i);
    assert.doesNotMatch(multiplayerCombatPrompt, /This is singleplayer combat/i);
    assert.doesNotMatch(multiplayerCombatPrompt, /solo player actor key/i);

    assert.match(soloScenePrompt, /AI Taverns DM job: scene_director/i);
    assert.match(multiplayerScenePrompt, /AI Taverns DM job: scene_director/i);
    assert.doesNotMatch(soloScenePrompt, /This is singleplayer combat/i);
    assert.doesNotMatch(multiplayerScenePrompt, /This is multiplayer combat/i);
  });
});
