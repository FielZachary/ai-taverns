import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  HermesTurnResponseSchema
} from "@ai-dnd/contracts";

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

test("Hermes compatibility routes require an owned session", async () => {
  const requests = [
    app.inject({
      method: "POST",
      url: "/api/hermes",
      payload: {
        message: "I test the compatibility bridge."
      }
    }),
    app.inject({
      method: "POST",
      url: "/api/hermes/opening",
      payload: {}
    }),
    app.inject({
      method: "POST",
      url: "/api/hermes/prep",
      payload: {}
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

test("Hermes compatibility routes reject incomplete or invalid payloads", async () => {
  const cookie = await signIn("hermes-validation@example.com");
  const requests = [
    app.inject({
      method: "POST",
      url: "/api/hermes",
      headers: {
        cookie
      },
      payload: {
        message: "   "
      }
    }),
    app.inject({
      method: "POST",
      url: "/api/hermes",
      headers: {
        cookie
      },
      payload: {
        message: "I bring invalid history.",
        history: [
          {
            id: "legacy-message",
            role: "player",
            content: "Missing createdAt."
          }
        ]
      }
    }),
    app.inject({
      method: "POST",
      url: "/api/hermes/opening",
      headers: {
        cookie
      },
      payload: {
        sessionId: 123
      }
    }),
    app.inject({
      method: "POST",
      url: "/api/hermes/prep",
      headers: {
        cookie
      },
      payload: {
        ownerClientId: 7
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

test("Hermes opening and prep support legacy defaults", async () => {
  const cookie = await signIn("hermes-defaults@example.com");
  const openingResponse = await app.inject({
    method: "POST",
    url: "/api/hermes/opening",
    headers: {
      cookie
    },
    payload: {}
  });

  assert.equal(openingResponse.statusCode, 200, openingResponse.body);
  assert.equal(
    HermesTurnResponseSchema.parse(openingResponse.json()).message.role,
    "dm"
  );

  const prepResponse = await app.inject({
    method: "POST",
    url: "/api/hermes/prep",
    headers: {
      cookie
    },
    payload: {
      sessionId: "   ",
      ownerClientId: "   "
    }
  });

  assert.equal(prepResponse.statusCode, 200, prepResponse.body);
  assert.equal(
    HermesTurnResponseSchema.parse(prepResponse.json()).message.role,
    "dm"
  );
  assert.ok(
    database.campaigns.some(
      (campaign) =>
        campaign.hermes_session_id === "new-adventure" &&
        campaign.owner_client_id === null
    )
  );
});
