import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  CampaignAskDmResponseSchema,
  CampaignCreateResponseSchema,
  CampaignDebugTracesResponseSchema,
  CampaignRegenerateResponseSchema,
  CampaignSoloTurnResponseSchema
} from "@ai-dnd/contracts";

import {
  app,
  database,
  getProviderInputs,
  resetProviderInputs,
  setProviderOverride,
  signIn,
  type DebugFields
} from "./test/app-test-harness.js";

async function createSinglePlayerCampaign(label: string) {
  const cookie = await signIn(`${label}@example.com`);
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: `${label}-client`,
      playerName: "Owner",
      characterName: "Seren",
      characterSheet: "A quick-thinking ranger."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  return { cookie, campaignId: created.campaign.id };
}

async function waitForCondition(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail(message);
}

test("DM runtime routes handle authorized solo, ask-DM, regenerate, and traces", async () => {
  const cookie = await signIn("dm-runtime-owner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: "dm-runtime-owner-client",
      playerName: "Owner",
      characterName: "Seren",
      characterSheet: "A quick-thinking ranger."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I study the tracks beside the road.",
      clientMessageId: "solo-client-message-1"
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);
  const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
  assert.equal(solo.messages.at(-1)?.role, "dm");
  assert.equal(
    (solo.messages.at(-1)?.debug as DebugFields | undefined)?.rawResponse,
    "{}"
  );
  assert.equal(
    (solo.messages.at(-1)?.debug as DebugFields | undefined)?.temperature,
    0.8
  );
  const routerDebug = (solo.messages.at(-1)?.debug as DebugFields | undefined)
    ?.router as
    | {
        requestMessages?: { role?: string; content?: string }[];
        rawResponse?: string;
        parsedOutput?: { jobNeeded?: string };
      }
    | undefined;
  assert.equal(typeof routerDebug?.parsedOutput?.jobNeeded, "string");
  assert.match(
    routerDebug?.requestMessages?.at(-1)?.content ?? "",
    /Routing state JSON:/
  );
  assert.match(routerDebug?.rawResponse ?? "", /job_needed/);
  const combatState = (solo.messages.at(-1)?.debug as DebugFields | undefined)
    ?.combatState as
    | {
        combat?: unknown;
        actors?: Record<string, { characterName?: unknown }>;
      }
    | undefined;
  assert.deepEqual(combatState?.combat, {
    active: false,
    round: 0,
    turnOwner: null,
    initiativeOrder: []
  });
  assert.ok(
    Object.values(combatState?.actors ?? {}).some(
      (actor) => actor.characterName === "Seren"
    )
  );
  assert.equal(solo.isResolving, false);

  database.contextChunks.push({
    campaign_id: created.campaign.id,
    context_key: "world:road-tracks",
    category: "relevant_world_context",
    title: "Road Tracks",
    visibility: "player_safe",
    priority: 10,
    body_markdown:
      "# Road Tracks\n\n## Established Facts\n- The road tracks were made by a two-legged creature dragging a hooked pole.",
    archived_at: null,
    updated_at: new Date()
  });

  const askResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/ask-dm`,
    headers: {
      cookie
    },
    payload: {
      question: "Would my ranger know what made these tracks?",
      clientMessageId: "ask-client-message-1"
    }
  });

  assert.equal(askResponse.statusCode, 200, askResponse.body);
  CampaignAskDmResponseSchema.parse(askResponse.json());
  const askAnswerEvent = database.campaignEvents
    .filter(
      (event) =>
        event.campaign_id === created.campaign.id && event.type === "dm_answer"
    )
    .at(-1);
  assert.ok(askAnswerEvent);
  const askAnswerPayload = askAnswerEvent.payload as {
    messageId?: string;
    content?: string;
    aiDebug?: DebugFields;
  };
  assert.match(
    askAnswerPayload.content ?? "",
    /two-legged creature dragging a hooked pole/
  );
  assert.notEqual(askAnswerPayload.messageId, "provider-ask-dm-1");
  assert.equal(
    askAnswerPayload.aiDebug?.providerResponseId,
    "provider-ask-dm-1"
  );
  const askSelectorDebug = askAnswerPayload.aiDebug?.askDmContextSelector as
    | {
        requestMessages?: { role?: string; content?: string }[];
        rawResponse?: string;
        parsedOutput?: {
          contextKeys?: {
            relevant_world_context?: string[];
          };
        };
      }
    | undefined;
  assert.match(
    askSelectorDebug?.requestMessages?.at(-1)?.content ?? "",
    /Available context chunk keys JSON:/
  );
  assert.deepEqual(
    askSelectorDebug?.parsedOutput?.contextKeys?.relevant_world_context,
    ["world:road-tracks"]
  );
  const askAnswerDebug = askAnswerPayload.aiDebug as
    | {
        requestMessages?: { role?: string; content?: string }[];
      }
    | undefined;
  assert.match(
    askAnswerDebug?.requestMessages?.at(-1)?.content ?? "",
    /Selected context chunks:[\s\S]*Road Tracks/
  );

  const latestDmMessage = solo.messages
    .filter((message) => message.role === "dm")
    .at(-1);
  assert.ok(latestDmMessage);

  const regenerateResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/regenerate`,
    headers: {
      cookie
    },
    payload: {
      messageId: latestDmMessage.id
    }
  });

  assert.equal(regenerateResponse.statusCode, 200, regenerateResponse.body);
  const regenerated = CampaignRegenerateResponseSchema.parse(
    regenerateResponse.json()
  );
  assert.equal(regenerated.messages.at(-1)?.role, "dm");
  assert.equal(
    (regenerated.messages.at(-1)?.debug as DebugFields | undefined)?.model,
    "test-model"
  );
  assert.equal(
    regenerated.messages.some((message) =>
      message.content.includes("Would my ranger know")
    ),
    false
  );
  assert.equal(
    regenerated.messages.some((message) => message.kind === "ask_dm_answer"),
    false
  );

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}/debug-traces?limit=200`,
    headers: {
      cookie
    }
  });

  assert.equal(tracesResponse.statusCode, 200, tracesResponse.body);
  const traces = CampaignDebugTracesResponseSchema.parse(tracesResponse.json());
  assert.ok(traces.traces.length > 0);
  assert.ok(
    traces.traces.some((trace) => trace.phase === "provider_response_received")
  );
  const askTrace = traces.traces.find(
    (trace) => trace.phase === "ask_dm_answer_parsed"
  );
  assert.ok(askTrace);
  const askSelectorTrace = traces.traces.find(
    (trace) => trace.phase === "ask_dm_context_selector_response_received"
  );
  assert.ok(askSelectorTrace);
  const askContextSnapshotTrace = traces.traces.find(
    (trace) => trace.phase === "ask_dm_context_snapshot"
  );
  assert.ok(askContextSnapshotTrace);
  assert.deepEqual(
    (askContextSnapshotTrace as { includedContextKeys?: unknown })
      .includedContextKeys,
    ["world:road-tracks"]
  );
  const askModelCalls = database.dmModelCalls.filter(
    (call) =>
      call.campaign_id === created.campaign.id &&
      (call.phase === "ask_dm_context_selector" || call.phase === "ask_dm")
  );
  assert.deepEqual(
    askModelCalls.map((call) => [call.phase, call.turn_id]),
    [
      ["ask_dm_context_selector", null],
      ["ask_dm", null]
    ]
  );
  const askProviderTrace = traces.traces.find(
    (trace) =>
      trace.phase === "provider_response_received" &&
      trace.provider &&
      typeof trace.provider === "object" &&
      "rawRequestMessages" in trace.provider &&
      Array.isArray(
        (trace.provider as { rawRequestMessages?: unknown }).rawRequestMessages
      ) &&
      (
        trace.provider as {
          rawRequestMessages?: { content?: string }[];
        }
      ).rawRequestMessages?.[0]?.content?.includes(
        "out-of-turn table question"
      )
  );
  assert.ok(askProviderTrace);
  const routerTrace = traces.traces.find(
    (trace) => trace.phase === "router_response_received"
  );
  assert.ok(routerTrace);
  const routerTraceProvider = routerTrace.provider as
    | {
        rawResponse?: string;
        rawRequestMessages?: { role?: string; content?: string }[];
      }
    | undefined;
  assert.match(
    routerTraceProvider?.rawRequestMessages?.at(-1)?.content ?? "",
    /Routing state JSON:/
  );
  assert.match(routerTraceProvider?.rawResponse ?? "", /job_needed/);
});

test("solo turn applies accepted inventory patches to the character sheet", async () => {
  resetProviderInputs();
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-inventory-currency"
  );
  const player = database.players.find(
    (candidate) => candidate.campaign_id === campaignId
  );
  assert.ok(player);
  player.character_sheet = [
    "Core Stats",
    "Level 1 Ranger",
    "",
    "Inventory",
    "Rations",
    "",
    "Currency",
    "5 GP"
  ].join("\n");

  setProviderOverride(async (input) => {
    const content = JSON.stringify({
      public_narration:
        "The barkeep takes the three copper pieces and slides the clay cup across, then adds a brass token beside it.",
      resolution_mode: "resolved_without_dice",
      roll_requests: [],
      next_input_needed: "player_actions",
      input_targets: [],
      input_policy: "all_players",
      mechanics_state_update: {},
      inventory_state_update: {
        patches: [
          {
            actor_key: "player:dm-runtime-inventory-currency-client",
            type: "currency",
            currency: "GP",
            delta: -3,
            reason: "Paid 3 copper for a drink."
          },
          {
            actor_key: "player:dm-runtime-inventory-currency-client",
            type: "item",
            operation: "add",
            item: "brass token",
            quantity: 1,
            reason: "The barkeep gave the player a brass token."
          }
        ]
      }
    });

    return {
      id: "provider-inventory-currency",
      content,
      debug: {
        requestMessages: [
          {
            role: "system",
            content: input.instructions
          },
          {
            role: "user",
            content: input.message
          }
        ],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  try {
    const soloResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      headers: {
        cookie
      },
      payload: {
        message: "I buy a drink for three copper.",
        clientMessageId: "solo-inventory-currency"
      }
    });

    assert.equal(soloResponse.statusCode, 200, soloResponse.body);
    const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
    assert.match(
      solo.messages.at(-1)?.content ?? "",
      /\*\(Inventory update: you spent 3 CP and gained a brass token\.\)\*/
    );
    assert.match(player.character_sheet, /Inventory\nRations\nbrass token/);
    assert.match(player.character_sheet, /Currency\nGP: 4\nSP: 9\nCP: 7/);
    const latestDmMessage = database.campaignEvents
      .filter(
        (event) => event.campaign_id === campaignId && event.type === "turn_resolved"
      )
      .at(-1);
    const inventoryState = (latestDmMessage?.payload as { aiDebug?: DebugFields })
      ?.aiDebug?.inventoryState as
      | {
          acceptedPatches?: unknown[];
          appliedPatches?: unknown[];
          discardedPatches?: unknown[];
        }
      | undefined;

    assert.equal(inventoryState?.acceptedPatches?.length, 2);
    assert.equal(inventoryState?.appliedPatches?.length, 2);
    assert.deepEqual(inventoryState?.discardedPatches, []);
  } finally {
    setProviderOverride(undefined);
  }
});

test("DM runtime failure traces include provider debug diagnostics", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-provider-debug"
  );

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "TRIGGER_PROVIDER_DEBUG_FAILURE"
    }
  });

  assert.equal(soloResponse.statusCode, 500);

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${campaignId}/debug-traces?limit=10`,
    headers: {
      cookie
    }
  });

  assert.equal(tracesResponse.statusCode, 200, tracesResponse.body);
  const traces = CampaignDebugTracesResponseSchema.parse(tracesResponse.json());
  const failedTrace = traces.traces.find(
    (trace) => trace.phase === "dm_turn_failed"
  );

  assert.ok(failedTrace);
  const provider = failedTrace.provider as
    | {
        model?: string;
        rawResponseLength?: number;
        providerTimings?: { responseBytes?: number }[];
        requestMessages?: { role?: string }[];
      }
    | undefined;
  assert.equal(provider?.model, "test-model");
  assert.equal(provider?.rawResponseLength, 0);
  assert.equal(provider?.providerTimings?.[0]?.responseBytes, 0);
  assert.equal(provider?.requestMessages?.length, 2);
  assert.equal(provider?.requestMessages?.[0]?.role, "system");
});

