import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AnalyticsEventSchema,
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
  CampaignRestartBackstoryRequestSchema,
  CampaignRestartRequestSchema,
  CampaignRestartResponseSchema,
  CampaignSoloTurnRequestSchema,
  CampaignSoloTurnResponseSchema,
  MechanicsStateSchema,
  MechanicsSeedSchema,
  HealthResponseSchema,
  DmProviderPrepRequestSchema,
  DmProviderTurnRequestSchema,
  DmProviderTurnResponseSchema,
  DiceRollRequestSchema,
  DmStreamEventSchema,
  RoomPlayerUpdateRequestSchema,
  RoomRealtimeEventSchema,
  RoomSocketEventSchema,
  RoomSnapshotSchema,
  RoomSubmitRequestSchema,
  entitlementForTier
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
      displayName: "Player",
      onboardingCompletedAt: null
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
        displayName: "Player",
        onboardingCompletedAt: null
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
    displayName: "Player",
    nextPath: "/play?campaign=abc"
  });

  assert.equal(parsed.email, "player@example.com");
  assert.equal(parsed.nextPath, "/play?campaign=abc");
  assert.throws(() =>
    AuthPasswordlessStartRequestSchema.parse({
      email: "player@example.com",
      nextPath: "//evil.example"
    })
  );
});

test("passwordless start response can include a local login token and url", () => {
  const parsed = AuthPasswordlessStartResponseSchema.parse({
    ok: true,
    expiresAt: "2026-07-05T00:00:00.000Z",
    loginToken: "a".repeat(32),
    loginUrl: "http://localhost:3000/auth/confirm?token=abc"
  });

  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.loginUrl,
    "http://localhost:3000/auth/confirm?token=abc"
  );
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
      displayName: null,
      onboardingCompletedAt: null
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
    ownerClientId: "client-1",
    eldermereStart: {
      regionName: "The Salt Concordat",
      settlementName: "Selwick",
      reason: "The generated backstory points at port trouble."
    }
  });

  assert.equal(createRequest.mode, "multiplayer");
  assert.equal(createRequest.eldermereStart?.settlementName, "Selwick");

  const listResponse = CampaignListResponseSchema.parse({
    campaigns: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        sessionId: "ai-dnd-session",
        mode: "multiplayer",
        title: "Table Owner",
        currentUserPlayerId: "client-1",
        preview: "Classic Fantasy",
        messageCount: 0,
        joinCode: "ABC234"
      }
    ]
  });

  assert.equal(listResponse.campaigns[0]?.joinCode, "ABC234");
  assert.equal(listResponse.campaigns[0]?.currentUserPlayerId, "client-1");

  const readParams = CampaignReadParamsSchema.parse({
    campaignId: "00000000-0000-4000-8000-000000000001"
  });
  const readResponse = CampaignReadResponseSchema.parse({
    campaign: listResponse.campaigns[0]
  });

  assert.equal(readParams.campaignId, readResponse.campaign.id);

  const restartBackstoryRequest = CampaignRestartBackstoryRequestSchema.parse({
    mode: "localize",
    currentBackstory: "Mira keeps a salt-stained promise."
  });
  const restartRequest = CampaignRestartRequestSchema.parse({
    backstory: "Mira keeps a sharper salt-stained promise."
  });
  const restartResponse = CampaignRestartResponseSchema.parse({
    campaign: {
      ...listResponse.campaigns[0]!,
      id: "00000000-0000-4000-8000-000000000002",
      mode: "single_player"
    }
  });

  assert.equal(restartBackstoryRequest.mode, "localize");
  assert.match(restartRequest.backstory, /sharper/);
  assert.equal(restartResponse.campaign.mode, "single_player");

  const preview = CampaignJoinPreviewResponseSchema.parse({
    code: "ABC234",
    campaignTitle: "Table Owner",
    availableSlots: 3,
    hasBegun: false
  });

  assert.equal(preview.availableSlots, 3);
});

test("mechanics seed contract accepts structured character mechanics", () => {
  const seed = MechanicsSeedSchema.parse({
    characterClass: "Sorcerer",
    level: 5,
    maxHp: 32,
    currentHp: 32,
    spellSlots: {
      "1": { max: 4, used: 0 },
      "2": { max: 3, used: 0 },
      "3": { max: 2, used: 0 }
    },
    resources: {
      sorcery_points: {
        label: "Sorcery Points",
        max: 5,
        used: 0,
        recharge: "long_rest",
        source: "Sorcerer"
      }
    }
  });

  assert.equal(seed.spellSlots?.["3"]?.max, 2);
  assert.equal(seed.resources?.sorcery_points?.max, 5);
  assert.throws(() =>
    MechanicsSeedSchema.parse({
      characterClass: "Sorcerer",
      level: 5,
      maxHp: 32,
      currentHp: 32,
      spellSlots: {
        cantrip: { max: 1, used: 0 }
      }
    })
  );
});

