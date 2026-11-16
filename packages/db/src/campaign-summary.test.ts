import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campaignTimestampFromNarrations,
  formatCampaignSummaryTimestamp,
  formatNarratorHistoryReference,
  mapCampaignSummaryRow,
  narratorModelForJob,
  narratorTimestampGuidance,
  previousNarrationTimestamp,
  timestampFromNarration,
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

test("normal-play timestamps carry forward a valid prior narration timestamp", () => {
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
  assert.match(guidance, /TIME IN SUMMARY HISTORY:/);
  assert.match(guidance, /not the real-world database timestamp/i);
  assert.match(guidance, /summary timestamps support that claim/i);
});

test("campaign timestamps skip non-narration content and normalize legacy brackets", () => {
  assert.equal(
    campaignTimestampFromNarrations([
      "Remember, you are not advancing your turn here.",
      "[Morning] — 11:48 AM\n\nThe guard waits by the gate.",
    ]),
    "Morning — 11:48 AM",
  );
  assert.equal(
    campaignTimestampFromNarrations([
      "No timestamp on this resolved narration.",
      "Night — 9:05 PM\n\nOrin chuckles into his tankard.",
    ]),
    "Night — 9:05 PM",
  );
  assert.equal(campaignTimestampFromNarrations([]), "Morning — 8:00 AM");
  assert.equal(timestampFromNarration("[mid-day] — 12:03 pm"), "Mid-Day — 12:03 PM");
  assert.equal(timestampFromNarration("Remember, this is clarification."), null);
});

test("compressed summary timestamps use the plain-text time suffix", () => {
  assert.equal(
    formatCampaignSummaryTimestamp("Afternoon — 3:18 PM"),
    " Time: [Afternoon] — 3:18 PM",
  );
  assert.equal(formatCampaignSummaryTimestamp(), "");
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

test("combat narration always uses Qwen 3.7 Plus after routing", () => {
  assert.equal(
    narratorModelForJob({
      jobNeeded: "combat",
      selectedModel: "deepseek-v4-flash",
    }),
    "qwen-3-7-plus",
  );
  assert.equal(
    narratorModelForJob({
      jobNeeded: "combat",
      selectedModel: "qwen-3-5-plus",
    }),
    "qwen-3-7-plus",
  );
  assert.equal(
    narratorModelForJob({
      jobNeeded: "npc_dialogue",
      selectedModel: "qwen-3-5-plus",
    }),
    "qwen-3-5-plus",
  );
});
