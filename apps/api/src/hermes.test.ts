import assert from "node:assert/strict";
import { test } from "node:test";
import { HermesTurnResponseSchema } from "@ai-dnd/contracts";

import { app, database, signIn } from "./test/app-test-harness.js";

test("Hermes compatibility provider routes are owned by Fastify", async () => {
  const cookie = await signIn("hermes-compat@example.com");
  const turnResponse = await app.inject({
    method: "POST",
    url: "/api/hermes",
    headers: {
      cookie
    },
    payload: {
      message: "I test the compatibility bridge.",
      history: []
    }
  });

  assert.equal(turnResponse.statusCode, 200, turnResponse.body);
  const turn = HermesTurnResponseSchema.parse(turnResponse.json());
  assert.equal(turn.message.role, "dm");
  assert.equal(turn.pendingRollRequests?.length, 0);

  const prepResponse = await app.inject({
    method: "POST",
    url: "/api/hermes/prep",
    headers: {
      cookie
    },
    payload: {
      sessionId: "ai-dnd-legacy-session",
      ownerClientId: "legacy-client"
    }
  });

  assert.equal(prepResponse.statusCode, 200, prepResponse.body);
  assert.equal(
    HermesTurnResponseSchema.parse(prepResponse.json()).message.role,
    "dm"
  );
  assert.ok(
    database.campaigns.some(
      (campaign) => campaign.hermes_session_id === "ai-dnd-legacy-session"
    )
  );
});