test("DM parser failure traces keep the exact provider response", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-parser-debug"
  );

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I attack. TRIGGER_RESOLVED_COMBAT_WITHOUT_ROLLS"
    }
  });

  assert.equal(soloResponse.statusCode, 500);

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${campaignId}/debug-traces?limit=10`,
    headers: {
      cookie
    }
  });

  assert.equal(tracesResponse.statusCode, 200, tracesResponse.body);
  const traces = CampaignDebugTracesResponseSchema.parse(tracesResponse.json());
  const failedTrace = traces.traces.find(
    (trace) => trace.phase === "dm_turn_failed"
  );
  const providerTrace = traces.traces.find(
    (trace) =>
      trace.phase === "provider_response_received" &&
      trace.traceId === failedTrace?.traceId
  );
  const provider = providerTrace?.provider as
    | {
        rawResponse?: string;
        rawResponseLength?: number;
      }
    | undefined;
  const failedProvider = failedTrace?.provider as
    | {
        rawResponse?: string;
        rawResponseLength?: number;
      }
    | undefined;

  assert.ok(providerTrace);
  assert.ok(failedTrace);
  assert.equal(provider?.rawResponse, failedProvider?.rawResponse);
  assert.equal(provider?.rawResponseLength, provider?.rawResponse?.length);
  assert.match(provider?.rawResponse ?? "", /Seren lunges with her blade/);
});

test("DM contract accepts clarification as playable targeted input", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-contract-recovery"
  );

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "TRIGGER_CLARIFICATION_NEXT_INPUT"
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);
  const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
  assert.match(
    solo.messages.at(-1)?.content ?? "",
    /are you casting one spell this turn/i
  );
  assert.equal(solo.nextInputNeeded, "clarification");
  assert.deepEqual(solo.inputTargets, ["player:owner"]);
  assert.equal(solo.inputPolicy, "only_targeted_players");

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${campaignId}/debug-traces?limit=10`,
    headers: {
      cookie
    }
  });

  assert.equal(tracesResponse.statusCode, 200, tracesResponse.body);
  const traces = CampaignDebugTracesResponseSchema.parse(tracesResponse.json());
  const recoveryTrace = traces.traces.find(
    (trace) => trace.phase === "dm_contract_parse_recovered"
  );

  assert.equal(recoveryTrace, undefined);
});