test("mechanics actor contract accepts canonical combat stats for NPCs", () => {
  const state = MechanicsStateSchema.parse({
    combat: {
      active: true,
      round: 1,
      turnOwner: "player:owner",
      initiativeOrder: ["player:owner", "npc:mara"]
    },
    actors: {
      "npc:mara": {
        characterName: "Mara",
        currentHp: 45,
        maxHp: 45,
        armorClass: 14,
        attackBonus: 5,
        damageFormula: "1d8 + 3",
        saveBonuses: {
          dex: 3,
          wis: -1
        },
        abilityModifiers: {
          str: 2,
          dex: 3
        },
        allegiance: "hostile",
        isPlayerControlled: false,
        conditions: []
      }
    }
  });

  const resourceState = MechanicsStateSchema.parse({
    combat: {
      active: false,
      round: 0,
      turnOwner: null,
      initiativeOrder: []
    },
    actors: {
      "player:monk": {
        characterName: "Tem",
        resources: {
          ki_points: {
            label: "Ki Points",
            max: 5,
            used: 2,
            recharge: "short_rest",
            source: "Monk"
          }
        }
      }
    }
  });

  assert.equal(state.actors["npc:mara"]?.armorClass, 14);
  assert.equal(state.actors["npc:mara"]?.attackBonus, 5);
  assert.equal(state.actors["npc:mara"]?.damageFormula, "1d8 + 3");
  assert.equal(state.actors["npc:mara"]?.saveBonuses?.dex, 3);
  assert.equal(state.actors["npc:mara"]?.saveBonuses?.wis, -1);
  assert.equal(state.actors["npc:mara"]?.allegiance, "hostile");
  assert.equal(state.actors["npc:mara"]?.isPlayerControlled, false);
  assert.equal(
    resourceState.actors["player:monk"]?.resources?.ki_points?.used,
    2
  );
});

test("dice roll contract accepts combat roll metadata", () => {
  const request = DiceRollRequestSchema.parse({
    id: "oktai-flurry-damage-2",
    dice: "1d4",
    label: "Flurry of Blows Damage",
    modifier: 2,
    player: "player:oktai",
    combat: {
      actionId: "oktai-round1-turn",
      actorKey: "player:oktai",
      targetActorKey: "npc:acolyte-1",
      kind: "damage_roll",
      sourceAttackRollId: "oktai-flurry-attack-2",
      damageType: "bludgeoning"
    }
  });

  assert.equal(request.combat?.targetActorKey, "npc:acolyte-1");
  assert.equal(request.combat?.kind, "damage_roll");
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
    message: "I check the old door.",
    skipTurn: true
  });

  assert.equal(submit.message, "I check the old door.");
  assert.equal(submit.skipTurn, true);

  const snapshot = RoomSnapshotSchema.parse({
    roomId: "00000000-0000-4000-8000-000000000001",
    mode: "multiplayer",
    sessionId: "ai-dnd-session",
    currentPlayerId: "client-1",
    players: [
      {
        id: "client-1",
        actorKey: "player:actor-1",
        slot: 0,
        username: "Player",
        characterName: "Stone",
        characterSheet: "Fighter",
        status: "waiting",
        lastSeenAt: "2026-07-05T00:00:00.000Z"
      }
    ],
    messages: [
      {
        id: "message-1",
        role: "player",
        kind: "turn",
        playerName: "Player",
        characterName: "Stone",
        setting: {
          displayLocation: "Ferrant Concord / Ironhold / Crag Market Street",
          worldName: "Eldermere",
          regionName: "Ferrant Concord",
          settlementName: "Ironhold",
          sceneLocation: "Crag Market Street",
          startingLocation: "Ironhold"
        },
        content: "I check the old door.",
        createdAt: "2026-07-05T00:00:00.000Z"
      }
    ],
    isResolving: false,
    hasBegun: true,
    pendingRollRequest: null,
    pendingRollRequests: [],
    nextInputNeeded: "player_actions",
    inputTargets: [],
    inputPolicy: "all_players",
    combat: {
      active: true,
      round: 2,
      turnOwner: "player:client-1",
      turnOwnerPlayerId: "client-1",
      turnOwnerCharacterName: "Stone",
      initiativeOrder: ["player:client-1", "npc:raider"]
    },
    updatedAt: "2026-07-05T00:00:00.000Z"
  });

  assert.equal(snapshot.players[0]?.status, "waiting");
  assert.equal(snapshot.currentPlayerId, "client-1");
  assert.equal(snapshot.combat.turnOwnerPlayerId, "client-1");
});

