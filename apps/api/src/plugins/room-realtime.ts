import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import type pg from "pg";
import { z } from "zod";
import {
  RoomRealtimeEventSchema,
  RoomSocketEventSchema,
  type RoomRealtimeEvent,
  type RoomSocketEvent
} from "@ai-dnd/contracts";

const roomUpdatesChannel = "room_updates";
const recentEventLimit = 500;

const RoomUpdateNotificationSchema = z.object({
  roomId: z.string().min(1),
  updatedAt: z.string().datetime(),
  eventId: z.string().min(1).optional()
});

type RoomRealtimeSocket = {
  send: (data: string) => void;
};

export type RoomRealtimeBroadcaster = {
  subscribe: (roomId: string, socket: RoomRealtimeSocket) => () => void;
  broadcast: (event: RoomSocketEvent) => void;
  publishRoomUpdated: (input: {
    roomId: string;
    updatedAt?: string;
    eventId?: string;
  }) => Promise<void>;
};

declare module "fastify" {
  interface FastifyInstance {
    roomRealtime: RoomRealtimeBroadcaster;
  }
}

export type RoomRealtimePluginOptions = {
  startPostgresListener: boolean;
};

function rememberEvent(eventIds: string[], eventId: string): boolean {
  if (eventIds.includes(eventId)) {
    return false;
  }

  eventIds.push(eventId);

  if (eventIds.length > recentEventLimit) {
    eventIds.splice(0, eventIds.length - recentEventLimit);
  }

  return true;
}

export const roomRealtimePlugin = fp<RoomRealtimePluginOptions>(
  async (fastify, options) => {
    const socketsByRoomId = new Map<string, Set<RoomRealtimeSocket>>();
    const recentEventIds: string[] = [];
    let listener: pg.PoolClient | null = null;

    const unsubscribe = (roomId: string, socket: RoomRealtimeSocket) => {
      const sockets = socketsByRoomId.get(roomId);

      if (!sockets) {
        return;
      }

      sockets.delete(socket);

      if (sockets.size === 0) {
        socketsByRoomId.delete(roomId);
      }
    };

    const broadcast = (event: RoomSocketEvent) => {
      const parsed = RoomSocketEventSchema.parse(event);

      if (
        parsed.type === "room_updated" &&
        parsed.eventId &&
        !rememberEvent(recentEventIds, parsed.eventId)
      ) {
        return;
      }

      if (parsed.type === "heartbeat" || parsed.type === "error") {
        return;
      }

      const sockets = socketsByRoomId.get(parsed.roomId);

      if (!sockets) {
        return;
      }

      const payload = JSON.stringify(parsed);

      for (const socket of sockets) {
        try {
          socket.send(payload);
        } catch {
          unsubscribe(parsed.roomId, socket);
        }
      }
    };

    const roomRealtime: RoomRealtimeBroadcaster = {
      subscribe(roomId, socket) {
        const sockets = socketsByRoomId.get(roomId) ?? new Set<RoomRealtimeSocket>();
        sockets.add(socket);
        socketsByRoomId.set(roomId, sockets);

        return () => unsubscribe(roomId, socket);
      },
      broadcast,
      async publishRoomUpdated(input) {
        const event = RoomRealtimeEventSchema.parse({
          type: "room_updated",
          roomId: input.roomId,
          updatedAt: input.updatedAt ?? new Date().toISOString(),
          eventId: input.eventId ?? randomUUID()
        });

        if (event.type !== "room_updated") {
          throw new Error("Room update event validation failed.");
        }

        await fastify.pg.query("select pg_notify($1, $2)", [
          roomUpdatesChannel,
          JSON.stringify({
            roomId: event.roomId,
            updatedAt: event.updatedAt,
            eventId: event.eventId
          })
        ]);

        broadcast(event);
      }
    };

    fastify.decorate("roomRealtime", roomRealtime);

    if (options.startPostgresListener) {
      fastify.addHook("onReady", async () => {
        listener = await fastify.pg.connect();
        listener.on("notification", (message) => {
          if (message.channel !== roomUpdatesChannel || !message.payload) {
            return;
          }

          let payload: unknown;

          try {
            payload = JSON.parse(message.payload);
          } catch (error) {
            fastify.log.warn(
              { error },
              "Ignoring malformed room update notification."
            );
            return;
          }

          const parsed = RoomUpdateNotificationSchema.safeParse(
            payload
          );

          if (!parsed.success) {
            fastify.log.warn(
              { error: parsed.error },
              "Ignoring invalid room update notification."
            );
            return;
          }

          roomRealtime.broadcast({
            type: "room_updated",
            roomId: parsed.data.roomId,
            updatedAt: parsed.data.updatedAt,
            ...(parsed.data.eventId ? { eventId: parsed.data.eventId } : {})
          });
        });
        await listener.query(`listen ${roomUpdatesChannel}`);
      });
    }

    fastify.addHook("onClose", async () => {
      if (!listener) {
        return;
      }

      await listener.query(`unlisten ${roomUpdatesChannel}`);
      listener.release();
      listener = null;
    });
  },
  {
    name: "room-realtime",
    dependencies: ["postgres"]
  }
);
