import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AuthClaimGuestStateRequestSchema,
  AuthClaimGuestStateResponseSchema,
  AuthMeResponseSchema,
  AuthPasswordlessStartRequestSchema,
  AuthPasswordlessStartResponseSchema,
  AuthPasswordlessVerifyRequestSchema,
  AuthProtectedResponseSchema,
  AuthSignOutResponseSchema,
  CampaignCreateRequestSchema,
  CampaignAskDmRequestSchema,
  CampaignAskDmResponseSchema,
  CampaignDebugTracesQuerySchema,
  CampaignDebugTracesResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignListResponseSchema,
  CampaignReadParamsSchema,
  CampaignReadResponseSchema,
  CampaignRegenerateRequestSchema,
  CampaignSoloTurnRequestSchema,
  CampaignSoloTurnResponseSchema,
  HealthResponseSchema,
  HermesPrepRequestSchema,
  HermesTurnRequestSchema,
  HermesTurnResponseSchema,
  RoomPlayerUpdateRequestSchema,
  RoomSnapshotSchema,
  RoomSubmitRequestSchema
} from "./index.js";

test("health contract accepts the API health response", () => {
  const parsed = HealthResponseSchema.parse({
    status: "ok",
    service: "api",
    timestamp: "2026-07-05T00:00:00.000Z"
  });

  assert.equal(parsed.status, "ok");
});

test("health contract rejects invalid response shapes", () => {
  assert.throws(() =>
    HealthResponseSchema.parse({
      status: "healthy",
      service: "api",
      timestamp: "not-a-date"
    })
  );
});

test("auth/me contract accepts unauthenticated state", () => {
  const parsed = AuthMeResponseSchema.parse({
    authenticated: false,
    user: null,
    session: null
  });

  assert.equal(parsed.authenticated, false);
});

test("auth/me contract accepts authenticated state", () => {
  const parsed = AuthMeResponseSchema.parse({
    authenticated: true,
    user: {
      id: "user_123",
      email: "player@example.com",
      displayName: "Player"
    },
    session: {
      id: "session_123",
      expiresAt: "2026-07-05T00:00:00.000Z"
    }
  });

  assert.equal(parsed.authenticated, true);
});

test("auth/me contract rejects invalid authenticated users", () => {
  assert.throws(() =>
    AuthMeResponseSchema.parse({
      authenticated: true,
      user: {
        id: "user_123",
        email: "not-an-email",
        displayName: "Player"
      },
      session: {
        id: "session_123",
        expiresAt: "2026-07-05T00:00:00.000Z"
      }
    })
  );
});

test("passwordless start contract normalizes email input", () => {
  const parsed = AuthPasswordlessStartRequestSchema.parse({
    email: " PLAYER@Example.COM ",
    displayName: "Player"
  });

  assert.equal(parsed.email, "player@example.com");
});

test("passwordless start response can include a local login token", () => {
  const parsed = AuthPasswordlessStartResponseSchema.parse({
    ok: true,
    expiresAt: "2026-07-05T00:00:00.000Z",
    loginToken: "a".repeat(32)
  });

  assert.equal(parsed.ok, true);
});

test("passwordless verify rejects short tokens", () => {
  assert.throws(() =>
    AuthPasswordlessVerifyRequestSchema.parse({
      token: "too-short"
    })
  );
});

test("sign out and protected endpoint contracts accept success responses", () => {
  assert.deepEqual(AuthSignOutResponseSchema.parse({ ok: true }), {
    ok: true
  });

  const protectedResponse = AuthProtectedResponseSchema.parse({
    ok: true,
    user: {
      id: "user_123",
      email: "player@example.com",
      displayName: null
    }
  });

  assert.equal(protectedResponse.user.email, "player@example.com");
});

test("claim guest state contract accepts claim counts", () => {
  const request = AuthClaimGuestStateRequestSchema.parse({
    clientId: " guest-client-1 "
  });
  const response = AuthClaimGuestStateResponseSchema.parse({
    claimedCampaigns: 1,
    claimedPlayers: 2
  });

  assert.equal(request.clientId, "guest-client-1");
  assert.equal(response.claimedPlayers, 2);
});

test("error envelope contract rejects unknown error codes", () => {
  assert.throws(() =>
    ApiErrorResponseSchema.parse({
      error: {
        code: "TEAPOT",
        message: "Unknown"
      }
    })
  );
});

