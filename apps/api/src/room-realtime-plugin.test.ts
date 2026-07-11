import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type pg from "pg";

import { roomRealtimePlugin } from "./plugins/room-realtime.js";

type QueryCall = {
  sql: string;
  values: unknown[] | undefined;
};

class FakePostgresListener extends EventEmitter {
  queryCalls: QueryCall[] = [];
  released = false;

  async query(sql: string, values?: unknown[]) {
    this.queryCalls.push({ sql, values });
    return { rows: [] };
  }

  release() {
    this.released = true;
  }
}

function buildRoomRealtimeApp({
  startPostgresListener = false,
  listener
}: {
  startPostgresListener?: boolean;
  listener?: FakePostgresListener;
} = {}) {
  const queryCalls: QueryCall[] = [];
  const fastify = Fastify({ logger: false });
  const fakePool = {
    async query(sql: string, values?: unknown[]) {
      queryCalls.push({ sql, values });
      return { rows: [] };
    },
    async connect() {
      assert.ok(listener, "Expected a fake Postgres listener.");
      return listener;
    }
  };

  const fakePostgresPlugin = fp(
    async (instance) => {
      instance.decorate("pg", fakePool as unknown as pg.Pool);
    },
    { name: "postgres" }
  );

  return {
    app: fastify
      .register(fakePostgresPlugin)
      .register(roomRealtimePlugin, { startPostgresListener }),
    queryCalls
  };
}

test("room realtime publish notifies Postgres and broadcasts room updates", async () => {
  const { app, queryCalls } = buildRoomRealtimeApp();
  await app.ready();

  const sent: string[] = [];
  const unsubscribe = app.roomRealtime.subscribe("room-1", {
    send(data) {
      sent.push(data);
    }
  });

  await app.roomRealtime.publishRoomUpdated({
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    eventId: "event-1"
  });

  assert.deepEqual(queryCalls, [
    {
      sql: "select pg_notify($1, $2)",
      values: [
        "room_updates",
        JSON.stringify({
          roomId: "room-1",
          updatedAt: "2026-07-11T00:00:00.000Z",
          eventId: "event-1"
        })
      ]
    }
  ]);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0] ?? "{}"), {
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    eventId: "event-1"
  });

  unsubscribe();
  await app.close();
});

test("room realtime subscriptions clean up after unsubscribe and send failures", async () => {
  const { app } = buildRoomRealtimeApp();
  await app.ready();

  const firstSocketMessages: string[] = [];
  const secondSocketMessages: string[] = [];
  const unsubscribeFirst = app.roomRealtime.subscribe("room-1", {
    send(data) {
      firstSocketMessages.push(data);
    }
  });
  app.roomRealtime.subscribe("room-1", {
    send(data) {
      secondSocketMessages.push(data);
      throw new Error("socket closed");
    }
  });

  unsubscribeFirst();

  app.roomRealtime.broadcast({
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    eventId: "event-2"
  });
  app.roomRealtime.broadcast({
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:01.000Z",
    eventId: "event-3"
  });

  assert.deepEqual(firstSocketMessages, []);
  assert.equal(secondSocketMessages.length, 1);

  await app.close();
});

test("room realtime broadcast ignores duplicate, heartbeat, error, and empty room events", async () => {
  const { app } = buildRoomRealtimeApp();
  await app.ready();

  const sent: string[] = [];
  app.roomRealtime.subscribe("room-1", {
    send(data) {
      sent.push(data);
    }
  });

  app.roomRealtime.broadcast({
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    eventId: "event-4"
  });
  app.roomRealtime.broadcast({
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:01.000Z",
    eventId: "event-4"
  });
  app.roomRealtime.broadcast({
    type: "heartbeat",
    sentAt: "2026-07-11T00:00:02.000Z"
  });
  app.roomRealtime.broadcast({ type: "error", message: "Nope." });
  app.roomRealtime.broadcast({
    type: "room_updated",
    roomId: "room-2",
    updatedAt: "2026-07-11T00:00:03.000Z",
    eventId: "event-5"
  });

  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0] ?? "{}").eventId, "event-4");

  await app.close();
});

test("room realtime listener ignores malformed notifications and broadcasts valid payloads", async () => {
  const listener = new FakePostgresListener();
  const { app } = buildRoomRealtimeApp({
    startPostgresListener: true,
    listener
  });
  await app.ready();

  const sent: string[] = [];
  app.roomRealtime.subscribe("room-1", {
    send(data) {
      sent.push(data);
    }
  });

  listener.emit("notification", {
    channel: "other_channel",
    payload: JSON.stringify({
      roomId: "room-1",
      updatedAt: "2026-07-11T00:00:00.000Z"
    })
  });
  listener.emit("notification", { channel: "room_updates" });
  listener.emit("notification", { channel: "room_updates", payload: "{bad-json" });
  listener.emit("notification", {
    channel: "room_updates",
    payload: JSON.stringify({ roomId: "", updatedAt: "not-a-date" })
  });
  listener.emit("notification", {
    channel: "room_updates",
    payload: JSON.stringify({
      roomId: "room-1",
      updatedAt: "2026-07-11T00:00:00.000Z",
      eventId: "event-6"
    })
  });

  assert.deepEqual(listener.queryCalls, [
    { sql: "listen room_updates", values: undefined }
  ]);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(sent[0] ?? "{}"), {
    type: "room_updated",
    roomId: "room-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    eventId: "event-6"
  });

  await app.close();
  assert.deepEqual(listener.queryCalls, [
    { sql: "listen room_updates", values: undefined },
    { sql: "unlisten room_updates", values: undefined }
  ]);
  assert.equal(listener.released, true);
});

test("room realtime close is a no-op when the Postgres listener is disabled", async () => {
  const { app } = buildRoomRealtimeApp({ startPostgresListener: false });

  await app.ready();
  await app.close();
});
