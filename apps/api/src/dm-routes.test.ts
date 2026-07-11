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

import { app, signIn, type DebugFields } from "./test/app-test-harness.js";

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
  assert.equal(solo.isResolving, false);

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
  const ask = CampaignAskDmResponseSchema.parse(askResponse.json());
  assert.equal(ask.messages.at(-1)?.role, "dm");

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

  const tracesResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}/debug-traces?limit=10`,
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