test("solo combat turn can start initiative through mechanics state update", async () => {
  const cookie = await signIn("dm-runtime-initiative@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: "dm-runtime-initiative-client",
      playerName: "Owner",
      characterName: "Seren",
      characterSheet: [
        "Class: Sorcerer",
        "Max HP: 32",
        "Current HP: 32",
        "Spell Slots",
        "3rd-level slots: 2 total, 0 used, 2 remaining"
      ].join("\n"),
      mechanicsSeed: {
        characterClass: "Sorcerer",
        level: 5,
        maxHp: 32,
        currentHp: 32,
        spellSlots: {
          "3": { max: 2, used: 0 }
        }
      }
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaignId = created.campaign.id;
  resetProviderInputs();

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I cast fireball on Mara",
      clientMessageId: "initiative-fireball-action"
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);
  const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
  const latestDmMessage = solo.messages.at(-1);
  const debug = latestDmMessage?.debug as DebugFields | undefined;
  const combatState = debug?.combatState as
    | {
        combat?: {
          active?: boolean;
          round?: number;
          turnOwner?: string | null;
          initiativeOrder?: string[];
        };
        actors?: Record<string, { characterName?: string; currentHp?: number }>;
      }
    | undefined;

  assert.equal(latestDmMessage?.role, "dm");
  assert.match(latestDmMessage?.content ?? "", /Roll 1d20 \+ 2 for initiative/);
  assert.equal(solo.pendingRollRequest?.dice, "1d20");
  assert.equal(solo.pendingRollRequest?.modifier, 2);
  assert.equal(solo.pendingRollRequest?.label, "Initiative");
  assert.equal(combatState?.combat?.active, true);
  assert.equal(combatState?.combat?.round, 1);
  assert.equal(combatState?.combat?.turnOwner?.startsWith("player:"), true);
  assert.deepEqual(combatState?.combat?.initiativeOrder?.slice(1), [
    "npc:mara",
    "npc:drowned-choir-raider-1",
    "npc:drowned-choir-raider-2"
  ]);
  assert.equal(combatState?.actors?.["npc:mara"]?.characterName, "Mara");

  assert.equal(getProviderInputs().length, 1);
});

