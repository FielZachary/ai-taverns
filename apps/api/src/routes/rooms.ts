import type { FastifyInstance } from "fastify";
import {
  RoomBeginRequestSchema,
  RoomBeginResponseSchema,
  RoomPlayerUpdateRequestSchema,
  RoomPlayerUpdateResponseSchema,
  RoomReadQuerySchema,
  RoomReadResponseSchema,
  RoomSubmitRequestSchema,
  RoomSubmitResponseSchema
} from "@ai-dnd/contracts";
import {
  beginRoomForUser,
  getRoomForUser,
  registerRoomPlayerForUser,
  submitRoomTurnForUser
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

type RoomRouteOptions = {
  config: ApiConfig;
};

function roomIdentity(roomId: string | undefined, sessionId: string | undefined) {
  const resolvedSessionId = sessionId?.trim() || "new-adventure";
  return {
    sessionId: resolvedSessionId,
    roomId: roomId?.trim() || resolvedSessionId
  };
}

function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export async function registerRoomRoutes(
  fastify: FastifyInstance,
  options: RoomRouteOptions
) {
  const { config } = options;

  fastify.get("/room", async (request) => {
    const query = RoomReadQuerySchema.parse(request.query);
    const identity = roomIdentity(query.roomId, query.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return RoomReadResponseSchema.parse(
      await getRoomForUser(fastify.pg, {
        ...identity,
        userId: user.id
      })
    );
  });

  fastify.post("/room/player", async (request) => {
    const body = RoomPlayerUpdateRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const playerId = body.playerId?.trim();
    const username = body.username?.trim();
    const characterName = body.characterName?.trim();
    const characterSheet = body.characterSheet?.trim();
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    if (!playerId || !username || !characterName || !characterSheet) {
      throw createHttpError(400, "Player profile is incomplete.");
    }

    return RoomPlayerUpdateResponseSchema.parse(
      await registerRoomPlayerForUser(fastify.pg, {
        ...identity,
        playerId,
        username,
        characterName,
        characterSheet,
        userId: user.id
      })
    );
  });

  fastify.post("/room/begin", async (request) => {
    const body = RoomBeginRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return RoomBeginResponseSchema.parse(
      await beginRoomForUser(fastify.pg, {
        ...identity,
        userId: user.id
      })
    );
  });

  fastify.post("/room/submit", async (request) => {
    const body = RoomSubmitRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const playerId = body.playerId?.trim();
    const message = body.message?.trim();
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    if (!playerId || (!message && !body.rollRequestId && !body.rollSubmissions?.length)) {
      throw createHttpError(400, "A player and message are required.");
    }

    const rollRequestId = body.rollRequestId?.trim();
    const clientMessageId = body.clientMessageId?.trim();

    return RoomSubmitResponseSchema.parse(
      await submitRoomTurnForUser(fastify.pg, {
        ...identity,
        playerId,
        message: message ?? "",
        userId: user.id,
        ...(rollRequestId ? { rollRequestId } : {}),
        ...(body.rollResult ? { rollResult: body.rollResult } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(body.rollSubmissions ? { rollSubmissions: body.rollSubmissions } : {})
      })
    );
  });
}
