import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemoryUpdaterPrompt,
  buildRouterPrompt,
  formatRouterCurrentTurnInput,
  jobPrompt,
  renderContextChunks,
  sanitizeMemoryPatchMarkdown,
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

  it("normalizes incidental NPC dialogue quotes in accepted memory patches", () => {
    const result = validateMemoryPatches(
      [
        {
          operation: "replace_section",
          context_id: "npc:veria",
          markdown:
            "# Veria\n\n## Name\nVeria\n\n## Disposition Towards You\nRelieved and aligned. She shows confidence in Merlini's performance, telling him \"You did well back there. Your father would be proud.\"\n\n## Known History\n- She urged Merlini to move quickly, warning \"The blast will carry for miles.\"\n\n## Last Seen\nLeading Merlini toward the Old Road."
        }
      ],
      new Set(["npc:veria"]),
      [
        {
          id: "npc:veria",
          category: "npc_context" as const,
          title: "Veria",
          bodyMarkdown: "# Veria\n\n## Name\nVeria"
        }
      ]
    );

    assert.equal(result.accepted.length, 1);
    const markdown = String(result.accepted[0]?.markdown ?? "");
    assert.doesNotMatch(markdown, /You did well back there/);
    assert.doesNotMatch(markdown, /The blast will carry for miles/);
    assert.match(markdown, /without preserving the exact wording/);
  });

  it("preserves exact wording for written artifacts and durable dialogue cues", () => {
    assert.match(
      sanitizeMemoryPatchMarkdown(
        "# Courier Letter\n\n## Canonical Document Text\n\"Bring the black key at moonrise.\"\n\n## Established Facts\n- The party read the letter.",
        "relevant_world_context"
      ),
      /Bring the black key at moonrise/
    );
    assert.match(
      sanitizeMemoryPatchMarkdown(
        "# Gatekeeper\n\n## Known History\n- The gatekeeper revealed the password \"Blue harbor opens only for moonlit kin.\"",
        "npc_context"
      ),
      /Blue harbor opens only for moonlit kin/
    );
  });

  it("supports rename and merge memory patches", () => {
    const existingContexts = [
      {
        id: "npc:cloaked-figure-at-the-tower",
        category: "npc_context" as const,
        title: "Cloaked Figure at the Tower",
        bodyMarkdown:
          "# Cloaked Figure at the Tower\n\n## Name\nUnknown.\n\n## Aliases / Former Labels\nUnknown."
      },
      {
        id: "npc:veria",
        category: "npc_context" as const,
        title: "Veria",
        bodyMarkdown:
          "# Veria\n\n## Name\nVeria\n\n## Aliases / Former Labels\n- Cloaked Figure at the Tower"
      }
    ];
    const result = validateMemoryPatches(
      [
        {
          operation: "rename_chunk",
          context_id: "npc:cloaked-figure-at-the-tower",
          new_context_id: "npc:veria-renamed",
          title: "Veria",
          markdown: "# Veria\n\n## Name\nVeria"
        },
        {
          operation: "merge_chunk",
          source_context_id: "npc:veria",
          target_context_id: "npc:cloaked-figure-at-the-tower",
          title: "Veria",
          markdown: "# Veria\n\n## Name\nVeria"
        }
      ],
      new Set(["npc:cloaked-figure-at-the-tower", "npc:veria"]),
      existingContexts
    );

    assert.equal(result.accepted.length, 2);
    assert.equal(result.discarded.length, 0);
  });

  it("blocks explicit duplicate NPC creates from revealed names and aliases", () => {
    const existingContexts = [
      {
        id: "npc:cloaked-figure-at-the-tower",
        category: "npc_context" as const,
        title: "Cloaked Figure at the Tower",
        bodyMarkdown:
          "# Cloaked Figure at the Tower\n\n## Name\nUnknown.\n\n## Aliases / Former Labels\nUnknown.\n\n## Known History\n- Revealed her name: Veria."
      },
      {
        id: "npc:old-scout",
        category: "npc_context" as const,
        title: "Old Scout",
        bodyMarkdown:
          "# Old Scout\n\n## Name\nUnknown.\n\n## Aliases / Former Labels\n- Veran"
      }
    ];
    const result = validateMemoryPatches(
      [
        {
          operation: "create_chunk",
          context_id: "npc:veria",
          context_type: "npc_context",
          title: "Veria",
          visibility: "player_safe",
          markdown: "# Veria\n\n## Name\nVeria"
        },
        {
          operation: "create_chunk",
          context_id: "npc:veran",
          context_type: "npc_context",
          title: "Veran",
          visibility: "player_safe",
          markdown: "# Veran\n\n## Name\nVeran"
        }
      ],
      new Set(["npc:cloaked-figure-at-the-tower", "npc:old-scout"]),
      existingContexts
    );

    assert.equal(result.accepted.length, 0);
    assert.equal(result.discarded.length, 2);
    assert.match(
      result.discarded[0]?.reasons.join("\n") ?? "",
      /npc identity already exists as npc:cloaked-figure-at-the-tower/
    );
    assert.match(
      result.discarded[1]?.reasons.join("\n") ?? "",
      /npc identity already exists as npc:old-scout/
    );
  });

  it("does not block NPC creates from similar location or personality alone", () => {
    const result = validateMemoryPatches(
      [
        {
          operation: "create_chunk",
          context_id: "npc:second-cloaked-woman",
          context_type: "npc_context",
          title: "Second Cloaked Woman",
          visibility: "player_safe",
          markdown:
            "# Second Cloaked Woman\n\n## Name\nSecond Cloaked Woman\n\n## Location\nInside the old tower.\n\n## Personality\nCollected and deliberate."
        }
      ],
      new Set(["npc:cloaked-figure-at-the-tower"]),
      [
        {
          id: "npc:cloaked-figure-at-the-tower",
          category: "npc_context" as const,
          title: "Cloaked Figure at the Tower",
          bodyMarkdown:
            "# Cloaked Figure at the Tower\n\n## Name\nUnknown.\n\n## Location\nInside the old tower.\n\n## Personality\nCollected and deliberate."
        }
      ]
    );

    assert.equal(result.accepted.length, 1);
    assert.equal(result.discarded.length, 0);
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
    assert.match(routerPrompt, /Choose rest_mechanics when the player attempts a short rest/i);
    assert.match(routerPrompt, /Choose clarification when the player's intended action is too underspecified/i);
    assert.match(routerPrompt, /without a clear target, target area, or necessary tactical detail/i);
    assert.match(routerPrompt, /Do not choose clarification merely because an action is risky/i);
    assert.match(routerPrompt, /Job selection guide:/);
    assert.match(routerPrompt, /scene_director: Choose for ordinary noncombat scene movement/i);
    assert.match(routerPrompt, /not primarily conversation, clue discovery, combat, rest, death saves, or clarification/i);
    assert.match(routerPrompt, /investigation: Choose when the player is searching, inspecting, tracking/i);
    assert.match(routerPrompt, /trying to uncover information the character does not automatically know/i);
    assert.match(routerPrompt, /npc_dialogue: Choose when the player directly speaks with/i);
    assert.match(routerPrompt, /combat: Choose when combat is active and the input affects turn flow/i);
    assert.match(routerPrompt, /rest_mechanics: Choose when the player attempts a short rest/i);
    assert.match(routerPrompt, /death_saving_throws: Choose when a player character is at 0 HP and dying/i);
    assert.match(routerPrompt, /clarification: Choose only when the intended action cannot be adjudicated safely/i);
    assert.doesNotMatch(routerPrompt, new RegExp(removedOpeningJob));
    assert.match(jobPrompt("scene_director"), /concrete sensory detail/i);
    assert.match(jobPrompt("scene_director"), /observable behavior/i);
    assert.match(jobPrompt("scene_director"), /Keep player agency intact/i);
    assert.doesNotMatch(jobPrompt("scene_director"), /Default narration length:/i);
    for (const job of [
      "scene_director",
      "investigation",
      "npc_dialogue",
      "combat",
      "rest_mechanics",
      "death_saving_throws"
    ] as const) {
      const prompt = jobPrompt(job);
      assert.match(prompt, /Storyteller Voice:/);
      assert.match(
        prompt,
        /engaged, expressive human Dungeon Master who is glad to be telling this story/i
      );
      assert.match(
        prompt,
        /Do not add length merely to create feeling/i
      );
      assert.match(
        prompt,
        /Do not state what a player character thinks, feels, intends, or values/i
      );
    }
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
    assert.match(
      jobPrompt("scene_director"),
      /Do not spend player spell slots for magical flavor, intimidation, visible aura, patron manifestation, threatening gestures, or roleplay descriptions/i
    );
    assert.match(
      jobPrompt("scene_director"),
      /If a player describes ambiguous magic without naming a spell, treat it as narration, a cantrip-like display, or ask clarification/i
    );
    assert.match(
      jobPrompt("scene_director"),
      /Only include spellSlots changes in mechanics_state_update when the current player submission explicitly casts a known leveled spell/i
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
      /Treat player statements as attempted character speech\/action, not automatic world truth/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /new authority, contact, employer, superior, relative, old friend, order, warrant, permit, badge, property right, secret password, or prior arrangement/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /request Deception by default before the NPC yields, lowers guard, gives access, hands over information, or changes official behavior/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /has not chosen the leverage that determines the skill, do not request a generic social roll/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /But first, I'll need you to tell me which approach you take before I ask you to roll/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /"roll_requests": \[\][\s\S]*"next_input_needed": "player_actions"/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /Do not let the NPC become wavering, convinced, compliant, or newly informative before the requested roll is submitted/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /If an NPC has asked for the same substantive truth, confession, proof, or explanation once/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /do not have the NPC ask the same question a third time/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /On the second consistent answer, choose one decisive path/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /When uncertainty matters and the player's leverage is clear/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /state the success DC in public_narration before the roll and include the same target_dc in roll_requests/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /If you roll 13 or higher, that is enough to convince Manifold/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /A social roll must settle the immediate social question/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /Failure should create a new state: confinement, confiscation, escort, alarm, threat, price, lost trust, or a harder bargain/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /False identity, false authority, name-dropping, claimed orders, claimed employment, and impersonation almost always matter/i
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
      jobPrompt("scene_director"),
      /Do not create new canon from a lie by having an NPC supply confirming lore/i
    );
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
    assert.match(
      jobPrompt("combat"),
      /Do not bold visible mechanics or use Markdown emphasis inside public_narration/i
    );
    assert.match(
      jobPrompt("combat"),
      /public_narration must use 2-3 sparse semantic narration color tags/i
    );
    assert.match(
      jobPrompt("combat"),
      /<em> does not count toward the required 2-3 color tags/i
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /Use no more than 0-1 semantic tags/i
    );
    assert.match(
      jobPrompt("combat"),
      /<npc>\.\.\.<\/npc>.*<place>\.\.\.<\/place>.*<clue>\.\.\.<\/clue>.*<danger>\.\.\.<\/danger>.*<faction>\.\.\.<\/faction>.*<object>\.\.\.<\/object>.*<em>\.\.\.<\/em>/is
    );
    assert.match(
      jobPrompt("combat"),
      /<clue>They rolled an 18 \(16\) against Komer's AC of 15<\/clue>/i
    );
    assert.match(jobPrompt("combat"), /<danger>5 piercing<\/danger>/i);
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
      /You rolled a 19 against their AC of 16/i
    );
    assert.doesNotMatch(jobPrompt("combat"), /\*\*/);
    assert.match(jobPrompt("combat"), /use conversational wording with 'you rolled'/i);
    assert.match(
      jobPrompt("combat"),
      /<clue>they rolled a 17 \(15\) against your AC of 14<\/clue>/i
    );
    assert.match(
      jobPrompt("combat"),
      /rolled a <clue>12 \(9\) against DC 14<\/clue> and fails/i
    );
    assert.match(jobPrompt("combat"), /attackBonus, damageFormula, saveBonuses/i);
    assert.match(jobPrompt("combat"), /modified total first and natural die in parentheses/i);
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
      /For every NPC or enemy actor key introduced in initiativeOrder/i
    );
    assert.match(jobPrompt("combat"), /NPC combat durability/i);
    assert.match(jobPrompt("combat"), /Use the highest player character level as partyLevel/i);
    assert.match(
      jobPrompt("combat"),
      /named antagonist, duel-worthy foe, officer, spellcaster, monster leader, or recurring enemy: max\(24, partyLevel \* 10\) to max\(40, partyLevel \* 16\) HP/i
    );
    assert.match(
      jobPrompt("combat"),
      /major boss or climactic solo enemy: at least max\(40, partyLevel \* 18\) HP/i
    );
    assert.match(
      jobPrompt("combat"),
      /Set currentHp equal to maxHp when a fresh combatant enters combat/i
    );
    assert.match(jobPrompt("combat"), /armorClass/i);
    assert.match(jobPrompt("combat"), /isPlayerControlled/i);
    assert.match(jobPrompt("combat"), /combat metadata/i);
    assert.match(jobPrompt("combat"), /Reuse the same actionId/i);
    assert.match(jobPrompt("combat"), /Non-player-controlled catch-up loop/i);
    assert.match(
      jobPrompt("combat"),
      /resolve every consecutive non-player-controlled actor/i
    );
    assert.match(jobPrompt("combat"), /Allied NPC turns are first-class combat turns/i);
    assert.match(
      jobPrompt("combat"),
      /Do not compress an allied NPC's initiative turn into flavor/i
    );
    assert.match(
      jobPrompt("combat"),
      /resolve their movement, action, visible roll math, damage or effect, mechanics_state_update, and turn advancement/i
    );
    assert.match(jobPrompt("combat"), /Do not merely announce future turns/i);
    assert.match(
      jobPrompt("combat"),
      /Only return next_input_needed player_actions in active combat after combat-start initiative requirements are satisfied/i
    );
    assert.match(
      jobPrompt("combat"),
      /Combat-start initiative gating has priority over damage resolution/i
    );
    assert.match(jobPrompt("combat"), /<clue>Turn order:<\/clue>/i);
    assert.match(
      jobPrompt("combat"),
      /alert enemy Magic Missile starts with initiative, not damage/i
    );
    assert.match(
      jobPrompt("combat"),
      /player turn resolved, all non-player turns catch up before control returns/i
    );
    assert.match(
      jobPrompt("combat"),
      /player turn resolved, enemy and allied NPC turns both catch up before control returns/i
    );
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: resolving Shard Trail Agent 2's attack, then describing Brynn only shouting or parrying in the background/i
    );
    assert.match(
      jobPrompt("combat"),
      /<npc>Brynn Stakehold<\/npc> takes her turn immediately/i
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
      /<clue>Bandit captain initiative roll: 15<\/clue>\. <clue>Cutthroat initiative rolls: 11 and 8<\/clue>\./i
    );
    assert.match(
      jobPrompt("combat"),
      /Roll initiative: <clue>1d20 \+ your initiative modifier<\/clue>/i
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
      /<clue>They rolled an 18 \(16\) against Komer's AC of 15<\/clue>, so the spearpoint/i
    );
    assert.doesNotMatch(
      jobPrompt("combat"),
      /They rolled an 18 \(16\) against Komer's AC of 15[^"]*\\n\\nThe spearpoint/i
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
    assert.match(jobPrompt("combat"), /Roll Fireball damage: <clue>8d6<\/clue>/i);
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
      /<clue>They rolled an 11 \(9\) against your AC of 12<\/clue>/i
    );
    assert.match(
      jobPrompt("combat"),
      /<clue>They rolled an 8 \(7\) against DC 13 on the Arcana check<\/clue>/i
    );
    assert.match(
      jobPrompt("combat"),
      /<clue>They rolled a 17 \(15\) against your AC of 14<\/clue>.*<danger>6 slashing<\/danger>.*<clue>1d6 \+ 2<\/clue>.*<danger>24 HP to 18 HP<\/danger>/is
    );
    assert.match(jobPrompt("combat"), /players skip, hostile NPC still creates pressure/i);
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: saying the wounded warden snarls, braces, waits, watches, hesitates/i
    );
    assert.match(
      jobPrompt("combat"),
      /<clue>They rolled a 12 \(10\) against Komer's AC of 18<\/clue>/i
    );
    assert.match(
      jobPrompt("combat"),
      /NPC resolves, then a fresh player turn begins/i
    );
    assert.match(jobPrompt("combat"), /Bad response to avoid: requesting Tart's attack roll/i);
    assert.match(jobPrompt("combat"), /"input_targets": \[\s+"player:tart"\s+\]/);
    assert.match(
      jobPrompt("combat"),
      /<clue>They rolled a 16 \(13\) against Por's AC of 16<\/clue>.*<danger>7 slashing<\/danger>.*<clue>1d6 \+ 3<\/clue>.*<danger>34 HP to 27 HP<\/danger>/is
    );
    assert.match(jobPrompt("combat"), /player attack hits, request player damage/i);
    assert.match(
      jobPrompt("combat"),
      /If a player declares an attack-roll action but has not submitted the attack roll, request the attack roll first/i
    );
    assert.match(
      jobPrompt("combat"),
      /For Eldritch Blast, Scorching Ray, Extra Attack, or any action with multiple attack rolls/i
    );
    assert.match(
      jobPrompt("combat"),
      /Only request damage after a submitted attack roll hits/i
    );
    assert.match(
      jobPrompt("combat"),
      /For player attack rolls, use conversational wording with 'you rolled' only when the current turn input contains that submitted player attack roll result/i
    );
    assert.match(
      jobPrompt("combat"),
      /Eldritch Blast requires player attack rolls before damage/i
    );
    assert.match(
      jobPrompt("combat"),
      /Bad response to avoid: saying 'You rolled a 19 against Agent 3's AC of 13/i
    );
    assert.match(
      jobPrompt("combat"),
      /Eldritch Blast attack roll \(beam 1\)/i
    );
    assert.match(
      jobPrompt("combat"),
      /"kind": "attack_roll"/i
    );
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
      /roll Magic Missile damage: <clue>3d4 \+ 3<\/clue>/i
    );
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
      /<npc>Warden Captain Hesk<\/npc> rolled an <clue>11 \(8\) against POKE's spell save DC of 13<\/clue>/i
    );
    assert.match(
      jobPrompt("combat"),
      /The robed priest rolled a <clue>16 \(13\) against DC 14<\/clue> and succeeds/i
    );
    assert.match(jobPrompt("combat"), /final enemy defeated and combat ends/i);
    assert.match(
      jobPrompt("combat"),
      /<clue>You rolled a 19 against their AC of 13<\/clue>.*<danger>11 bludgeoning<\/danger>/is
    );
    assert.match(jobPrompt("combat"), /Never silently modify HP/);
    assert.match(
      jobPrompt("combat"),
      /must include a compact current-resource reminder immediately before the final action handoff/i
    );
    assert.match(
      jobPrompt("combat"),
      /next_input_needed is player_actions, roll_requests is empty/i
    );
    assert.match(
      jobPrompt("combat"),
      /Do not shape the summary around spellcasters/i
    );
    assert.match(
      jobPrompt("combat"),
      /Second Wind, Action Surge, Lay on Hands, Divine Sense/i
    );
    assert.match(
      jobPrompt("combat"),
      /summarize the pact slot pool as pact magic slots/i
    );
    assert.match(
      jobPrompt("combat"),
      /Example no-dice combat handoff: 'It is your turn.*<clue>50<\/clue> hit points\\n<clue>3<\/clue> rages\\n\\nWhat do you do\?'/is
    );
    assert.match(
      jobPrompt("combat"),
      /Example pact summary line: '<clue>0<\/clue> pact magic slots'/i
    );
    assert.match(
      jobPrompt("combat"),
      /Example martial resource lines: '<clue>1<\/clue> second wind\\n<clue>1<\/clue> action surge'/i
    );
    assert.match(
      jobPrompt("combat"),
      /Example caster resource lines with only present spell slot levels: '<clue>3<\/clue> third level spell slots\\n<clue>5<\/clue> sorcery points'/i
    );
    assert.match(jobPrompt("combat"), /<clue>5<\/clue> sorcery points/i);
    assert.match(
      jobPrompt("combat"),
      /summarize only the actor who is receiving the handoff/i
    );
    assert.match(
      jobPrompt("combat"),
      /attempts to attack with, throw, draw, load, fire, equip, or otherwise use a weapon they do not have/i
    );
    assert.match(
      jobPrompt("combat"),
      /Do not spend tracked class resources for flavor, posture, intimidation, effort, style, or descriptive combat narration/i
    );
    assert.match(
      jobPrompt("combat"),
      /Only include resources changes in mechanics_state_update when the current player submission explicitly uses a tracked resource/i
    );
    assert.match(
      jobPrompt("scene_director"),
      /When a tracked class resource is spent, include mechanics_state_update\.actors\[actorKey\]\.resources/i
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
    for (const job of ["scene_director", "npc_dialogue", "combat"] as const) {
      const prompt = jobPrompt(job);
      assert.match(prompt, /Physical Communication Boundary:/);
      assert.match(
        prompt,
        /relative location, distance, barriers, noise, visibility, and who can plausibly hear/i
      );
      assert.match(
        prompt,
        /A whisper only reaches someone adjacent or explicitly close enough/i
      );
      assert.match(
        prompt,
        /another room, a loft, upstairs, outside, hidden, behind a door, across a crowd, or separated by noise/i
      );
      assert.match(
        prompt,
        /private dialogue unless earshot, line of sight, or magic has already been established/i
      );
      assert.match(
        prompt,
        /visible movement, silence, raised-voice risk, gestures the player can actually see, or require the player to move closer/i
      );
    }
    for (const job of ["scene_director", "investigation", "npc_dialogue"] as const) {
      const prompt = jobPrompt(job);
      assert.match(prompt, /Submitted Player Roll Result Opening:/);
      assert.match(
        prompt,
        /public_narration must start with this exact sentence pattern/i
      );
      assert.match(
        prompt,
        /With a \[quality adjective\] roll of <clue>\[total\]<\/clue>, here's what happens:/i
      );
      assert.match(
        prompt,
        /Use the submitted final total inside <clue>\.\.\.<\/clue>/i
      );
      assert.match(
        prompt,
        /measly for very low rolls, shaky for low rolls, decent for middling rolls, strong for high rolls, or staggering for exceptional rolls/i
      );
    }
    for (const job of [
      "combat",
      "rest_mechanics",
      "death_saving_throws",
      "clarification"
    ] as const) {
      assert.doesNotMatch(jobPrompt(job), /Submitted Player Roll Result Opening:/);
      assert.doesNotMatch(
        jobPrompt(job),
        /With a \[quality adjective\] roll of <clue>\[total\]<\/clue>, here's what happens:/i
      );
    }
    assert.match(
      jobPrompt("scene_director"),
      /Only include NPC speech, whispers, gestures, warnings, or reactions that are physically available from the current staging/i
    );
    assert.match(
      jobPrompt("npc_dialogue"),
      /NPC communication is local, not omnipresent/i
    );
    for (const job of [
      "investigation",
      "rest_mechanics",
      "death_saving_throws",
      "clarification"
    ] as const) {
      assert.doesNotMatch(jobPrompt(job), /Physical Communication Boundary:/);
      assert.doesNotMatch(
        jobPrompt(job),
        /private dialogue unless earshot, line of sight, or magic has already been established/i
      );
    }
    assert.match(jobPrompt("rest_mechanics"), /Rest Mechanics Job/i);
    assert.match(jobPrompt("rest_mechanics"), /actor.resources for class resources/i);
    assert.match(jobPrompt("rest_mechanics"), /Sorcery Points, Ki Points, Channel Divinity/i);
    assert.match(jobPrompt("rest_mechanics"), /On a completed short rest, reset resources whose recharge is short_rest/i);
    assert.match(jobPrompt("rest_mechanics"), /On a completed long rest, reset resources whose recharge is short_rest, long_rest, or dawn/i);
    assert.match(jobPrompt("rest_mechanics"), /reset normal spellSlots used values to 0/i);
    assert.match(jobPrompt("rest_mechanics"), /include mechanics_state_update with the affected player actor key/i);
    assert.match(jobPrompt("rest_mechanics"), /Do not invent new class resources/i);
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
      "rest_mechanics",
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
    assert.match(buildMemoryUpdaterPrompt(), /rename_chunk/);
    assert.match(buildMemoryUpdaterPrompt(), /merge_chunk/);
    assert.match(buildMemoryUpdaterPrompt(), /Create a new NPC card/i);
    assert.match(buildMemoryUpdaterPrompt(), /Aliases \/ Former Labels/);
    assert.match(buildMemoryUpdaterPrompt(), /do not create a second NPC card/i);
    assert.match(buildMemoryUpdaterPrompt(), /previously known by description, title, disguise, role, or uncertainty/i);
    assert.match(buildMemoryUpdaterPrompt(), /Make each NPC feel like a compelling character/i);
    assert.match(buildMemoryUpdaterPrompt(), /## Disposition Towards You/);
    assert.match(buildMemoryUpdaterPrompt(), /Never infer gender or pronouns/i);
    assert.match(buildMemoryUpdaterPrompt(), /neutral wording until play establishes pronouns/i);
    assert.match(buildMemoryUpdaterPrompt(), /do not silently normalize the conflict/i);
    assert.match(buildMemoryUpdaterPrompt(), /campaign context as a living world bible/i);
    assert.match(buildMemoryUpdaterPrompt(), /Store the meaning of incidental NPC dialogue/i);
    assert.match(buildMemoryUpdaterPrompt(), /fresh wording rather than repeating the prior line/i);
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
    assert.match(
      jobPrompt("npc_dialogue", "single_player"),
      /Do not repeat prior dialogue phrasing/i
    );
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
    assert.doesNotMatch(
      soloCombatPrompt,
      /When multiple player submissions arrive/i
    );
    assert.doesNotMatch(
      soloCombatPrompt,
      /If multiple player-controlled actors are in combat/i
    );

    assert.match(multiplayerCombatPrompt, /This is multiplayer combat/i);
    assert.match(multiplayerCombatPrompt, /all-player prompt/i);
    assert.match(
      multiplayerCombatPrompt,
      /When multiple player submissions arrive, resolve the current turn owner's valid action first/i
    );
    assert.match(
      multiplayerCombatPrompt,
      /If multiple player-controlled actors are in combat, summarize only the actor who is receiving the handoff/i
    );
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
