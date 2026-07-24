import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  CampaignCreateResponseSchema,
  RoomBeginResponseSchema,
  RoomPlayerUpdateResponseSchema,
  RoomReadResponseSchema,
  RoomSubmitResponseSchema
} from "@ai-dnd/contracts";

import {
  app,
  database,
  getProviderInputs,
  resetProviderInputs,
  setProviderOverride,
  signIn
} from "./test/app-test-harness.js";

async function createMultiplayerRoom(label: string) {
  const ownerCookie = await signIn(`${label}-owner@example.com`);
  const joinerCookie = await signIn(`${label}-joiner@example.com`);
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: `${label}-owner-client`,
      playerName: "Owner",
      characterName: "Owner Character",
      characterSheet: "A steady leader."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  assert.ok(created.campaign.joinCode);

  const joinResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: created.campaign.joinCode,
      clientId: `${label}-joiner-client`,
      username: "Joined Player",
      characterName: "Joined Character",
      characterSheet: "A brave scout."
    }
  });

  assert.equal(joinResponse.statusCode, 200);

  return {
    ownerCookie,
    joinerCookie,
    campaignId: created.campaign.id,
    ownerClientId: `${label}-owner-client`,
    joinerClientId: `${label}-joiner-client`
  };
}

test("room routes read, update player, begin, and submit through Fastify", async () => {
  const ownerCookie = await signIn("room-owner@example.com");
  const joinerCookie = await signIn("room-joiner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "room-owner-client",
      playerName: "Owner",
      characterName: "Captain",
      characterSheet: "A steady leader."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  assert.ok(created.campaign.joinCode);

  const joinResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: created.campaign.joinCode,
      clientId: "room-joiner-client",
      username: "Joined Player",
      characterName: "Joined Character",
      characterSheet: "A brave scout."
    }
  });

  assert.equal(joinResponse.statusCode, 200);

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/room?roomId=${created.campaign.id}`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(readResponse.statusCode, 200);
  const readRoom = RoomReadResponseSchema.parse(readResponse.json());
  assert.equal(readRoom.roomId, created.campaign.id);
  assert.equal(readRoom.players.length, 2);

  const profileResponse = await app.inject({
    method: "POST",
    url: "/api/room/player",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: created.campaign.id,
      playerId: "room-joiner-client",
      username: "Joined Player",
      characterName: "Joined Character",
      characterSheet: "A brave scout with sharper instincts."
    }
  });

  assert.equal(profileResponse.statusCode, 200);
  const profileRoom = RoomPlayerUpdateResponseSchema.parse(
    profileResponse.json()
  );
  assert.equal(
    profileRoom.players.find((player) => player.id === "room-joiner-client")
      ?.characterSheet,
    "A brave scout with sharper instincts."
  );

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: created.campaign.id
    }
  });

  assert.equal(beginResponse.statusCode, 200);
  const begunRoom = RoomBeginResponseSchema.parse(beginResponse.json());
  assert.equal(begunRoom.hasBegun, true);
  assert.equal(
    begunRoom.messages.at(-1)?.content,
    "A lantern flickers over the old road as your adventure begins.\n\nA weathered sign points toward a ruined watchtower beyond the trees.\n\nWhat do you do?"
  );

  const submitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: created.campaign.id,
      playerId: "room-joiner-client",
      message: "I inspect the tavern door."
    }
  });

  assert.equal(submitResponse.statusCode, 200, submitResponse.body);
  const submittedRoom = RoomSubmitResponseSchema.parse(submitResponse.json());
  assert.equal(
    submittedRoom.players.find((player) => player.id === "room-joiner-client")
      ?.status,
    "submitted"
  );
  assert.equal(submittedRoom.messages.at(-1)?.role, "player");

  const resolvingSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: created.campaign.id,
      playerId: "room-owner-client",
      message: "I watch the scout's back."
    }
  });

  assert.equal(resolvingSubmitResponse.statusCode, 200, resolvingSubmitResponse.body);
  const resolvedRoom = RoomSubmitResponseSchema.parse(
    resolvingSubmitResponse.json()
  );
  assert.equal(resolvedRoom.isResolving, false);
  assert.equal(resolvedRoom.messages.at(-1)?.role, "dm");
  assert.equal(
    database.turns.filter(
      (turn) => turn.campaign_id === created.campaign.id && turn.status === "resolved"
    ).length,
    2
  );
});

test("multiplayer combat catches up NPC turns instead of rejecting players", async () => {
  const {
    ownerCookie,
    joinerCookie,
    campaignId,
    ownerClientId,
    joinerClientId
  } = await createMultiplayerRoom("room-npc-catchup");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const ownerActorKey = `player:${ownerClientId}`;
  const joinerActorKey = `player:${joinerClientId}`;
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    inputTargets: [],
    inputPolicy: "all_players",
    mechanicsState: {
      combat: {
        active: true,
        round: 1,
        turnOwner: "npc:cutlass-raider",
        initiativeOrder: [
          ownerActorKey,
          joinerActorKey,
          "npc:cutlass-raider",
          "npc:horn-blower"
        ]
      },
      actors: {
        [ownerActorKey]: {
          characterName: "Owner Character",
          currentHp: 20,
          maxHp: 20,
          conditions: []
        },
        [joinerActorKey]: {
          characterName: "Joined Character",
          currentHp: 18,
          maxHp: 18,
          conditions: []
        },
        "npc:cutlass-raider": {
          characterName: "Cutlass raider",
          currentHp: 12,
          maxHp: 12,
          conditions: []
        },
        "npc:horn-blower": {
          characterName: "Horn-blower",
          currentHp: 10,
          maxHp: 10,
          conditions: []
        }
      }
    }
  };
  resetProviderInputs();

  const firstSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I cast Scorching Ray at the cutlass raider."
    }
  });

  assert.equal(firstSubmitResponse.statusCode, 200, firstSubmitResponse.body);
  const firstSubmit = RoomSubmitResponseSchema.parse(firstSubmitResponse.json());
  assert.equal(
    firstSubmit.players.find((player) => player.id === joinerClientId)?.status,
    "submitted"
  );

  const resolvingSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: ownerClientId,
      message: "I cover the Scorching Ray cast from the pier."
    }
  });

  assert.equal(resolvingSubmitResponse.statusCode, 200, resolvingSubmitResponse.body);
  const resolvedRoom = RoomSubmitResponseSchema.parse(
    resolvingSubmitResponse.json()
  );
  assert.equal(resolvedRoom.messages.at(-1)?.role, "dm");
  assert.match(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /cutlass raider's turn resolves first/i
  );
  assert.match(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /attack roll: 17 vs AC 14 - hit/i
  );
  assert.match(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /damage roll: 1d6 \+ 2 = 6/i
  );
  assert.match(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /6 slashing damage/i
  );
  assert.doesNotMatch(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /It is not your turn/i
  );
  assert.doesNotMatch(
    resolvedRoom.messages.at(-1)?.content ?? "",
    /lunges[^.]*What do you do/is
  );

  const updatedCampaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  assert.ok(updatedCampaign);
  const mechanicsState = (updatedCampaign?.metadata as Record<string, unknown>)
    .mechanicsState as {
      combat?: { turnOwner?: string | null };
      actors?: Record<string, { currentHp?: number }>;
    };

  assert.equal(mechanicsState.combat?.turnOwner, ownerActorKey);
  assert.equal(mechanicsState.actors?.[ownerActorKey]?.currentHp, 14);
  assert.deepEqual(resolvedRoom.inputTargets, [ownerActorKey]);
  assert.equal(resolvedRoom.inputPolicy, "only_targeted_players");
  assert.equal(getProviderInputs().length, 1);

  updatedCampaign.metadata = {
    ...(updatedCampaign.metadata as Record<string, unknown>),
    inputTargets: [],
    inputPolicy: "all_players",
    mechanicsState: {
      ...mechanicsState,
      combat: {
        active: true,
        round: 2,
        turnOwner: "Horn-blower",
        initiativeOrder: [
          ownerActorKey,
          joinerActorKey,
          "npc:cutlass-raider",
          "npc:horn-blower"
        ]
      }
    }
  };

  const secondFirstSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I cast Scorching Ray at the horn-blower."
    }
  });

  assert.equal(
    secondFirstSubmitResponse.statusCode,
    200,
    secondFirstSubmitResponse.body
  );

  const secondResolvingSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: ownerClientId,
      message: "I keep the cutlass raider occupied."
    }
  });

  assert.equal(
    secondResolvingSubmitResponse.statusCode,
    200,
    secondResolvingSubmitResponse.body
  );
  const secondResolvedRoom = RoomSubmitResponseSchema.parse(
    secondResolvingSubmitResponse.json()
  );

  assert.equal(secondResolvedRoom.messages.at(-1)?.role, "dm");
  assert.match(
    secondResolvedRoom.messages.at(-1)?.content ?? "",
    /attack roll: 17 vs AC 14 - hit/i
  );
  assert.match(
    secondResolvedRoom.messages.at(-1)?.content ?? "",
    /damage roll: 1d6 \+ 2 = 6/i
  );
  assert.match(
    secondResolvedRoom.messages.at(-1)?.content ?? "",
    /6 slashing damage/i
  );
  assert.doesNotMatch(
    secondResolvedRoom.messages.at(-1)?.content ?? "",
    /It is not your turn/i
  );

  const secondUpdatedCampaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  const secondMechanicsState = (secondUpdatedCampaign?.metadata as Record<
    string,
    unknown
  >).mechanicsState as {
    combat?: { turnOwner?: string | null };
    actors?: Record<string, { currentHp?: number }>;
  };

  assert.equal(secondMechanicsState.combat?.turnOwner, ownerActorKey);
  assert.equal(secondMechanicsState.actors?.[ownerActorKey]?.currentHp, 8);
  assert.deepEqual(secondResolvedRoom.inputTargets, [ownerActorKey]);
  assert.equal(secondResolvedRoom.inputPolicy, "only_targeted_players");
});

test("room snapshots expose active combat turn owner for clients", async () => {
  const { ownerCookie, campaignId, ownerClientId, joinerClientId } =
    await createMultiplayerRoom("room-combat-owner-snapshot");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const ownerActorKey = `player:${ownerClientId}`;
  const joinerActorKey = `player:${joinerClientId}`;
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    mechanicsState: {
      combat: {
        active: true,
        round: 2,
        turnOwner: ownerActorKey,
        initiativeOrder: [ownerActorKey, joinerActorKey, "npc:cutlass-raider"]
      },
      actors: {
        [ownerActorKey]: {
          characterName: "Owner Character",
          currentHp: 14,
          maxHp: 20,
          conditions: []
        },
        [joinerActorKey]: {
          characterName: "Joined Character",
          currentHp: 18,
          maxHp: 18,
          conditions: []
        },
        "npc:cutlass-raider": {
          characterName: "Cutlass raider",
          currentHp: 12,
          maxHp: 12,
          conditions: []
        }
      }
    }
  };

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/room?roomId=${campaignId}`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(readResponse.statusCode, 200, readResponse.body);
  const room = RoomReadResponseSchema.parse(readResponse.json());

  assert.equal(room.combat.active, true);
  assert.equal(room.combat.turnOwner, ownerActorKey);
  assert.equal(room.combat.turnOwnerPlayerId, ownerClientId);
  assert.equal(room.combat.turnOwnerCharacterName, "Owner Character");
});

