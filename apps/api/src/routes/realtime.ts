import type { FastifyInstance } from "fastify";
import {
  RoomReadQuerySchema,
  RoomRealtimeEventSchema,
  RoomSocketEventSchema,
  type RoomRealtimeEvent
} from "@ai-dnd/contracts";
import { getRoomForUser } from "@ai-dnd/db";
import { randomUUID } from "node:crypto";
import { sampleRate, streamCartesiaNarration } from "../cartesia.js";
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
  userId?: string;
};

function sendRoomRealtimeEvent(
  socket: RoomRealtimeSocket,
  event: RoomRealtimeEvent
): void {
  socket.send(JSON.stringify(RoomRealtimeEventSchema.parse(event)));
}

function sendSocketEvent(socket: RoomRealtimeSocket, event: unknown): void {
  socket.send(JSON.stringify(RoomSocketEventSchema.parse(event)));
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
        (request as SubscribedRequest).userId = user.id;
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

      socket.on("message", (raw: Buffer) => {
        void (async () => {
          let event: { type?: string; messageId?: string };
          try { event = JSON.parse(raw.toString()) as { type?: string; messageId?: string }; } catch { event = {}; }
          if (event.type !== "tts_start" || !event.messageId) {
            sendRoomRealtimeEvent(socket, { type: "error", message: "Client messages are not supported on this channel yet." });
            return;
          }
          const subscriber = request as SubscribedRequest;
          if (!config.cartesiaApiKey || !subscriber.userId) {
            sendSocketEvent(socket, { type: "tts_failed", roomId, narrationId: randomUUID(), message: "Narration is not configured." });
            return;
          }
          const snapshot = await getRoomForUser(fastify.pg, { roomId, sessionId: roomId, userId: subscriber.userId });
          const message = snapshot.messages.find((entry) => entry.id === event.messageId && entry.role === "dm");
          const narrationId = randomUUID();
          if (!message) {
            sendSocketEvent(socket, { type: "tts_failed", roomId, narrationId, message: "That DM message is unavailable." });
            return;
          }
          sendSocketEvent(socket, { type: "tts_started", roomId, narrationId, messageId: message.id, text: message.content });
          try {
            await streamCartesiaNarration({
              apiKey: config.cartesiaApiKey,
              narration: message.narrationContent ?? message.content,
              onAudio(audio) {
                sendSocketEvent(socket, {
                  type: "tts_audio",
                  roomId,
                  narrationId,
                  audio,
                  sampleRate
                });
              },
              onWordTimings(wordTimings) {
                sendSocketEvent(socket, {
                  type: "tts_timestamps",
                  roomId,
                  narrationId,
                  wordTimings
                });
              }
            });
            sendSocketEvent(socket, { type: "tts_done", roomId, narrationId });
          } catch (error) {
            sendSocketEvent(socket, { type: "tts_failed", roomId, narrationId, message: error instanceof Error ? error.message : "Narration failed." });
          }
        })();
      });

      socket.on("close", () => {
        unsubscribe();
        clearInterval(heartbeatInterval);
      });
    }
  );
}
