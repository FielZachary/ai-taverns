import type { FastifyInstance } from "fastify";
import {
  RoomReadQuerySchema,
  RoomRealtimeEventSchema,
  type RoomRealtimeEvent
} from "@ai-dnd/contracts";
import { getRoomForUser } from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

type RealtimeRouteOptions = {
  config: ApiConfig;
};

type RoomRealtimeSocket = {
  send: (data: string) => void;
};

const subscribedRoomId = Symbol("subscribedRoomId");

type SubscribedRequest = {
  [subscribedRoomId]?: string;
};

function sendRoomRealtimeEvent(
  socket: RoomRealtimeSocket,
  event: RoomRealtimeEvent
): void {
  socket.send(JSON.stringify(RoomRealtimeEventSchema.parse(event)));
}

export async function registerRealtimeRoutes(
  fastify: FastifyInstance,
  options: RealtimeRouteOptions
) {
  const { config } = options;

  fastify.get(
    "/room/live",
    {
      websocket: true,
      preValidation: async (request) => {
        const query = RoomReadQuerySchema.parse(request.query);
        const user = await requireAuthenticatedUser(
          fastify,
          config,
          request.cookies[config.authCookieName]
        );
        const sessionId = query.sessionId?.trim() || "new-adventure";
        const roomId = query.roomId?.trim() || sessionId;
        const snapshot = await getRoomForUser(fastify.pg, {
          roomId,
          sessionId,
          userId: user.id
        });

        (request as SubscribedRequest)[subscribedRoomId] = snapshot.roomId;
      }
    },
    (socket, request) => {
      const roomId = (request as SubscribedRequest)[subscribedRoomId];

      if (!roomId) {
        sendRoomRealtimeEvent(socket, {
          type: "error",
          message: "Room subscription could not be established."
        });
        socket.close();
        return;
      }

      const unsubscribe = fastify.roomRealtime.subscribe(roomId, socket);
      const sendHeartbeat = () => {
        sendRoomRealtimeEvent(socket, {
          type: "heartbeat",
          sentAt: new Date().toISOString()
        });
      };
      const heartbeatInterval = setInterval(sendHeartbeat, 30_000);

      setImmediate(sendHeartbeat);

      socket.on("message", () => {
        sendRoomRealtimeEvent(socket, {
          type: "error",
          message: "Client messages are not supported on this channel yet."
        });
      });

      socket.on("close", () => {
        unsubscribe();
        clearInterval(heartbeatInterval);
      });
    }
  );
}
