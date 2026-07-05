import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AuthMeResponseSchema,
  AuthPasswordlessStartRequestSchema,
  AuthPasswordlessStartResponseSchema,
  AuthPasswordlessVerifyRequestSchema,
  AuthProtectedResponseSchema,
  AuthSignOutResponseSchema,
  CampaignCreateRequestSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignListResponseSchema,
  CampaignReadParamsSchema,
  CampaignReadResponseSchema,
  HealthResponseSchema
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
