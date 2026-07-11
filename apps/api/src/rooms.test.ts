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

import { app, database, signIn } from "./test/app-test-harness.js";

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

