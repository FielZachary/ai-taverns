import assert from "node:assert/strict";
import { test } from "node:test";
import type { Queryable, CampaignRow } from "./index.js";
import { __dbTestInternals } from "./index.js";

type QueryRecord = {
  sql: string;
  values: unknown[];
};

function fakeDb(
  handler: (sql: string, values: unknown[]) => { rows: unknown[] }
): Queryable & { queries: QueryRecord[] } {
  const queries: QueryRecord[] = [];

  const db = {
    queries,
    async query(sql: unknown, values: unknown[] = []) {
      assert.equal(typeof sql, "string");
      const sqlText = sql as string;
      queries.push({ sql: sqlText, values });
      return handler(sqlText, values);
    }
  };

  return db as unknown as Queryable & { queries: QueryRecord[] };
}

test("living world cadence ignores failed and in-progress coverage rows", async () => {
  const db = fakeDb((sql) => {
    assert.match(sql, /coalesce\(payload->>'failed'/);
    assert.match(sql, /coalesce\(payload->>'status'/);
    return { rows: [{ covered_message_count: 49 }] };
  });

  const count =
    await __dbTestInternals.getLatestLivingWorldCoveredMessageCount(
      db,
      "campaign-1"
    );

  assert.equal(count, 49);
});

test("accepted memory patch SQL casts markdown text parameters", async () => {
  const appended = fakeDb(() => ({ rows: [] }));
  await __dbTestInternals.applyAcceptedMemoryPatch(appended, "campaign-1", {
    operation: "append",
    context_id: "thread:storm",
    markdown: "## Offscreen Movement\n- The storm closes in."
  });

  assert.match(appended.queries[0]?.sql ?? "", /\$3::text/);
  assert.deepEqual(appended.queries[0]?.values, [
    "campaign-1",
    "thread:storm",
    "## Offscreen Movement\n- The storm closes in."
  ]);

  const replaced = fakeDb(() => ({ rows: [] }));
  await __dbTestInternals.applyAcceptedMemoryPatch(replaced, "campaign-1", {
    operation: "replace_section",
    context_id: "thread:storm",
    markdown: "# Storm\n\nUpdated."
  });

  assert.match(replaced.queries[0]?.sql ?? "", /\$3::text/);
  assert.deepEqual(replaced.queries[0]?.values, [
    "campaign-1",
    "thread:storm",
    "# Storm\n\nUpdated."
  ]);

  const renamed = fakeDb(() => ({ rows: [] }));
  await __dbTestInternals.applyAcceptedMemoryPatch(renamed, "campaign-1", {
    operation: "rename_chunk",
    context_id: "npc:cloaked-figure-at-the-tower",
    new_context_id: "npc:veria",
    title: "Veria",
    markdown: "# Veria\n\n## Name\nVeria"
  });

  assert.match(renamed.queries[0]?.sql ?? "", /set context_key = \$3/);
  assert.deepEqual(renamed.queries[0]?.values, [
    "campaign-1",
    "npc:cloaked-figure-at-the-tower",
    "npc:veria",
    "Veria",
    "# Veria\n\n## Name\nVeria"
  ]);

  const merged = fakeDb(() => ({ rows: [] }));
  await __dbTestInternals.applyAcceptedMemoryPatch(merged, "campaign-1", {
    operation: "merge_chunk",
    source_context_id: "npc:veria",
    target_context_id: "npc:cloaked-figure-at-the-tower",
    title: "Veria",
    markdown: "# Veria\n\n## Name\nVeria"
  });

  assert.match(merged.queries[0]?.sql ?? "", /set title = coalesce/);
  assert.match(merged.queries[1]?.sql ?? "", /set archived_at = now/);
  assert.deepEqual(merged.queries[0]?.values, [
    "campaign-1",
    "npc:cloaked-figure-at-the-tower",
    "Veria",
    "# Veria\n\n## Name\nVeria"
  ]);
  assert.deepEqual(merged.queries[1]?.values, ["campaign-1", "npc:veria"]);
});

test("foundation compiler prompt shares alias-aware NPC identity contract", () => {
  const prompt = __dbTestInternals.buildCampaignFoundationCompilerPrompt();

  assert.match(prompt, /rename_chunk/);
  assert.match(prompt, /merge_chunk/);
  assert.match(prompt, /Aliases \/ Former Labels/);
  assert.match(prompt, /instead of creating a second NPC card/i);
  assert.match(prompt, /complete person even when the player has not met them/i);
  assert.match(prompt, /Do not use Unknown merely because the player has not met the NPC/i);
  assert.match(prompt, /No player-specific disposition established/i);
  assert.match(prompt, /Do not create a stranger\/Unknown entry/i);
  assert.match(prompt, /varied cast/i);
});

test("router context index includes compact NPC identity preview", async () => {
  const db = fakeDb(() => ({
    rows: [
      {
        context_key: "npc:veria",
        category: "npc_context",
        title: "Veria",
        visibility: "player_safe",
        priority: 0,
        body_markdown:
          "# Veria\n\n## Name\nVeria\n\n## Aliases / Former Labels\n- Cloaked Figure at the Tower\n\n## Location\nTanners' quarter.\n\n## Personality\nPragmatic, cautious ally guiding Merlini away from Curia pursuit.",
        updated_at: "2026-08-06T12:43:28.951Z"
      },
      {
        context_key: "npc:verias-guide",
        category: "npc_context",
        title: "Veria's Guide",
        visibility: "player_safe",
        priority: 0,
        body_markdown:
          "# Veria's Guide\n\n## Name\nUnknown.\n\n## Aliases / Former Labels\nUnknown.\n\n## Location\nFled into the night.\n\n## Personality\nHesitant and cautious.",
        updated_at: "2026-08-06T12:36:08.496Z"
      }
    ]
  }));
  const index = await __dbTestInternals.listCampaignContextChunkIndex(
    db,
    "campaign-1"
  );
  const formatted = __dbTestInternals.formatContextChunkIndexForRouter(index);

  assert.match(formatted, /"identity"/);
  assert.match(formatted, /"aliases": \[\n\s+"Cloaked Figure at the Tower"/);
  assert.match(formatted, /Pragmatic, cautious ally/);
  assert.match(formatted, /Veria's Guide/);
  assert.match(formatted, /Hesitant and cautious/);
});

test("inventory update narration is formatted as an italic parenthetical", () => {
  assert.equal(
    __dbTestInternals.inventoryUpdateSentence([
      {
        type: "currency",
        currency: "CP",
        delta: -3
      },
      {
        type: "item",
        operation: "add",
        item: "brass token",
        quantity: 1
      }
    ]),
    "*(Inventory update: you spent 3 CP and gained a brass token.)*"
  );

  assert.equal(
    __dbTestInternals.narrationWithInventoryUpdate("The cup slides across.", [
      {
        type: "currency",
        currency: "CP",
        delta: -3
      }
    ]),
    "The cup slides across.\n\n*(Inventory update: you spent 3 CP.)*"
  );

  assert.equal(
    __dbTestInternals.narrationWithInventoryUpdate(
      "The cup slides across.\n\nInventory update: you spent 3 CP.",
      [
        {
          type: "currency",
          currency: "CP",
          delta: -3
        }
      ]
    ),
    "The cup slides across.\n\nInventory update: you spent 3 CP."
  );
});

test("inventory patch validation accepts compact actor keys and normalizes fields", () => {
  const player = {
    id: "player-1",
    client_id: "client-1"
  } as Parameters<typeof __dbTestInternals.validateInventoryPatches>[1][number];

  const validation = __dbTestInternals.validateInventoryPatches(
    [
      {
        actorKey: "client-1",
        type: "currency",
        currency: "GP",
        delta: "-2"
      },
      {
        actor_key: "player:client-1",
        type: "item",
        operation: "received",
        name: "brass key",
        quantity: "2"
      },
      {
        actor_key: "player:someone-else",
        type: "item",
        operation: "dance",
        item: ""
      }
    ],
    [player]
  );

  assert.deepEqual(validation.accepted, [
    {
      actorKey: "client-1",
      actor_key: "client-1",
      type: "currency",
      currency: "GP",
      delta: -2
    },
    {
      actor_key: "player:client-1",
      type: "item",
      operation: "add",
      name: "brass key",
      item: "brass key",
      quantity: 2
    }
  ]);
  assert.equal(validation.discarded.length, 1);
  assert.match(validation.discarded[0]?.reasons.join("\n") ?? "", /actor_key/);
  assert.match(validation.discarded[0]?.reasons.join("\n") ?? "", /operation/);
  assert.match(validation.discarded[0]?.reasons.join("\n") ?? "", /name/);
});

test("accepted inventory patches apply compact currency and item transitions", async () => {
  const updates: string[] = [];
  const db = fakeDb((_sql, values) => {
    updates.push(String(values[1]));
    return { rows: [] };
  });
  const player = {
    id: "player-1",
    campaign_id: "campaign-1",
    client_id: "client-1",
    user_id: null,
    username: "Pike",
    character_name: "Pike",
    character_sheet:
      "Core Stats\nLevel 1\n\nEquipment\nDagger\n\nInventory\nTorch x2\nRope\n\nCurrency\n5 GP",
    slot: 1,
    status: "ready",
    last_seen_at: new Date()
  } as unknown as Parameters<
    typeof __dbTestInternals.applyAcceptedInventoryPatches
  >[1][number];

  const applied = await __dbTestInternals.applyAcceptedInventoryPatches(
    db,
    [player],
    [
      {
        actor_key: "player:client-1",
        type: "currency",
        currency: "CP",
        delta: -3
      },
      {
        actor_key: "player:client-1",
        type: "item",
        operation: "add",
        item: "brass key",
        quantity: 1
      },
      {
        actor_key: "player:client-1",
        type: "item",
        operation: "equip",
        item: "brass key",
        quantity: 1
      },
      {
        actor_key: "player:client-1",
        type: "item",
        operation: "remove",
        item: "Torch",
        quantity: 1
      },
      {
        actor_key: "player:client-1",
        type: "item",
        operation: "remove",
        item: "silver crown",
        quantity: 1
      },
      {
        actor_key: "player:client-1",
        type: "currency",
        currency: "GP",
        delta: -99
      }
    ]
  );

  assert.equal(applied.length, 4);
  assert.equal(db.queries.length, 4);

  const finalSheet = updates.at(-1) ?? "";
  assert.match(finalSheet, /Currency\nGP: 4\nSP: 9\nCP: 7/);
  assert.match(finalSheet, /Inventory\nTorch\nRope/);
  assert.doesNotMatch(finalSheet, /Inventory[\s\S]*brass key/);
  assert.match(finalSheet, /Equipment\nDagger\nbrass key/);
});

test("living world prompt formatting includes guidance and cadence context", () => {
  const campaign = {
    id: "campaign-1",
    mode: "single_player",
    metadata: {
      campaignStart: {
        worldName: "Eldermere",
        genre: "anchored high fantasy",
        tone: "perilous and grounded",
        premise: "A storm chases the party toward a hidden hut.",
        openingScene: "The wind rises over the Wash.",
        startingLocation: "Wailing Wash",
        startingRegion: "Ashfell Marches",
        threats: ["Dusttrail riders"],
        factions: ["Curia"],
        secrets: ["The warden was murdered"]
      }
    }
  } as CampaignRow;

  const prompt = __dbTestInternals.formatLivingWorldPressureEngineRequest({
    campaign,
    currentGuidance: {
      currentDirection: "Push the storm pressure.",
      avoid: ["Do not force the hut"],
      updatedAt: "2026-07-29T00:00:00.000Z"
    },
    contextChunkIndex: {
      npc_context: [],
      player_character_context: [],
      combat_context: [],
      relevant_world_context: [
        {
          key: "world:wailing-wash",
          title: "Wailing Wash",
          visibility: "player_safe",
          priority: 5,
          updatedAt: "2026-07-29T00:00:00.000Z"
        }
      ],
      quests_open_threads: [],
      overarching_big_plot_secrets: []
    },
    contextChunks: [
      {
        id: "world:wailing-wash",
        category: "relevant_world_context",
        title: "Wailing Wash",
        visibility: "player_safe",
        priority: 5,
        bodyMarkdown: "# Wailing Wash\n\nA dry channel that floods fast."
      }
    ],
    recentMessages: [
      {
        id: "message-1",
        role: "player",
        content: "I press on.",
        createdAt: "2026-07-29T00:00:00.000Z"
      }
    ],
    currentMessageCount: 49,
    lastCoveredMessageCount: 21
  });

  assert.match(prompt, /Current DM guidance:/);
  assert.match(prompt, /Push the storm pressure/);
  assert.match(prompt, /world:wailing-wash/);
  assert.match(prompt, /current_message_count": 49/);
  assert.match(prompt, /last_covered_message_count": 21/);
});

test("completed beats form a bounded no-replay continuity guard", () => {
  const continuity = __dbTestInternals.formatCompletedBeatContinuity({
    turnId: "turn-1",
    summary: "Ciri drinks with Orin after the delivery.",
    completedBeats: [
      "Orin gave Ciri the east-tower referral using Hella's name.",
      "Orin offered Ciri a recommendation with his transport outfit."
    ],
    entityKeys: ["npc:orin-thal"],
    openThreadKeys: ["thread:east-tower-ridge-work"],
    certaintyNotes: [],
    tokenEstimate: 10,
    createdAt: "2026-11-05T00:00:00.000Z"
  });

  assert.match(continuity, /completed in the immediately preceding resolved turn/i);
  assert.match(continuity, /east-tower referral/);
  assert.match(continuity, /Do not repeat, paraphrase, expand, re-offer/i);
});

test("living world helpers normalize chunks and context storage debug state", () => {
  const patch = __dbTestInternals.normalizeNewContextChunkPatch({
    context_id: "clock:storm-approaching",
    context_type: "world_context",
    title: "Storm Approaching",
    visibility: "dm_only",
    priority: 7,
    content: {
      summary: "The storm will arrive before dawn.",
      pressure: ["Shelter matters"]
    }
  });

  assert.equal(patch.operation, "create_chunk");
  assert.equal(patch.context_id, "clock:storm-approaching");
  assert.equal(patch.context_type, "world_context");
  assert.equal(patch.visibility, "dm_only");
  assert.match(String(patch.markdown), /The storm will arrive before dawn/);

  const state = __dbTestInternals.campaignContextStorageDebugState([
    {
      context_id: "clock:storm-approaching",
      category: "relevant_world_context",
      title: "Storm Approaching",
      visibility: "dm_only",
      priority: 7,
      body_markdown: "# Storm\n\nPressure rises.",
      archived_at: null,
      created_at: "2026-07-29T00:00:00.000Z",
      updated_at: "2026-07-29T00:00:00.000Z"
    }
  ]);

  assert.equal(state.contextChunkCount, 1);
  assert.equal(state.contextChunks[0]?.context_id, "clock:storm-approaching");
});
