import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatNarratorHistoryReference,
  mapCampaignSummaryRow,
  narratorTimestampGuidance,
  previousNarrationTimestamp,
  usesNarratorHistoryReference,
} from "./index.js";

test("mapCampaignSummaryRow preserves an explicit camelCase session id alias", () => {
  const summary = mapCampaignSummaryRow({
    id: "00000000-0000-4000-8000-000000000001",
    sessionId: "ai-dnd-session-1",
    mode: "multiplayer",
    title: "The Lantern Table",
    status: "active",
    has_begun: false,
    owner_user_id: "00000000-0000-4000-8000-000000000002",
    owner_client_id: "client-1",
    current_user_player_id: "client-1",
    metadata: {},
    created_at: new Date("2026-07-24T00:00:00.000Z"),
    updated_at: new Date("2026-07-24T00:00:00.000Z")
  } satisfies Parameters<typeof mapCampaignSummaryRow>[0]);

  assert.equal(summary.sessionId, "ai-dnd-session-1");
  assert.equal(summary.ownerClientId, "client-1");
  assert.equal(summary.currentUserPlayerId, "client-1");
});

test("prose narrators receive no raw previous narration", () => {
  assert.equal(
    formatNarratorHistoryReference([
      {
        role: "dm",
        content: JSON.stringify({
          public_narration: "The warden lowers the portcullis.",
        }),
      },
    ]),
    [
      "Previous resolved turn — continuity only.",
      "Its meaning is represented by the compressed campaign history and completed-beat continuity below.",
      "Do not reconstruct, quote, or imitate the prior response's wording.",
    ].join("\n"),
  );
});

test("normal-play timestamps carry forward the first line of prior narration", () => {
  assert.equal(
    previousNarrationTimestamp([
      {
        role: "dm",
        content: "Night — 9:05 PM\n\nOrin chuckles into his tankard.",
      },
    ]),
    "Night — 9:05 PM",
  );
  assert.equal(previousNarrationTimestamp([]), "Morning — 8:00 AM");

  const guidance = narratorTimestampGuidance("Night — 9:05 PM");
  assert.match(guidance, /Current campaign timestamp:\nNight — 9:05 PM/);
  assert.match(guidance, /first non-empty line of every response/i);
  assert.match(guidance, /usually takes 1–2 minutes/i);
  assert.match(guidance, /fine morning/i);
});

test("every router-selected gameplay job uses narrator reference history", () => {
  for (const jobNeeded of [
    "scene_director",
    "npc_dialogue",
    "combat",
    "rest_mechanics",
    "death_saving_throws",
    "clarification",
  ] as const) {
    assert.equal(
      usesNarratorHistoryReference({ jobNeeded }),
      true,
      jobNeeded,
    );
  }

  assert.equal(
    usesNarratorHistoryReference({ providerResponseFormat: "text" }),
    true,
  );
  assert.equal(usesNarratorHistoryReference({}), false);
});
