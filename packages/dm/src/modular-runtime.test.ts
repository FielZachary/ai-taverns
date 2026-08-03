import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemoryUpdaterPrompt,
  buildRouterPrompt,
  formatRouterCurrentTurnInput,
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

  it("supports combat-aware router fallback jobs", () => {
    const result = validateRouterOutput(
      JSON.stringify({
        public_narration: "Komer's axe bites into the railing.",
        roll_requests: [],
        next_input_needed: "player_actions"
      }),
      "combat"
    );

    assert.equal(result.jobNeeded, "combat");
    assert.equal(result.fallbackUsed, true);
    assert.match(result.errors.join("\n"), /job_needed is required/);
  });

  it("formats router turn input with only structured submissions when available", () => {
    const formatted = formatRouterCurrentTurnInput(
      [
        "Canonical player characters:",
        "Very long sheet text",
        "",
        "Current turn input JSON:",
        JSON.stringify(
          {
            type: "multiplayer_turn",
            resolution_policy: "Resolve active combat.",
            submissions: [
              {
                player: "Komer",
                character: "Komer",
                content: "I rolled 1d20 + 5: 10 (5) for Greataxe attack roll."
              }
            ]
          },
          null,
          2
        )
      ].join("\n")
    );

    assert.match(formatted, /Current turn submissions JSON:/);
    assert.match(formatted, /Greataxe attack roll/);
    assert.doesNotMatch(formatted, /Very long sheet text/);
    assert.doesNotMatch(formatted, /resolution_policy/);
  });

  it("warns the router not to emit main DM response fields", () => {
    const prompt = buildRouterPrompt();

    assert.match(prompt, /You are not the narrator/);
    assert.match(prompt, /Never return public_narration/);
  });

  it("shows the router the required context_keys object shape", () => {
    const prompt = buildRouterPrompt();

    assert.match(prompt, /context_keys must be an object/);
    assert.match(prompt, /never an array of category names/);
    assert.match(prompt, /"combat_context":\[\]/);
  });

  it("renders selected context chunks by visibility and labels dm_only as staging material", () => {
    const rendered = renderContextChunks([
      {
        id: "npc:captain-vael",
        category: "npc_context",
        title: "Captain Vael",
        visibility: "player_safe",
        priority: 8,
        bodyMarkdown: "Goal: Keep the harbor calm."
      },
      {
        id: "secret:undertow",
        category: "overarching_big_plot_secrets",
        title: "Undertow",
        visibility: "dm_only",
        priority: 10,
        bodyMarkdown: "Hidden truth: Vael's clerk stole the ledger."
      }
    ]);

    assert.match(rendered, /Player-safe context and established surface facts/);
    assert.match(rendered, /<context_chunk id="npc:captain-vael"/);
    assert.match(rendered, /type="npc_context"/);
    assert.match(rendered, /# Captain Vael/);
    assert.match(rendered, /Goal: Keep the harbor calm/);
    assert.match(rendered, /DM staging material/);
    assert.match(rendered, /not automatically known by any NPC/);
    assert.match(rendered, /<dm_staging_chunk id="secret:undertow"/);
    assert.match(rendered, /Hidden truth: Vael's clerk stole the ledger/);
    assert.doesNotMatch(rendered, /<context_chunk id="secret:undertow"/);
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
    assert.match(routerPrompt, /Only select context keys from the Available context chunk keys JSON/i);
    assert.match(routerPrompt, /Do not invent, rename, summarize, slugify, or transform context keys/i);
    assert.match(routerPrompt, /Copy exact key strings only/i);
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
    assert.match(
      jobPrompt("scene_director"),
      /exploration, travel, downtime, and ordinary scene resolution/i
    );
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
    assert.match(jobPrompt("npc_dialogue"), /NPC knowledge is local, not omniscient/i);
    assert.match(
      jobPrompt("npc_dialogue"),
      /concrete path by which they know it/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /DM staging material is for pacing, foreshadowing, pressure, clue placement, and contradiction checks/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /not automatically known by any NPC/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /When the player challenges how an NPC knows something/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /Prefer one meaningful reveal plus a new question, demand, cost, refusal, or lead/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /validate that the acting character actually has the offered object before the NPC sees, touches, evaluates, accepts, refuses, or comments on it/i
    );
    assert.match(jobPrompt("npc_dialogue"), /bargaining, gifting, payment/i);
    assert.match(
      jobPrompt("investigation"),
      /Distinguish discovering, seeing, identifying, or learning about an item/i
    );
    assert.match(
      jobPrompt("investigation"),
      /state the target DC or threshold in public_narration before the player rolls/i
    );
    assert.match(
      jobPrompt("investigation"),
      /what category of information that DC can unlock without revealing the hidden answer/i
    );
    assert.match(jobPrompt("investigation"), /target_dc/i);
    assert.match(jobPrompt("combat"), /strict turn ownership/i);
    assert.match(jobPrompt("combat"), /Group combat narration by action\/result beat/i);
    assert.match(jobPrompt("combat"), /Bold visible mechanics inside public_narration using Markdown/i);
    assert.match(
      jobPrompt("combat"),
      /Do not put a visible mechanics sentence in its own standalone paragraph/i
    );
    assert.match(
      jobPrompt("combat"),
      /one paragraph per actor\/effect plus a final handoff paragraph/i
    );
    assert.match(
      jobPrompt("combat"),
      /\*\*Attack: 14 vs AC 10 - hit\. Damage: 5 piercing\.\*\*/
    );
    assert.match(jobPrompt("combat"), /attack roll: X vs AC Y - hit\/miss/i);
    assert.match(jobPrompt("combat"), /Dexterity save: X vs DC Y - success\/failure/i);
    assert.match(jobPrompt("combat"), /list each target's save result separately/i);
    assert.match(jobPrompt("combat"), /full damage, the halved damage/i);
    assert.match(jobPrompt("combat"), /turnOwner is an NPC actor key/i);
    assert.match(jobPrompt("combat"), /final active enemy is defeated/i);
    assert.match(
      jobPrompt("combat"),
      /Enemies should act according to motives, intelligence, positioning, and the immediate threat/i
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /morale, positioning, injuries/i
    );
    assert.match(
      jobPrompt("combat"),
      /conscious, armed, in range, and still fighting must spend its turn creating immediate tactical pressure/i
    );
    assert.match(
      jobPrompt("combat"),
      /Do not let being wounded or alone become a passive held turn/i
    );
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
      /After all requested player initiative rolls are submitted, initiative is resolved/i
    );
    assert.match(
      jobPrompt("combat"),
      /Saying an NPC moves first is not a handoff/i
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
      /When a player action, spell, feature, or weapon would deal damage/i
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
      /\*\*Warden lift-guard 1 attack roll: 18 vs Komer's AC 15 - hit\. Damage roll: 1d6 \+ 2 = 5 piercing damage\.\*\* The spearpoint/i
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /Warden lift-guard 1 attack roll:[^"]*\\n\\nThe spearpoint/i
    );
    assert.match(
      jobPrompt("combat"),
      /combat start initiative resolved, NPC opener acts now/i
    );
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: only saying Doran moves first/i
    );
    assert.match(jobPrompt("combat"), /Doran Ironhand moves before the darts/i);
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
    assert.match(jobPrompt("combat"), /players skip, hostile NPC still creates pressure/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: saying the wounded warden snarls, braces, waits, watches, hesitates/i
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
    assert.match(
      jobPrompt("combat"),
      /player action, spell, feature, or weapon would deal damage/i
    );
    assert.match(jobPrompt("combat"), /automatic-hit effects such as Magic Missile/i);
    assert.match(jobPrompt("combat"), /Magic Missile target is known, request player damage/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: rolling Magic Missile damage yourself/i
    );
    assert.match(jobPrompt("combat"), /"dice": "3d4"/i);
    assert.match(jobPrompt("combat"), /"modifier": 3/i);
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
    assert.match(
      jobPrompt("combat"),
      /attempts to attack with, throw, draw, load, fire, equip, or otherwise use a weapon they do not have/i
    );
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
    assert.match(jobPrompt("clarification"), /next_input_needed to "clarification"/);
    assert.match(jobPrompt("clarification"), /Set roll_requests to \[\]/);
    assert.match(jobPrompt("clarification"), /Do not advance fictional time/i);
    assert.match(jobPrompt("clarification"), /have NPCs speak or react/i);
    assert.match(jobPrompt("clarification"), /Do not set next_input_needed to "player_actions"/);
    assert.match(
      jobPrompt("clarification"),
      /Do not create inventory patches just because the player clarifies intent/i
    );
    assert.match(jobPrompt("clarification"), /Do not reframe or soften the player's declared intent/i);
    for (const job of [
      "scene_director",
      "investigation",
      "npc_dialogue",
      "combat",
      "clarification"
    ] as const) {
      const prompt = jobPrompt(job);
      assert.match(prompt, /inventory_state_update/);
      assert.match(prompt, /include a setting object/i);
      assert.match(prompt, /scene_location/i);
      assert.match(prompt, /display_location/i);
      assert.match(prompt, /Treat canonical character sheet Inventory, Equipment, and Currency sections/i);
      assert.match(prompt, /Inventory possession gate/i);
      assert.match(
        prompt,
        /before writing any public_narration, inspect current player submissions/i
      );
      assert.match(
        prompt,
        /pull from a bag, show, offer, sell, appraise/i
      );
      assert.match(
        prompt,
        /Player wording is not authoritative for possession/i
      );
      assert.match(prompt, /does not make X exist/i);
      assert.match(
        prompt,
        /Weapon proficiency, class, background, and backstory do not imply/i
      );
      assert.match(
        prompt,
        /Do not narrate the item appearing, being held, being inspected, being offered, being used, being cast, or being reacted to by an NPC/i
      );
      assert.match(
        prompt,
        /attempts to produce, present, show, appraise, sell, use, consume, equip, spend, give, trade, throw, load, unlock with, activate/i
      );
      assert.match(
        prompt,
        /If the character does not have the presented, shown, appraised, sold, used, or required item, weapon, or currency, reject the attempt in public_narration/i
      );
      assert.match(
        prompt,
        /Do not narrate the missing item appearing in the scene/i
      );
      assert.match(
        prompt,
        /Do not include an inventory patch for a failed inventory attempt/i
      );
      assert.match(
        prompt,
        /Inventory update: you gained a brass key/i
      );
      assert.match(
        prompt,
        /Inventory update: you dropped the torch/i
      );
    }
    for (const prompt of [
      jobPrompt("scene_director", "single_player"),
      jobPrompt("investigation", "multiplayer")
    ]) {
      assert.match(prompt, /Canonical document text/i);
      assert.match(prompt, /## Canonical Document Text section/i);
      assert.match(prompt, /immutable canon/i);
      assert.match(prompt, /do not rewrite, reword, expand, shorten, or regenerate/i);
      assert.match(prompt, /new page, hidden annotation, translation, cipher result/i);
    }
    assert.match(buildMemoryUpdaterPrompt(), /Allowed operations/);
    assert.match(buildMemoryUpdaterPrompt(), /Create a new NPC card/i);
    assert.match(buildMemoryUpdaterPrompt(), /Make each NPC feel like a compelling character/i);
    assert.match(buildMemoryUpdaterPrompt(), /## Disposition Towards You/);
    assert.match(buildMemoryUpdaterPrompt(), /Never infer gender or pronouns/i);
    assert.match(buildMemoryUpdaterPrompt(), /neutral wording until play establishes pronouns/i);
    assert.match(buildMemoryUpdaterPrompt(), /do not silently normalize the conflict/i);
    assert.match(buildMemoryUpdaterPrompt(), /campaign context as a living world bible/i);
    assert.match(buildMemoryUpdaterPrompt(), /Canonical written artifact memory/i);
    assert.match(buildMemoryUpdaterPrompt(), /preserve the revealed text word for word/i);
    assert.match(buildMemoryUpdaterPrompt(), /notes, notebooks, ledgers, journals, letters/i);
    assert.match(buildMemoryUpdaterPrompt(), /## Canonical Document Text/);
    assert.match(buildMemoryUpdaterPrompt(), /Do not paraphrase, clean up, expand, shorten/i);
    assert.match(buildMemoryUpdaterPrompt(), /Create or update relevant_world_context/i);
    assert.match(buildMemoryUpdaterPrompt(), /Create or update quests_open_threads/i);
    assert.match(buildMemoryUpdaterPrompt(), /Create or update overarching_big_plot_secrets/i);
    assert.match(buildMemoryUpdaterPrompt(), /## Strong Inferences/);
    assert.match(buildMemoryUpdaterPrompt(), /## DM Seeds/);
    assert.match(buildMemoryUpdaterPrompt(), /Example new NPC response/);
    assert.match(buildMemoryUpdaterPrompt(), /Example revealed written artifact response/);
    assert.match(buildMemoryUpdaterPrompt(), /Example proactive world\/story response/);
    assert.match(buildMemoryUpdaterPrompt(), /"visibility": "player_safe"/);
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

  it("inserts router reasons into clarification job guidance only when provided", () => {
    const prompt = jobPrompt("clarification", "multiplayer", {
      routerReason: "The spell target is ambiguous."
    });

    assert.match(prompt, /Ask one concise clarifying question\.\nRouter clarification reason:/);
    assert.match(
      prompt,
      /The router selected clarification because: The spell target is ambiguous\./
    );
    assert.match(prompt, /Do not treat it as new scene fact, memory, or resolved outcome/);
    assert.match(
      prompt,
      /resolved outcome\.\nBriefly explain why the clarification is needed/
    );

    assert.doesNotMatch(
      jobPrompt("clarification", "multiplayer"),
      /Router clarification reason/
    );
    assert.doesNotMatch(
      jobPrompt("combat", "multiplayer", {
        routerReason: "The spell target is ambiguous."
      }),
      /Router clarification reason/
    );
  });
});