test("surprise opening combat resolves the opening roll before initiative", async () => {
  const cookie = await signIn("dm-runtime-surprise-initiative@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: "dm-runtime-surprise-initiative-client",
      playerName: "Owner",
      characterName: "Seren",
      characterSheet: [
        "Class: Sorcerer",
        "Max HP: 32",
        "Current HP: 32",
        "Spell Slots",
        "3rd-level slots: 2 total, 0 used, 2 remaining"
      ].join("\n"),
      mechanicsSeed: {
        characterClass: "Sorcerer",
        level: 5,
        maxHp: 32,
        currentHp: 32,
        spellSlots: {
          "3": { max: 2, used: 0 }
        }
      }
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  resetProviderInputs();

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "Mara has not noticed me, so I cast fireball on Mara",
      clientMessageId: "surprise-fireball-action"
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);
  const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
  const latestDmMessage = solo.messages.at(-1);

  assert.equal(latestDmMessage?.role, "dm");
  assert.match(latestDmMessage?.content ?? "", /Roll 8d6 for Fireball damage/);
  assert.equal(solo.pendingRollRequest?.dice, "8d6");
  assert.equal(solo.pendingRollRequest?.label, "Fireball damage");
  assert.equal(solo.pendingRollRequest?.modifier, 0);
  assert.doesNotMatch(latestDmMessage?.content ?? "", /Roll 1d20 \+ 2 for initiative/);

  assert.equal(getProviderInputs().length, 1);

  assert.ok(solo.pendingRollRequest?.id);
  const damageResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      rollSubmissions: [
        {
          rollRequestId: solo.pendingRollRequest.id,
          rollResult: {
            rolls: [5, 1, 4, 1, 3, 6, 4, 5],
            total: 29
          },
          clientMessageId: "surprise-fireball-damage"
        }
      ]
    }
  });

  assert.equal(damageResponse.statusCode, 200, damageResponse.body);
  const afterDamage = CampaignSoloTurnResponseSchema.parse(damageResponse.json());
  const damageDmMessage = afterDamage.messages.at(-1);

  assert.equal(damageDmMessage?.role, "dm");
  assert.match(damageDmMessage?.content ?? "", /opening strike has landed/i);
  assert.match(damageDmMessage?.content ?? "", /roll 1d20 \+ 2 for initiative/i);
  assert.equal(afterDamage.pendingRollRequest?.dice, "1d20");
  assert.equal(afterDamage.pendingRollRequest?.modifier, 2);
  assert.equal(afterDamage.pendingRollRequest?.label, "Initiative");
});

