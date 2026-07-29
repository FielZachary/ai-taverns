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
      pressureToSurface: ["Dust storm"],
      softMoves: ["Show stinging dust"],
      hardMovesIfEarned: ["A path is buried"],
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