test("room submit accepts targeted input by mechanics actor key", async () => {
  const { ownerCookie, joinerCookie, campaignId, ownerClientId, joinerClientId } =
    await createMultiplayerRoom("room-actor-key-target");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const ownerPlayer = database.players.find(
    (player) =>
      player.campaign_id === campaignId && player.client_id === ownerClientId
  );
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(ownerPlayer);
  assert.ok(campaign);

  const ownerActorKey = `player:${ownerPlayer.id}`;
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    inputTargets: [ownerActorKey],
    inputPolicy: "only_targeted_players"
  };

  const joinerSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I try to answer out of turn."
    }
  });

  assert.equal(joinerSubmitResponse.statusCode, 403);

  const ownerSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: ownerClientId,
      message: "I answer the call."
    }
  });

  assert.equal(ownerSubmitResponse.statusCode, 200, ownerSubmitResponse.body);
});

test("active combat targets only the next player turn owner after DM resolution", async () => {
  const { ownerCookie, campaignId, ownerClientId } =
    await createMultiplayerRoom("room-combat-targets-turn-owner");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const ownerPlayer = database.players.find(
    (player) =>
      player.campaign_id === campaignId && player.client_id === ownerClientId
  );
  const joinerPlayer = database.players.find(
    (player) =>
      player.campaign_id === campaignId && player.client_id !== ownerClientId
  );
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(ownerPlayer);
  assert.ok(joinerPlayer);
  assert.ok(campaign);

  const ownerActorKey = `player:${ownerPlayer.id}`;
  const joinerActorKey = `player:${joinerPlayer.id}`;
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    inputTargets: [ownerActorKey],
    inputPolicy: "only_targeted_players",
    mechanicsState: {
      combat: {
        active: true,
        round: 1,
        turnOwner: ownerActorKey,
        initiativeOrder: [ownerActorKey, joinerActorKey, "npc:warden-1"]
      },
      actors: {
        [ownerActorKey]: {
          characterName: "Owner Character",
          currentHp: 20,
          maxHp: 20,
          conditions: []
        },
        [joinerActorKey]: {
          characterName: "Joined Character",
          currentHp: 18,
          maxHp: 18,
          conditions: []
        },
        "npc:warden-1": {
          characterName: "Warden 1",
          currentHp: 5,
          maxHp: 12,
          conditions: []
        }
      }
    }
  };

  setProviderOverride(async (input) => {
    const content = JSON.stringify({
      public_narration:
        "Owner Character's spell drops the warden. Joined Character, you're up next. What do you do?",
      resolution_mode: "resolved_without_dice",
      roll_requests: [],
      next_input_needed: "player_actions",
      input_targets: [],
      input_policy: "all_players",
      mechanics_state_update: {
        combat: {
          active: true,
          round: 1,
          turnOwner: joinerActorKey,
          initiativeOrder: [ownerActorKey, joinerActorKey, "npc:warden-1"]
        },
        actors: {
          "npc:warden-1": {
            currentHp: 0
          }
        }
      }
    });

    return {
      id: "provider-combat-turn-target-regression",
      content,
      debug: {
        requestMessages: [
          {
            role: "system",
            content: input.instructions
          },
          {
            role: "user",
            content: input.message
          }
        ],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  try {
    const ownerSubmitResponse = await app.inject({
      method: "POST",
      url: "/api/room/submit",
      headers: {
        cookie: ownerCookie
      },
      payload: {
        roomId: campaignId,
        playerId: ownerClientId,
        message: "I finish the warden with Magic Missile."
      }
    });

    assert.equal(ownerSubmitResponse.statusCode, 200, ownerSubmitResponse.body);
    const resolved = RoomSubmitResponseSchema.parse(ownerSubmitResponse.json());

    assert.deepEqual(resolved.inputTargets, [joinerActorKey]);
    assert.equal(resolved.inputPolicy, "only_targeted_players");
    assert.equal(resolved.combat.turnOwner, joinerActorKey);

    const updatedCampaign = database.campaigns.find(
      (candidate) => candidate.id === campaignId
    );
    assert.deepEqual(
      (updatedCampaign?.metadata as Record<string, unknown>).inputTargets,
      [joinerActorKey]
    );
    assert.equal(
      (updatedCampaign?.metadata as Record<string, unknown>).inputPolicy,
      "only_targeted_players"
    );

    const ownerAgainResponse = await app.inject({
      method: "POST",
      url: "/api/room/submit",
      headers: {
        cookie: ownerCookie
      },
      payload: {
        roomId: campaignId,
        playerId: ownerClientId,
        message: "I keep acting out of turn."
      }
    });

    assert.equal(ownerAgainResponse.statusCode, 403);
  } finally {
    setProviderOverride(undefined);
  }
});

test("multiplayer combat infers spell slots from explicit caster character sheet", async () => {
  const ownerCookie = await signIn("room-inferred-slots-owner@example.com");
  const joinerCookie = await signIn("room-inferred-slots-joiner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "room-inferred-slots-owner-client",
      playerName: "Owner",
      characterName: "Owner",
      characterSheet:
        "A level 5 wizard with AC 14, 20 HP, initiative +2, Fireball, and poor impulse control."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  assert.ok(created.campaign.joinCode);

  const joinResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: created.campaign.joinCode,
      clientId: "room-inferred-slots-joiner-client",
      username: "Joined Player",
      characterName: "Joined Character",
      characterSheet: "A brave scout."
    }
  });
  assert.equal(joinResponse.statusCode, 200, joinResponse.body);

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: created.campaign.id
    }
  });
  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const ownerSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: created.campaign.id,
      playerId: "room-inferred-slots-owner-client",
      message:
        "Mara has not noticed me, so I cast fireball on Mara and the two Drowned Choir raiders."
    }
  });
  assert.equal(ownerSubmitResponse.statusCode, 200, ownerSubmitResponse.body);
  const ownerSubmitted = RoomSubmitResponseSchema.parse(ownerSubmitResponse.json());
  assert.match(
    ownerSubmitted.players.find(
      (player) => player.id === "room-inferred-slots-owner-client"
    )?.characterSheet ?? "",
    /3rd-level slots: 2 total, 1 used, 1 remaining/
  );

  const joinerSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: created.campaign.id,
      playerId: "room-inferred-slots-joiner-client",
      message: "I dive behind the stone well before the blast blooms."
    }
  });
  assert.equal(joinerSubmitResponse.statusCode, 200, joinerSubmitResponse.body);
  const resolved = RoomSubmitResponseSchema.parse(joinerSubmitResponse.json());

  assert.equal(resolved.pendingRollRequest?.dice, "8d6");
  assert.equal(resolved.pendingRollRequest?.label, "Fireball damage");
  assert.deepEqual(resolved.inputTargets, ["Owner"]);
  assert.equal(resolved.inputPolicy, "only_targeted_players");
});