test("room realtime contract accepts heartbeat and update events", () => {
  const heartbeat = RoomRealtimeEventSchema.parse({
    type: "heartbeat",
    sentAt: "2026-07-05T00:00:00.000Z"
  });
  const update = RoomRealtimeEventSchema.parse({
    type: "room_updated",
    roomId: "00000000-0000-4000-8000-000000000001",
    updatedAt: "2026-07-05T00:00:00.000Z",
    eventId: "event-1"
  });

  assert.equal(heartbeat.type, "heartbeat");
  assert.equal(update.type, "room_updated");
  assert.equal(update.eventId, "event-1");
  assert.throws(() =>
    RoomRealtimeEventSchema.parse({
      type: "heartbeat",
      sentAt: "not-a-date"
    })
  );
});

test("DM stream contract accepts transient stream events", () => {
  const delta = DmStreamEventSchema.parse({
    type: "dm_stream_delta",
    roomId: "00000000-0000-4000-8000-000000000001",
    turnId: "turn-1",
    text: "The door opens"
  });
  const socketEvent = RoomSocketEventSchema.parse({
    type: "dm_stream_done",
    roomId: "00000000-0000-4000-8000-000000000001",
    turnId: "turn-1",
    messageId: "message-1"
  });

  assert.equal(delta.type, "dm_stream_delta");
  assert.equal(delta.text, "The door opens");
  assert.equal(socketEvent.type, "dm_stream_done");
  assert.throws(() =>
    DmStreamEventSchema.parse({
      type: "dm_stream_failed",
      roomId: "00000000-0000-4000-8000-000000000001",
      turnId: "turn-1",
      message: ""
    })
  );
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
    nextInputNeeded: "player_actions",
    inputTargets: [],
    inputPolicy: "all_players",
    combat: {
      active: false,
      round: 0,
      turnOwner: null,
      turnOwnerPlayerId: null,
      turnOwnerCharacterName: null,
      initiativeOrder: []
    },
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

test("DM provider contracts accept turn and prep payloads", () => {
  const request = DmProviderTurnRequestSchema.parse({
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
  const prep = DmProviderPrepRequestSchema.parse({
    sessionId: "ai-dnd-session",
    ownerClientId: "client-1"
  });
  const response = DmProviderTurnResponseSchema.parse({
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

test("subscription entitlements resolve numeric tiers and reject unknown ids", () => {
  const legend = entitlementForTier(4);
  assert.equal(legend.code, "legend");
  assert.equal(legend.limits.dm_turn.limit, null);
  assert.throws(() => entitlementForTier(99), /Unknown subscription tier id: 99/);
});

test("analytics event contract accepts lifecycle enrichment", () => {
  const event = AnalyticsEventSchema.parse({
    name: "Player Message Sent",
    properties: {
      app: "ai-taverns",
      schemaVersion: 1,
      source: "web",
      distinctId: "guest-1",
      guestId: "guest-1",
      campaignId: "00000000-0000-4000-8000-000000000001",
      campaignMode: "single_player",
      playerMessageCount: 5,
      dmMessageCount: 5,
      minutesSinceCampaignCreated: 14,
      hoursSinceFirstSeen: 26,
      hoursSinceLastActivity: 25,
      returnedAfterDays: 1,
      responseType: "turn",
      hasStateChange: true,
      rollType: "d20",
      requestedByDm: true,
      lifecycleScore: 75,
      lifecycleStage: "hooked",
      qualifiedReturnDays: 2,
      hasQualifiedReturn7d: true
    }
  });

  assert.equal(event.name, "Player Message Sent");
  assert.equal(event.properties.lifecycleStage, "hooked");
  assert.equal(event.properties.qualifiedReturnDays, 2);
});

test("analytics event contract accepts current D&D experience labels", () => {
  const event = AnalyticsEventSchema.parse({
    name: "Onboarding D&D Experience Selected",
    properties: {
      app: "ai-taverns",
      schemaVersion: 1,
      source: "web",
      distinctId: "guest-1",
      dndExperience: "I am completely new."
    }
  });

  assert.equal(event.properties.dndExperience, "I am completely new.");
});
