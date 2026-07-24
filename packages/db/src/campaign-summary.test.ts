import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCampaignSummaryRow, type CampaignRow } from "./index.js";

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
    metadata: {},
    created_at: new Date("2026-07-24T00:00:00.000Z"),
    updated_at: new Date("2026-07-24T00:00:00.000Z")
  } satisfies Omit<CampaignRow, "session_id"> & { sessionId: string });

  assert.equal(summary.sessionId, "ai-dnd-session-1");
  assert.equal(summary.ownerClientId, "client-1");
});
