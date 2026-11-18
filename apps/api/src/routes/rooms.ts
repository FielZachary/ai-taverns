import type { FastifyInstance } from "fastify";
import {
  RoomBeginRequestSchema,
  RoomBeginResponseSchema,
  RoomCombatCheatSheetGenerateRequestSchema,
  RoomCombatCheatSheetGenerateResponseSchema,
  RoomPlayerUpdateRequestSchema,
  RoomPlayerUpdateResponseSchema,
  RoomPromptOverrideDeleteRequestSchema,
  RoomPromptOverrideSaveRequestSchema,
  RoomPromptOverridesRequestSchema,
  RoomPromptOverridesResponseSchema,
  RoomReadQuerySchema,
  RoomReadResponseSchema,
  RoomReviveRequestSchema,
  RoomReviveResponseSchema,
  RoomSubmitRequestSchema,
  RoomSubmitResponseSchema
} from "@ai-dnd/contracts";
import type { HookMetric, RoomSnapshot } from "@ai-dnd/contracts";
import {
  beginRoomForUser,
  type DungeonMasterRuntime,
  getCombatCheatSheetTargetForUser,
  getRoomForUser,
  registerRoomPlayerForUser,
  reviveSinglePlayerCharacterForUser,
  saveCombatCheatSheetForUser,
  getCampaignPromptOverridesForUser,
  saveCampaignPromptOverrideForUser,
  submitRoomTurnForUser
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import type { ServerAnalytics } from "../analytics.js";
import { generateCombatCheatSheet } from "../combat-cheat-sheet.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type RoomRouteOptions = {
  config: ApiConfig;
  analytics?: ServerAnalytics;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

function messageCounts(snapshot: RoomSnapshot) {
  return {
    playerMessageCount: snapshot.messages.filter((message) => message.role === "player")
      .length,
    dmMessageCount: snapshot.messages.filter((message) => message.role === "dm")
      .length,
    totalMessageCount: snapshot.messages.length
  };
}

function latestDmMessage(snapshot: RoomSnapshot) {
  return [...snapshot.messages].reverse().find((message) => message.role === "dm");
}

function dmResponseType(snapshot: RoomSnapshot) {
  return latestDmMessage(snapshot)?.kind ?? "turn";
}

function hasStateChange(snapshot: RoomSnapshot) {
  return (
    snapshot.pendingRollRequests.length > 0 ||
    snapshot.combat.active ||
    snapshot.nextInputNeeded !== "player_actions" ||
    snapshot.inputTargets.length > 0
  );
}

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

async function publishRoomSnapshotUpdate(
  fastify: FastifyInstance,
  snapshot: RoomSnapshot
) {
  await fastify.roomRealtime.publishRoomUpdated({
    roomId: snapshot.roomId,
    updatedAt: snapshot.updatedAt
  });
}

export async function registerRoomRoutes(
  fastify: FastifyInstance,
  options: RoomRouteOptions
) {
  const { config, analytics } = options;
  const baseRuntime = options.dmRuntime ?? {
    askProvider: askDungeonMasterProvider
  };
  const runtime: DungeonMasterRuntime = {
    ...baseRuntime,
    emitDmStreamEvent(event) {
      baseRuntime.emitDmStreamEvent?.(event);
      fastify.roomRealtime.broadcast(event);
    }
  };

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
        userId: user.id,
        ...(query.debugAllMessages ? { messageLimit: null } : {})
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

    const snapshot = RoomPlayerUpdateResponseSchema.parse(
      await registerRoomPlayerForUser(fastify.pg, {
        ...identity,
        playerId,
        username,
        characterName,
        characterSheet,
        mechanicsSeed: body.mechanicsSeed,
        userId: user.id
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);

    return snapshot;
  });

  fastify.post("/room/player/combat-cheat-sheet", async (request) => {
    const body = RoomCombatCheatSheetGenerateRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const playerId = body.playerId?.trim();
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const target = await getCombatCheatSheetTargetForUser(fastify.pg, {
      ...identity,
      ...(playerId ? { playerId } : {}),
      userId: user.id
    });
    const generated = await generateCombatCheatSheet(target);
    const snapshot = RoomCombatCheatSheetGenerateResponseSchema.parse(
      await saveCombatCheatSheetForUser(fastify.pg, {
        ...identity,
        playerId: target.playerId,
        userId: user.id,
        markdown: generated.markdown,
        sourceHash: generated.sourceHash
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    analytics?.track({
      name: "Combat Cheat Sheet Generated",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: snapshot.roomId,
        campaignMode: snapshot.mode,
        characterName: target.characterName,
        className:
          target.characterSheet.match(/^Class:\s*(.+)$/im)?.[1]?.trim() ??
          undefined,
        markdownLength: generated.markdown.length
      },
      milestones: ["used_player_resources"]
    });

    return snapshot;
  });

  fastify.get("/room/prompt-overrides", async (request) => {
    const query = RoomPromptOverridesRequestSchema.parse(request.query);
    const identity = roomIdentity(query.roomId, query.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    return RoomPromptOverridesResponseSchema.parse(
      await getCampaignPromptOverridesForUser(fastify.pg, {
        ...identity,
        userId: user.id
      })
    );
  });

  fastify.put("/room/prompt-overrides", async (request) => {
    const body = RoomPromptOverrideSaveRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    return RoomPromptOverridesResponseSchema.parse(
      await saveCampaignPromptOverrideForUser(fastify.pg, {
        ...identity,
        userId: user.id,
        job: body.job,
        prompt: body.prompt
      })
    );
  });

  fastify.delete("/room/prompt-overrides", async (request) => {
    const body = RoomPromptOverrideDeleteRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    return RoomPromptOverridesResponseSchema.parse(
      await saveCampaignPromptOverrideForUser(fastify.pg, {
        ...identity,
        userId: user.id,
        job: body.job
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

    const startedAt = Date.now();
    const snapshot = RoomBeginResponseSchema.parse(
      await beginRoomForUser(fastify.pg, {
        ...identity,
        userId: user.id,
        runtime
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    analytics?.track({
      name: "Multiplayer Adventure Begun",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: snapshot.roomId,
        campaignMode: "multiplayer",
        responseLatencyMs: Date.now() - startedAt,
        ...messageCounts(snapshot)
      },
      milestones: ["multiplayer_adventure_begun"]
    });

    return snapshot;
  });

  fastify.post("/room/submit", async (request) => {
    const body = RoomSubmitRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const playerId = body.playerId?.trim();
    const message = body.message?.trim();
    const skipTurn = Boolean(body.skipTurn);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    if (
      !playerId ||
      (!message && !skipTurn && !body.rollRequestId && !body.rollSubmissions?.length)
    ) {
      throw createHttpError(400, "A player and message are required.");
    }

    const rollRequestId = body.rollRequestId?.trim();
    const clientMessageId = body.clientMessageId?.trim();

    const startedAt = Date.now();
    const snapshot = RoomSubmitResponseSchema.parse(
      await submitRoomTurnForUser(fastify.pg, {
        ...identity,
        playerId,
        message: message ?? "",
        userId: user.id,
        runtime,
        skipTurn,
        ...(rollRequestId ? { rollRequestId } : {}),
        ...(body.rollResult ? { rollResult: body.rollResult } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(body.model ? { model: body.model } : {}),
        ...(body.rollSubmissions ? { rollSubmissions: body.rollSubmissions } : {})
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    const counts = messageCounts(snapshot);
    const rollSubmissionCount = body.rollSubmissions?.length ?? 0;
    const milestones = [
      ...(counts.playerMessageCount === 1 ? (["first_player_message"] as const) : []),
      ...(counts.playerMessageCount === 5 ? (["five_player_messages"] as const) : []),
      ...(rollSubmissionCount > 0 ? (["dice_submitted"] as const) : [])
    ];
    const dmMilestones: HookMetric[] =
      counts.dmMessageCount === 5 ? ["five_dm_responses"] : [];

    const playerTurnProperties = {
      userId: user.id,
      campaignId: snapshot.roomId,
      campaignMode: "multiplayer" as const,
      messageLength: message?.length ?? 0,
      turnNumber: counts.playerMessageCount,
      model: body.model,
      skipTurn,
      hasDiceRequest: snapshot.pendingRollRequests.length > 0,
      diceSubmissionCount: rollSubmissionCount,
      rollType: rollSubmissionCount > 0 ? "dm_requested_roll" : undefined,
      requestedByDm: rollSubmissionCount > 0,
      combatActive: snapshot.combat.active,
      responseLatencyMs: Date.now() - startedAt,
      hasStateChange: hasStateChange(snapshot),
      ...counts
    };

    analytics?.track({
      name: rollSubmissionCount > 0 ? "Dice Roll Submitted" : "Player Message Sent",
      distinctId: `user:${user.id}`,
      properties: playerTurnProperties,
      milestones
    });
    if (counts.playerMessageCount === 1) {
      analytics?.track({
        name: "First Player Message Sent",
        distinctId: `user:${user.id}`,
        properties: playerTurnProperties
      });
    }

    if (snapshot.messages.some((roomMessage) => roomMessage.role === "dm")) {
      analytics?.track({
        name: "DM Response Received",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          campaignId: snapshot.roomId,
          campaignMode: "multiplayer",
          hasDiceRequest: snapshot.pendingRollRequests.length > 0,
          combatActive: snapshot.combat.active,
          responseLatencyMs: Date.now() - startedAt,
          responseType: dmResponseType(snapshot),
          hasStateChange: hasStateChange(snapshot),
          ...counts
        },
        milestones: dmMilestones
      });
    }

    return snapshot;
  });

  fastify.post("/room/revive", async (request) => {
    const body = RoomReviveRequestSchema.parse(request.body);
    const identity = roomIdentity(body.roomId, body.sessionId);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const snapshot = RoomReviveResponseSchema.parse(
      await reviveSinglePlayerCharacterForUser(fastify.pg, {
        campaignId: identity.roomId,
        userId: user.id
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    analytics?.track({
      name: "Character Revived",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: snapshot.roomId,
        campaignMode: snapshot.mode,
        ...messageCounts(snapshot)
      }
    });

    return snapshot;
  });
}