test("solo combat catches up NPC turns instead of rejecting the player", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-npc-catchup"
  );
  const playerActorKey = "player:dm-runtime-npc-catchup-client";
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    mechanicsState: {
      combat: {
        active: true,
        round: 1,
        turnOwner: "npc:cutlass-raider",
        initiativeOrder: [
          playerActorKey,
          "npc:cutlass-raider",
          "npc:horn-blower"
        ]
      },
      actors: {
        [playerActorKey]: {
          characterName: "Seren",
          currentHp: 24,
          maxHp: 24,
          conditions: []
        },
        "npc:cutlass-raider": {
          characterName: "Cutlass raider",
          currentHp: 12,
          maxHp: 12,
          conditions: []
        },
        "npc:horn-blower": {
          characterName: "Horn-blower",
          currentHp: 10,
          maxHp: 10,
          conditions: []
        }
      }
    }
  };
  resetProviderInputs();

  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I cast Scorching Ray at the cutlass raider.",
      clientMessageId: "npc-catchup-scorching-ray"
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);
  const solo = CampaignSoloTurnResponseSchema.parse(soloResponse.json());
  const latestDmMessage = solo.messages.at(-1);
  const debug = latestDmMessage?.debug as DebugFields | undefined;
  const combatState = debug?.combatState as
    | {
        combat?: {
          turnOwner?: string | null;
        };
        actors?: Record<string, { currentHp?: number }>;
      }
    | undefined;

  assert.equal(latestDmMessage?.role, "dm");
  assert.match(latestDmMessage?.content ?? "", /cutlass raider's turn resolves first/i);
  assert.match(latestDmMessage?.content ?? "", /attack roll: 17 vs AC 14 - hit/i);
  assert.match(latestDmMessage?.content ?? "", /damage roll: 1d6 \+ 2 = 6/i);
  assert.match(latestDmMessage?.content ?? "", /6 slashing damage/i);
  assert.match(latestDmMessage?.content ?? "", /drops from 24 HP to 18 HP/i);
  assert.doesNotMatch(latestDmMessage?.content ?? "", /It is not your turn/i);
  assert.doesNotMatch(latestDmMessage?.content ?? "", /lunges[^.]*What do you do/is);
  assert.equal(combatState?.combat?.turnOwner, playerActorKey);
  assert.equal(combatState?.actors?.[playerActorKey]?.currentHp, 18);

  assert.equal(getProviderInputs().length, 1);

  const updatedCampaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  assert.ok(updatedCampaign);
  updatedCampaign.metadata = {
    ...(updatedCampaign.metadata as Record<string, unknown>),
    mechanicsState: {
      ...((updatedCampaign.metadata as Record<string, unknown>).mechanicsState as Record<
        string,
        unknown
      >),
      combat: {
        active: true,
        round: 2,
        turnOwner: "Horn-blower",
        initiativeOrder: [
          playerActorKey,
          "npc:cutlass-raider",
          "npc:horn-blower"
        ]
      }
    }
  };

  const secondSoloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I cast Scorching Ray at the horn-blower.",
      clientMessageId: "npc-catchup-scorching-ray-second"
    }
  });

  assert.equal(secondSoloResponse.statusCode, 200, secondSoloResponse.body);
  const secondSolo = CampaignSoloTurnResponseSchema.parse(secondSoloResponse.json());
  const secondDmMessage = secondSolo.messages.at(-1);
  const secondDebug = secondDmMessage?.debug as DebugFields | undefined;
  const secondCombatState = secondDebug?.combatState as
    | {
        combat?: {
          turnOwner?: string | null;
          round?: number;
        };
        actors?: Record<string, { currentHp?: number }>;
      }
    | undefined;

  assert.equal(secondDmMessage?.role, "dm");
  assert.match(secondDmMessage?.content ?? "", /attack roll: 17 vs AC 14 - hit/i);
  assert.match(secondDmMessage?.content ?? "", /damage roll: 1d6 \+ 2 = 6/i);
  assert.match(secondDmMessage?.content ?? "", /6 slashing damage/i);
  assert.doesNotMatch(secondDmMessage?.content ?? "", /It is not your turn/i);
  assert.equal(secondCombatState?.combat?.turnOwner, playerActorKey);
  assert.equal(secondCombatState?.combat?.round, 1);
  assert.equal(secondCombatState?.actors?.[playerActorKey]?.currentHp, 12);
});

test("solo turns send the current action once outside provider history", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-current-action-history"
  );
  resetProviderInputs();

  const firstResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I check the old road for tracks.",
      clientMessageId: "history-first-action"
    }
  });

  assert.equal(firstResponse.statusCode, 200, firstResponse.body);

  const secondResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I follow the clearest trail.",
      clientMessageId: "history-second-action"
    }
  });

  assert.equal(secondResponse.statusCode, 200, secondResponse.body);

  const secondProviderInput = getProviderInputs().at(-1);
  assert.ok(secondProviderInput);
  assert.match(secondProviderInput.message, /I follow the clearest trail\./);
  assert.match(secondProviderInput.message, /Inventory possession gate/i);
  assert.match(
    secondProviderInput.message,
    /Player wording is not authoritative for possession/i
  );
  assert.match(
    secondProviderInput.message,
    /pulling, or producing an item from a bag as attempted inventory actions/i
  );
  assert.doesNotMatch(
    secondProviderInput.history.map((message) => message.content).join("\n"),
    /I follow the clearest trail\./
  );
  assert.ok(
    secondProviderInput.history.some(
      (message) =>
        message.role === "player" &&
        message.content === "I check the old road for tracks."
    )
  );
});