test("campaign contracts accept list, create, and join preview payloads", () => {
  const createRequest = CampaignCreateRequestSchema.parse({
    mode: "multiplayer",
    campaignGenreKind: "preset",
    campaignGenrePresetId: "classic_fantasy",
    ownerClientId: "client-1"
  });

  assert.equal(createRequest.mode, "multiplayer");

  const listResponse = CampaignListResponseSchema.parse({
    campaigns: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        hermesSessionId: "ai-dnd-session",
        mode: "multiplayer",
        title: "Table Owner",
        preview: "Classic Fantasy",
        messageCount: 0,
        joinCode: "ABC234"
      }
    ]
  });

  assert.equal(listResponse.campaigns[0]?.joinCode, "ABC234");

  const readParams = CampaignReadParamsSchema.parse({
    campaignId: "00000000-0000-4000-8000-000000000001"
  });
  const readResponse = CampaignReadResponseSchema.parse({
    campaign: listResponse.campaigns[0]
  });

  assert.equal(readParams.campaignId, readResponse.campaign.id);

  const preview = CampaignJoinPreviewResponseSchema.parse({
    code: "ABC234",
    campaignTitle: "Table Owner",
    availableSlots: 3,
    hasBegun: false
  });

  assert.equal(preview.availableSlots, 3);
});

test("room contracts accept snapshots and mutation payloads", () => {
  const profile = RoomPlayerUpdateRequestSchema.parse({
    roomId: "00000000-0000-4000-8000-000000000001",
    sessionId: "ai-dnd-session",
    playerId: "client-1",
    username: "Player",
    characterName: "Stone",
    characterSheet: "Fighter"
  });

  assert.equal(profile.characterName, "Stone");

  const submit = RoomSubmitRequestSchema.parse({
    roomId: profile.roomId,
    playerId: profile.playerId,
    message: "I check the old door."
  });

  assert.equal(submit.message, "I check the old door.");

  const snapshot = RoomSnapshotSchema.parse({
    roomId: "00000000-0000-4000-8000-000000000001",
    mode: "multiplayer",
    sessionId: "ai-dnd-session",
    players: [
      {
        id: "client-1",
        slot: 0,
        username: "Player",
        characterName: "Stone",
        characterSheet: "Fighter",
        status: "waiting",
        lastSeenAt: "2026-07-05T00:00:00.000Z"
      }
    ],
    messages: [],
    isResolving: false,
    hasBegun: true,
    pendingRollRequest: null,
    pendingRollRequests: [],
    inputTargets: [],
    inputPolicy: "all_players",
    updatedAt: "2026-07-05T00:00:00.000Z"
  });

  assert.equal(snapshot.players[0]?.status, "waiting");
});

test("DM route contracts accept solo, ask-DM, regenerate, and traces payloads", () => {
  const solo = CampaignSoloTurnRequestSchema.parse({
    message: "I listen at the cellar door.",
    clientMessageId: "client-message-1"
  });

  assert.equal(solo.message, "I listen at the cellar door.");

  const askDm = CampaignAskDmRequestSchema.parse({
    question: "Do I know what this symbol means?"
  });

  assert.equal(askDm.question, "Do I know what this symbol means?");

  const regenerate = CampaignRegenerateRequestSchema.parse({
    messageId: "dm-message-1"
  });

  assert.equal(regenerate.messageId, "dm-message-1");

  const query = CampaignDebugTracesQuerySchema.parse({
    traceId: "trace-1",
    limit: "5"
  });

  assert.equal(query.limit, 5);

  const snapshot = RoomSnapshotSchema.parse({
    roomId: "00000000-0000-4000-8000-000000000001",
    mode: "single_player",
    sessionId: "ai-dnd-session",
    players: [],
    messages: [],
    isResolving: false,
    hasBegun: true,
    pendingRollRequest: null,
    pendingRollRequests: [],
    inputTargets: [],
    inputPolicy: "all_players",
    updatedAt: "2026-07-05T00:00:00.000Z"
  });

  assert.doesNotThrow(() => CampaignSoloTurnResponseSchema.parse(snapshot));
  assert.doesNotThrow(() => CampaignAskDmResponseSchema.parse(snapshot));
  assert.doesNotThrow(() =>
    CampaignDebugTracesResponseSchema.parse({
      traces: [
        {
          id: "trace-event-1",
          createdAt: "2026-07-05T00:00:00.000Z",
          traceId: "trace-1",
          phase: "dm_turn_started"
        }
      ]
    })
  );
});

test("Hermes compatibility contracts accept turn and prep payloads", () => {
  const request = HermesTurnRequestSchema.parse({
    message: "I open the old gate.",
    history: [
      {
        id: "message-1",
        role: "player",
        content: "I approach the gate.",
        createdAt: "2026-07-05T00:00:00.000Z"
      }
    ],
    sessionId: "ai-dnd-session"
  });
  const prep = HermesPrepRequestSchema.parse({
    sessionId: "ai-dnd-session",
    ownerClientId: "client-1"
  });
  const response = HermesTurnResponseSchema.parse({
    message: {
      id: "dm-message-1",
      role: "dm",
      content: "The old gate groans open.",
      createdAt: "2026-07-05T00:00:00.000Z"
    },
    pendingRollRequest: null,
    pendingRollRequests: [],
    inputTargets: [],
    inputPolicy: "all_players"
  });

  assert.equal(request.history?.[0]?.role, "player");
  assert.equal(prep.ownerClientId, "client-1");
  assert.equal(response.message.role, "dm");
});