test("room read and player update reject missing or forbidden campaigns", async () => {
  const { ownerCookie, campaignId, joinerClientId } =
    await createMultiplayerRoom("room-forbidden");
  const otherCookie = await signIn("room-forbidden-other@example.com");
  const missingRoomId = "00000000-0000-4000-8000-000000000098";

  const missingReadResponse = await app.inject({
    method: "GET",
    url: `/api/room?roomId=${missingRoomId}`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(missingReadResponse.statusCode, 404);
  assert.equal(
    ApiErrorResponseSchema.parse(missingReadResponse.json()).error.code,
    "NOT_FOUND"
  );

  const forbiddenReadResponse = await app.inject({
    method: "GET",
    url: `/api/room?roomId=${campaignId}`,
    headers: {
      cookie: otherCookie
    }
  });

  assert.equal(forbiddenReadResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(forbiddenReadResponse.json()).error.code,
    "FORBIDDEN"
  );

  const forbiddenUpdateResponse = await app.inject({
    method: "POST",
    url: "/api/room/player",
    headers: {
      cookie: otherCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      username: "Other",
      characterName: "Other Character",
      characterSheet: "This user is not in the campaign."
    }
  });

  assert.equal(forbiddenUpdateResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(forbiddenUpdateResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("room begin rejects non-owners and rooms without enough complete players", async () => {
  const { joinerCookie, campaignId } =
    await createMultiplayerRoom("room-begin-forbidden");

  const forbiddenBeginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(forbiddenBeginResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(forbiddenBeginResponse.json()).error.code,
    "FORBIDDEN"
  );

  const ownerOnlyCookie = await signIn("room-begin-owner-only@example.com");
  const ownerOnlyCreateResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerOnlyCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "mystery",
      ownerClientId: "room-begin-owner-only-client",
      playerName: "Owner"
    }
  });
  const ownerOnly = CampaignCreateResponseSchema.parse(
    ownerOnlyCreateResponse.json()
  );

  const badStateBeginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerOnlyCookie
    },
    payload: {
      roomId: ownerOnly.campaign.id
    }
  });

  assert.equal(badStateBeginResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(badStateBeginResponse.json()).error.code,
    "BAD_REQUEST"
  );
});