test("DM runtime routes reject invalid params and incomplete payloads", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-invalid"
  );

  const invalidParamResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/not-a-campaign-id/solo-turn",
    headers: {
      cookie
    },
    payload: {
      message: "I step closer."
    }
  });

  assert.equal(invalidParamResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(invalidParamResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const requests = [
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      headers: {
        cookie
      },
      payload: {
        message: "   "
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/ask-dm`,
      headers: {
        cookie
      },
      payload: {
        question: "   "
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/regenerate`,
      headers: {
        cookie
      },
      payload: {
        messageId: "   "
      }
    }),
    app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/debug-traces?limit=0`,
      headers: {
        cookie
      }
    })
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.statusCode, 400);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "BAD_REQUEST"
    );
  }
});

test("DM runtime routes forbid signed-in users without campaign access", async () => {
  const ownerCookie = await signIn("dm-runtime-private-owner@example.com");
  const otherCookie = await signIn("dm-runtime-private-other@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "dark_fantasy",
      ownerClientId: "dm-runtime-private-owner-client",
      playerName: "Owner",
      characterName: "Vale"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const response = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/ask-dm`,
    headers: {
      cookie: otherCookie
    },
    payload: {
      question: "What is happening here?"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "FORBIDDEN"
  );
});

test("DM runtime routes return not found for missing campaigns", async () => {
  const cookie = await signIn("dm-runtime-missing@example.com");
  const campaignId = "00000000-0000-4000-8000-000000000097";
  const requests = [
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      headers: {
        cookie
      },
      payload: {
        message: "I step closer."
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/ask-dm`,
      headers: {
        cookie
      },
      payload: {
        question: "What can I see?"
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/regenerate`,
      headers: {
        cookie
      },
      payload: {
        messageId: "dm-message-1"
      }
    }),
    app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/debug-traces`,
      headers: {
        cookie
      }
    })
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.statusCode, 404);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "NOT_FOUND"
    );
  }
});

test("DM runtime routes forbid every route for users without campaign access", async () => {
  const { cookie: ownerCookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-forbidden-owner"
  );
  const otherCookie = await signIn("dm-runtime-forbidden-other@example.com");
  const soloResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie: ownerCookie
    },
    payload: {
      message: "I create a latest DM response."
    }
  });

  assert.equal(soloResponse.statusCode, 200, soloResponse.body);

  const latestDmMessage = CampaignSoloTurnResponseSchema.parse(soloResponse.json())
    .messages
    .filter((message) => message.role === "dm")
    .at(-1);
  assert.ok(latestDmMessage);

  const requests = [
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      headers: {
        cookie: otherCookie
      },
      payload: {
        message: "I should not be here."
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/regenerate`,
      headers: {
        cookie: otherCookie
      },
      payload: {
        messageId: latestDmMessage.id
      }
    }),
    app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/debug-traces`,
      headers: {
        cookie: otherCookie
      }
    })
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.statusCode, 403);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "FORBIDDEN"
    );
  }
});

test("DM runtime routes reject bad-state solo turns and regenerations", async () => {
  const ownerCookie = await signIn("dm-runtime-bad-state-owner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "dm-runtime-bad-state-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const soloInMultiplayerResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: {
      cookie: ownerCookie
    },
    payload: {
      message: "I try to act alone."
    }
  });

  assert.equal(soloInMultiplayerResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(soloInMultiplayerResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-regenerate-conflict"
  );
  const regenerateResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/regenerate`,
    headers: {
      cookie
    },
    payload: {
      messageId: "not-the-latest-dm-message"
    }
  });

  assert.equal(regenerateResponse.statusCode, 409);
  assert.equal(
    ApiErrorResponseSchema.parse(regenerateResponse.json()).error.code,
    "BAD_REQUEST"
  );
});

test("DM runtime solo turns accept roll submissions without a message", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-roll-submission"
  );
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    pendingRollRequests: [
      {
        id: "seren-check",
        player: "Seren",
        dice: "1d20",
        label: "Perception check"
      }
    ]
  };

  const response = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      rollSubmissions: [
        {
          rollRequestId: "seren-check",
          rollResult: {
            rolls: [18],
            total: 18
          },
          clientMessageId: "solo-roll-client-message"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200, response.body);
  CampaignSoloTurnResponseSchema.parse(response.json());
  assert.match(
    database.submissions.find(
      (submission) => submission.campaign_id === campaignId
    )?.content ?? "",
    /I rolled 1d20: 18 \(18\) for Perception check\./
  );
});

