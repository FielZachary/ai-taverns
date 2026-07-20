import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import {
  CampaignCreateResponseSchema,
  RoomRealtimeEventSchema
} from "@ai-dnd/contracts";

import { app, database, signIn } from "./test/app-test-harness.js";

test("room realtime websocket rejects unauthenticated upgrades", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/room/live",
    headers: {
      connection: "Upgrade",
      upgrade: "websocket"
    }
  });

  assert.equal(response.statusCode, 401);
});

test("room realtime websocket rejects missing and forbidden rooms during upgrade", async () => {
  const ownerCookie = await signIn("realtime-forbidden-owner@example.com");
  const otherCookie = await signIn("realtime-forbidden-other@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "realtime-forbidden-client",
      playerName: "Realtime Owner",
      characterName: "Signal",
      characterSheet: "A careful listener."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const missingResponse = await app.inject({
    method: "GET",
    url: "/api/room/live?roomId=00000000-0000-4000-8000-000000000096",
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      cookie: ownerCookie
    }
  });

  assert.equal(missingResponse.statusCode, 404);

  const forbiddenResponse = await app.inject({
    method: "GET",
    url: `/api/room/live?roomId=${created.campaign.id}`,
    headers: {
      connection: "Upgrade",
      upgrade: "websocket",
      cookie: otherCookie
    }
  });

  assert.equal(forbiddenResponse.statusCode, 403);
});

test("room realtime websocket accepts session cookies and emits events", async () => {
  const cookie = await signIn("realtime@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "realtime-client",
      playerName: "Realtime Player",
      characterName: "Signal",
      characterSheet: "A careful listener."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const socket = await app.injectWS(`/api/room/live?roomId=${created.campaign.id}`, {
    headers: {
      cookie
    }
  });

  try {
    const [heartbeatMessage] = await once(socket, "message");
    const heartbeat = RoomRealtimeEventSchema.parse(
      JSON.parse(heartbeatMessage.toString())
    );

    assert.equal(heartbeat.type, "heartbeat");

    socket.send("hello");

    const [errorMessage] = await once(socket, "message");
    const error = RoomRealtimeEventSchema.parse(
      JSON.parse(errorMessage.toString())
    );

    assert.equal(error.type, "error");
    assert.match(error.message, /not supported/);
  } finally {
    socket.terminate();
  }
});

test("room realtime websocket publishes room updates after mutations", async () => {
  const cookie = await signIn("realtime-mutation@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "realtime-mutation-client",
      playerName: "Realtime Mutation",
      characterName: "Echo",
      characterSheet: "A watcher of room changes."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const socket = await app.injectWS(
    `/api/room/live?roomId=${created.campaign.id}`,
    {
      headers: {
        cookie
      }
    }
  );

  try {
    const [heartbeatMessage] = await once(socket, "message");
    const heartbeat = RoomRealtimeEventSchema.parse(
      JSON.parse(heartbeatMessage.toString())
    );

    assert.equal(heartbeat.type, "heartbeat");

    const nextMessage = once(socket, "message");
    const profileResponse = await app.inject({
      method: "POST",
      url: "/api/room/player",
      headers: {
        cookie
      },
      payload: {
        roomId: created.campaign.id,
        playerId: "realtime-mutation-client",
        username: "Realtime Mutation",
        characterName: "Echo",
        characterSheet: "A watcher of room changes and fresh signals."
      }
    });

    assert.equal(profileResponse.statusCode, 200);

    const [updateMessage] = await nextMessage;
    const update = RoomRealtimeEventSchema.parse(
      JSON.parse(updateMessage.toString())
    );

    assert.equal(update.type, "room_updated");
    assert.equal(update.roomId, created.campaign.id);
    assert.ok(update.eventId);
  } finally {
    socket.terminate();
  }
});

test("room realtime websocket streams DM turns without duplicating final messages", async () => {
  const cookie = await signIn("realtime-stream@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "realtime-stream-client",
      playerName: "Realtime Stream",
      characterName: "Rune",
      characterSheet: "A patient listener."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const socket = await app.injectWS(
    `/api/room/live?roomId=${created.campaign.id}`,
    {
      headers: {
        cookie
      }
    }
  );

  try {
    const [heartbeatMessage] = await once(socket, "message");
    const heartbeat = RoomRealtimeEventSchema.parse(
      JSON.parse(heartbeatMessage.toString())
    );

    assert.equal(heartbeat.type, "heartbeat");

    const streamEvents: unknown[] = [];
    const streamDone = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for DM stream events."));
      }, 1_000);

      socket.on("message", (message: { toString: () => string }) => {
        const event = JSON.parse(message.toString()) as { type?: string };

        if (!event.type?.startsWith("dm_stream_")) {
          return;
        }

        streamEvents.push(event);

        if (event.type === "dm_stream_done") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const turnResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: {
        cookie
      },
      payload: {
        message: "I open the listening door."
      }
    });

    assert.equal(turnResponse.statusCode, 200, turnResponse.body);
    await streamDone;

    assert.deepEqual(
      streamEvents.map((event) => (event as { type: string }).type),
      [
        "dm_stream_started",
        "dm_stream_delta",
        "dm_stream_delta",
        "dm_stream_done"
      ]
    );
    assert.equal(
      database.campaignEvents.filter(
        (event) =>
          event.campaign_id === created.campaign.id &&
          event.type === "turn_resolved"
      ).length,
      1
    );
  } finally {
    socket.terminate();
  }
});

test("room realtime websocket streams ask-DM answers", async () => {
  const cookie = await signIn("realtime-ask-dm-stream@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "realtime-ask-dm-stream-client",
      playerName: "Realtime Ask",
      characterName: "Seren",
      characterSheet: "A curious ranger."
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const socket = await app.injectWS(
    `/api/room/live?roomId=${created.campaign.id}`,
    {
      headers: {
        cookie
      }
    }
  );

  try {
    const [heartbeatMessage] = await once(socket, "message");
    const heartbeat = RoomRealtimeEventSchema.parse(
      JSON.parse(heartbeatMessage.toString())
    );

    assert.equal(heartbeat.type, "heartbeat");

    const streamEvents: unknown[] = [];
    const streamDone = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for ask-DM stream events."));
      }, 1_000);

      socket.on("message", (message: { toString: () => string }) => {
        const event = JSON.parse(message.toString()) as { type?: string };

        if (!event.type?.startsWith("dm_stream_")) {
          return;
        }

        streamEvents.push(event);

        if (event.type === "dm_stream_done") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const askResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/ask-dm`,
      headers: {
        cookie
      },
      payload: {
        question: "Would Seren recognize these tracks?"
      }
    });

    assert.equal(askResponse.statusCode, 200, askResponse.body);
    await streamDone;

    assert.deepEqual(
      streamEvents.map((event) => (event as { type: string }).type),
      [
        "dm_stream_started",
        "dm_stream_delta",
        "dm_stream_delta",
        "dm_stream_done"
      ]
    );
    assert.equal(
      database.campaignEvents.filter(
        (event) =>
          event.campaign_id === created.campaign.id &&
          event.type === "dm_answer"
      ).length,
      1
    );
  } finally {
    socket.terminate();
  }
});