test("room submit rejects unbegun rooms, wrong players, and untargeted players", async () => {
  const {
    ownerCookie,
    joinerCookie,
    campaignId,
    ownerClientId,
    joinerClientId
  } = await createMultiplayerRoom("room-submit-negative");

  const unbegunSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: ownerClientId,
      message: "I open the scene."
    }
  });

  assert.equal(unbegunSubmitResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(unbegunSubmitResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200);

  const wrongPlayerResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I try to act as someone else."
    }
  });

  assert.equal(wrongPlayerResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(wrongPlayerResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    inputTargets: ["Owner Character"],
    inputPolicy: "only_targeted_players"
  };

  const untargetedPlayerResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I speak out of turn."
    }
  });

  assert.equal(untargetedPlayerResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(untargetedPlayerResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("room routes support session fallback and reject incomplete player profiles", async () => {
  const { ownerCookie, campaignId } = await createMultiplayerRoom(
    "room-session-fallback"
  );
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );

  assert.ok(campaign);

  const readBySessionResponse = await app.inject({
    method: "GET",
    url: `/api/room?sessionId=${campaign.session_id}`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(readBySessionResponse.statusCode, 200);
  assert.equal(
    RoomReadResponseSchema.parse(readBySessionResponse.json()).roomId,
    campaignId
  );

  const incompleteProfileResponse = await app.inject({
    method: "POST",
    url: "/api/room/player",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: "room-session-fallback-owner-client",
      username: "Owner",
      characterName: "Owner Character"
    }
  });

  assert.equal(incompleteProfileResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(incompleteProfileResponse.json()).error.code,
    "BAD_REQUEST"
  );
});

test("room submit rejects incomplete player turn payloads", async () => {
  const { ownerCookie, campaignId } =
    await createMultiplayerRoom("room-submit-incomplete");

  const missingPlayerResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId,
      message: "I try to speak without a player id."
    }
  });

  assert.equal(missingPlayerResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(missingPlayerResponse.json()).error.code,
    "BAD_REQUEST"
  );
});