test("DM runtime memory updater creates and updates NPC context cards", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-npc-context"
  );

  const firstResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I speak with Marra Vell near Pier 6.",
      clientMessageId: "npc-context-first-turn"
    }
  });

  assert.equal(firstResponse.statusCode, 200, firstResponse.body);
  CampaignSoloTurnResponseSchema.parse(firstResponse.json());

  const createdChunk = database.contextChunks.find(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "npc:marra-vell"
  );

  assert.ok(createdChunk);
  assert.equal(createdChunk.category, "npc_context");
  assert.equal(createdChunk.visibility, "player_safe");
  assert.match(createdChunk.body_markdown, /## Motivations/);
  assert.match(createdChunk.body_markdown, /Wary but interested/);

  const secondResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I find Marra Vell at the Harbor Watch station.",
      clientMessageId: "npc-context-second-turn"
    }
  });

  assert.equal(secondResponse.statusCode, 200, secondResponse.body);
  const secondTurn = CampaignSoloTurnResponseSchema.parse(secondResponse.json());
  const secondTurnDebug = secondTurn.messages.at(-1)?.debug as
    | DebugFields
    | undefined;
  const secondTurnRouterDebug = secondTurnDebug?.router as
    | {
        requestMessages?: { role?: string; content?: string }[];
      }
    | undefined;
  const secondTurnRouterMessage =
    secondTurnRouterDebug?.requestMessages?.at(-1)?.content ?? "";

  assert.match(secondTurnRouterMessage, /Available context chunk keys JSON:/);
  assert.match(secondTurnRouterMessage, /"key": "npc:marra-vell"/);

  const marraChunks = database.contextChunks.filter(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "npc:marra-vell"
  );

  assert.equal(marraChunks.length, 1);
  assert.match(marraChunks[0]?.body_markdown ?? "", /Harbor Watch station/);
  assert.match(
    marraChunks[0]?.body_markdown ?? "",
    /more willing to talk after the party found her again/
  );

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${campaignId}/debug-traces?limit=20`,
    headers: {
      cookie
    }
  });

  assert.equal(tracesResponse.statusCode, 200, tracesResponse.body);
  const traces = CampaignDebugTracesResponseSchema.parse(tracesResponse.json());
  const storageTrace = traces.traces.find(
    (trace) => trace.phase === "context_storage_state_snapshot"
  );
  const contextChunks = storageTrace?.contextChunks as
    | {
        context_id?: unknown;
        category?: unknown;
        body_markdown?: unknown;
      }[]
    | undefined;

  assert.ok(storageTrace);
  assert.equal(storageTrace.contextChunkCount, 1);
  assert.ok(
    contextChunks?.some(
      (chunk) =>
        chunk.context_id === "npc:marra-vell" &&
        chunk.category === "npc_context" &&
        typeof chunk.body_markdown === "string" &&
        /Harbor Watch station/.test(chunk.body_markdown)
    )
  );

  const resolvedDmEventPayload = database.campaignEvents
    .filter(
      (event) =>
        event.campaign_id === campaignId && event.type === "turn_resolved"
    )
    .at(-1)?.payload as
    | {
        aiDebug?: DebugFields;
      }
    | undefined;
  const debugContextStorage =
    resolvedDmEventPayload?.aiDebug?.contextStorageState as
      | {
          contextChunkCount?: unknown;
          contextChunks?: {
            context_id?: unknown;
            body_markdown?: unknown;
          }[];
        }
      | undefined;

  assert.equal(debugContextStorage?.contextChunkCount, 1);
  assert.ok(
    debugContextStorage?.contextChunks?.some(
      (chunk) =>
        chunk.context_id === "npc:marra-vell" &&
        typeof chunk.body_markdown === "string" &&
        /Harbor Watch station/.test(chunk.body_markdown)
    )
  );
});

test("living world engine updates chunks and injects current DM guidance", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "living-world-pressure"
  );

  database.contextChunks.push({
    campaign_id: campaignId,
    context_key: "thread:lysa-trail",
    category: "quests_open_threads",
    title: "Lysa's Trail",
    visibility: "player_safe",
    priority: 5,
    body_markdown:
      "# Lysa's Trail\n\n## Current Situation\nSeren is looking for Lysa after her trail went quiet.",
    archived_at: null,
    updated_at: new Date()
  });

  for (let index = 0; index < 10; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      headers: {
        cookie
      },
      payload: {
        message: `I ask around town about Lysa's trail, step ${index + 1}.`,
        clientMessageId: `living-world-turn-${index + 1}`
      }
    });

    assert.equal(response.statusCode, 200, response.body);
  }

  await waitForCondition(
    () => database.livingWorldEngineRuns.length > 0,
    "living world engine did not run"
  );

  assert.equal(database.livingWorldEngineRuns.length, 1);
  assert.equal(database.livingWorldEngineRuns[0]?.covered_message_count, 21);
  const pressureDebug = database.campaignEvents
    .map((event) => {
      const payload = event.payload as
        | {
            aiDebug?: DebugFields;
          }
        | undefined;
      return payload?.aiDebug?.livingWorldPressureEngine as
        | Record<string, unknown>
        | undefined;
    })
    .find(Boolean);
  assert.ok(pressureDebug);
  assert.equal(pressureDebug.coveredMessageCount, 21);
  assert.match(String(pressureDebug.rawResponse ?? ""), /world_clock_updates/);
  assert.match(
    JSON.stringify(pressureDebug.parsedOutput ?? {}),
    /Accord surveyors arrive/
  );
  assert.match(
    database.contextChunks.find(
      (chunk) =>
        chunk.campaign_id === campaignId &&
        chunk.context_key === "thread:lysa-trail"
    )?.body_markdown ?? "",
    /Claim-Stake Accord has begun asking/
  );
  assert.match(
    String(
      database.campaignDmGuidance.find(
        (guidance) => guidance.campaign_id === campaignId
      )?.guidance.current_direction ?? ""
    ),
    /Claim-Stake Accord is getting closer/
  );

  resetProviderInputs();

  const guidedResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I check whether anyone else has been asking about Lysa.",
      clientMessageId: "living-world-guided-turn"
    }
  });

  assert.equal(guidedResponse.statusCode, 200, guidedResponse.body);
  CampaignSoloTurnResponseSchema.parse(guidedResponse.json());

  const mainProviderInput = getProviderInputs().find((input) =>
    input.message.includes("Current campaign DM guidance:")
  );

  assert.ok(mainProviderInput);
  assert.match(
    mainProviderInput.instructions,
    /Use this as short-lived direction/
  );
  assert.match(
    mainProviderInput.message,
    /Claim-Stake Accord is getting closer/
  );
});

