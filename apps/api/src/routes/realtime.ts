import type { FastifyInstance } from "fastify";
import {
  RoomRealtimeEventSchema,
  type RoomRealtimeEvent
} from "@ai-dnd/contracts";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

type RealtimeRouteOptions = {
  config: ApiConfig;
};

type RoomRealtimeSocket = {
  send: (data: string) => void;
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
        await requireAuthenticatedUser(
          fastify,
          config,
          request.cookies[config.authCookieName]
        );
      }
    },
    (socket) => {
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
        clearInterval(heartbeatInterval);
      });
    }
  );
}