test("room begin is idempotent after start and submit supports skip turns", async () => {
  const { ownerCookie, joinerCookie, campaignId, joinerClientId } =
    await createMultiplayerRoom("room-skip-turn");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const begunEvents = () =>
    database.campaignEvents.filter(
      (event) => event.campaign_id === campaignId && event.type === "adventure_begun"
    );
  const begunEventCount = begunEvents().length;

  const duplicateBeginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(duplicateBeginResponse.statusCode, 200, duplicateBeginResponse.body);
  assert.equal(RoomBeginResponseSchema.parse(duplicateBeginResponse.json()).hasBegun, true);
  assert.equal(begunEvents().length, begunEventCount);

  const skipTurnResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      skipTurn: true
    }
  });

  assert.equal(skipTurnResponse.statusCode, 200, skipTurnResponse.body);
  const skippedRoom = RoomSubmitResponseSchema.parse(skipTurnResponse.json());
  assert.equal(
    skippedRoom.players.find((player) => player.id === joinerClientId)?.status,
    "submitted"
  );
  assert.match(skippedRoom.messages.at(-1)?.content ?? "", /skips their turn/);
});

test("room submit rejects pending roll mismatches", async () => {
  const { ownerCookie, joinerCookie, campaignId, joinerClientId } =
    await createMultiplayerRoom("room-pending-roll");

  const beginResponse = await app.inject({
    method: "POST",
    url: "/api/room/begin",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      roomId: campaignId
    }
  });

  assert.equal(beginResponse.statusCode, 200, beginResponse.body);

  const campaign = database.campaigns.find(
    (candidate) => candidate.id === campaignId
  );
  assert.ok(campaign);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    pendingRollRequests: [
      {
        id: "owner-save",
        player: "Owner Character",
        dice: "1d20",
        label: "Wisdom save"
      }
    ]
  };

  const regularSubmitResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      message: "I ignore the pending roll."
    }
  });

  assert.equal(regularSubmitResponse.statusCode, 409);
  assert.equal(
    ApiErrorResponseSchema.parse(regularSubmitResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const wrongRollResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      rollRequestId: "wrong-roll"
    }
  });

  assert.equal(wrongRollResponse.statusCode, 409);
  assert.equal(
    ApiErrorResponseSchema.parse(wrongRollResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const tooManyRollsResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      rollSubmissions: [
        {
          rollRequestId: "owner-save"
        },
        {
          rollRequestId: "extra-roll"
        }
      ]
    }
  });

  assert.equal(tooManyRollsResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(tooManyRollsResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const wrongPlayerRollResponse = await app.inject({
    method: "POST",
    url: "/api/room/submit",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      roomId: campaignId,
      playerId: joinerClientId,
      rollRequestId: "owner-save"
    }
  });

  assert.equal(wrongPlayerRollResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(wrongPlayerRollResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("room routes require an owned session", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/room?roomId=00000000-0000-4000-8000-000000000001"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "UNAUTHORIZED"
  );
});