test("DM runtime memory updater preserves visibility for world story chunks", async () => {
  const { cookie, campaignId } = await createSinglePlayerCampaign(
    "dm-runtime-world-context"
  );

  const response = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I touch the amber sphere in the grove's root chamber.",
      clientMessageId: "world-context-first-turn"
    }
  });

  assert.equal(response.statusCode, 200, response.body);
  CampaignSoloTurnResponseSchema.parse(response.json());

  const amberChunk = database.contextChunks.find(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "world:amber-sphere"
  );
  const amberThread = database.contextChunks.find(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "thread:the-amber-sphere"
  );
  const groveSecret = database.contextChunks.find(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "secret:the-groves-heart"
  );

  assert.ok(amberChunk);
  assert.equal(amberChunk.category, "relevant_world_context");
  assert.equal(amberChunk.visibility, "player_safe");
  assert.match(amberChunk.body_markdown, /## Strong Inferences/);
  assert.match(amberChunk.body_markdown, /## DM Seeds/);

  assert.ok(amberThread);
  assert.equal(amberThread.category, "quests_open_threads");
  assert.equal(amberThread.visibility, "player_safe");
  assert.match(amberThread.body_markdown, /## Current Situation/);

  assert.ok(groveSecret);
  assert.equal(groveSecret.category, "overarching_big_plot_secrets");
  assert.equal(groveSecret.visibility, "dm_only");
  assert.match(groveSecret.body_markdown, /## Hidden Truth/);

  const secondResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${campaignId}/solo-turn`,
    headers: {
      cookie
    },
    payload: {
      message: "I study the amber sphere again and watch the roots.",
      clientMessageId: "world-context-second-turn"
    }
  });

  assert.equal(secondResponse.statusCode, 200, secondResponse.body);
  const secondTurn = CampaignSoloTurnResponseSchema.parse(secondResponse.json());
  const secondTurnDebug = secondTurn.messages.at(-1)?.debug as
    | DebugFields
    | undefined;
  const routerMessage =
    (
      secondTurnDebug?.router as
        | { requestMessages?: { role?: string; content?: string }[] }
        | undefined
    )?.requestMessages?.at(-1)?.content ?? "";

  assert.match(routerMessage, /Available context chunk keys JSON:/);
  assert.match(routerMessage, /"key": "world:amber-sphere"/);
  assert.match(routerMessage, /"key": "thread:the-amber-sphere"/);
  assert.match(routerMessage, /"key": "secret:the-groves-heart"/);

  const amberChunks = database.contextChunks.filter(
    (chunk) =>
      chunk.campaign_id === campaignId &&
      chunk.context_key === "world:amber-sphere"
  );

  assert.equal(amberChunks.length, 1);
  assert.equal(amberChunks[0]?.visibility, "player_safe");
  assert.match(amberChunks[0]?.body_markdown ?? "", /Updated after/);
});

test("DM runtime routes require an owned session", async () => {
  const campaignId = "00000000-0000-4000-8000-000000000001";
  const requests = [
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/solo-turn`,
      payload: {
        message: "I step closer."
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/ask-dm`,
      payload: {
        question: "What can I see?"
      }
    }),
    app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/regenerate`,
      payload: {
        messageId: "dm-message-1"
      }
    }),
    app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/debug-traces`
    })
  ];

  for (const response of await Promise.all(requests)) {
    assert.equal(response.statusCode, 401);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "UNAUTHORIZED"
    );
  }
});
