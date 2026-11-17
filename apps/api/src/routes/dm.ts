import type { FastifyInstance } from "fastify";
import {
  CampaignAskDmRequestSchema,
  CampaignAskDmResponseSchema,
  CampaignDebugTracesQuerySchema,
  CampaignDebugTracesResponseSchema,
  CampaignReadParamsSchema,
  CampaignRegenerateRequestSchema,
  CampaignRegenerateResponseSchema,
  CampaignResumeSummaryRequestSchema,
  CampaignResumeSummaryResponseSchema,
  CampaignSoloTurnRequestSchema,
  CampaignSoloTurnResponseSchema
} from "@ai-dnd/contracts";
import type { HookMetric, RoomSnapshot } from "@ai-dnd/contracts";
import {
  askDungeonMasterQuestionForUser,
  generateCampaignResumeSummaryForUser,
  type DungeonMasterRuntime,
  listCampaignDebugTracesForUser,
  regenerateCampaignResponseForUser,
  runModularPostTurnContextJobs,
  submitSoloTurnForUser
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import type { ServerAnalytics } from "../analytics.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type DmRouteOptions = {
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

export async function registerDmRoutes(
  fastify: FastifyInstance,
  options: DmRouteOptions
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
    },
    async runPostTurnContextJobs(input) {
      if (baseRuntime.runPostTurnContextJobs) {
        await baseRuntime.runPostTurnContextJobs(input);
        return;
      }

      await runModularPostTurnContextJobs(fastify.pg, runtime, input);
    }
  };

  fastify.post("/campaigns/:campaignId/solo-turn", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const body = CampaignSoloTurnRequestSchema.parse(request.body);
    const message = body.message?.trim();
    const rollRequestId = body.rollRequestId?.trim();
    const clientMessageId = body.clientMessageId?.trim();
    const rollSubmissions = Array.isArray(body.rollSubmissions)
      ? body.rollSubmissions
      : undefined;

    if (!message && !rollRequestId && !rollSubmissions?.length) {
      throw createHttpError(400, "A player message is required.");
    }

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const startedAt = Date.now();
    const snapshot = CampaignSoloTurnResponseSchema.parse(
      await submitSoloTurnForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        message: message ?? "",
        userId: user.id,
        ...(rollRequestId ? { rollRequestId } : {}),
        ...(body.rollResult ? { rollResult: body.rollResult } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(body.model ? { model: body.model } : {}),
        ...(rollSubmissions ? { rollSubmissions } : {})
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    const counts = messageCounts(snapshot);
    const milestones = [
      ...(counts.playerMessageCount === 1 ? (["first_player_message"] as const) : []),
      ...(counts.playerMessageCount === 5 ? (["five_player_messages"] as const) : []),
      ...(rollSubmissions?.length ? (["dice_submitted"] as const) : [])
    ];
    const dmMilestones: HookMetric[] =
      counts.dmMessageCount === 5 ? ["five_dm_responses"] : [];

    const playerTurnProperties = {
      userId: user.id,
      campaignId: params.campaignId,
      campaignMode: "single_player" as const,
      messageLength: message?.length ?? 0,
      turnNumber: counts.playerMessageCount,
      model: body.model,
      hasDiceRequest: snapshot.pendingRollRequests.length > 0,
      diceSubmissionCount: rollSubmissions?.length ?? 0,
      rollType: rollSubmissions?.length ? "dm_requested_roll" : undefined,
      requestedByDm: Boolean(rollSubmissions?.length),
      combatActive: snapshot.combat.active,
      responseLatencyMs: Date.now() - startedAt,
      hasStateChange: hasStateChange(snapshot),
      ...counts
    };

    analytics?.track({
      name: rollSubmissions?.length ? "Dice Roll Submitted" : "Player Message Sent",
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
    analytics?.track({
      name: "DM Response Received",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: params.campaignId,
        campaignMode: "single_player",
        hasDiceRequest: snapshot.pendingRollRequests.length > 0,
        combatActive: snapshot.combat.active,
        responseLatencyMs: Date.now() - startedAt,
        responseType: dmResponseType(snapshot),
        hasStateChange: hasStateChange(snapshot),
        ...counts
      },
      milestones: dmMilestones
    });

    return snapshot;
  });

  fastify.post("/campaigns/:campaignId/ask-dm", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const body = CampaignAskDmRequestSchema.parse(request.body);
    const question = body.question?.trim();
    const clientMessageId = body.clientMessageId?.trim();

    if (!question) {
      throw createHttpError(400, "A question is required.");
    }

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const startedAt = Date.now();
    const snapshot = CampaignAskDmResponseSchema.parse(
      await askDungeonMasterQuestionForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        question,
        userId: user.id,
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(body.model ? { model: body.model } : {})
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    const counts = messageCounts(snapshot);
    analytics?.track({
      name: "Ask DM Submitted",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: params.campaignId,
        campaignMode: snapshot.mode,
        messageLength: question.length,
        model: body.model,
        responseLatencyMs: Date.now() - startedAt,
        responseType: dmResponseType(snapshot),
        hasStateChange: hasStateChange(snapshot),
        ...counts
      },
      milestones: ["asked_dm"]
    });

    return snapshot;
  });

  fastify.post("/campaigns/:campaignId/resume-summary", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const body = CampaignResumeSummaryRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const snapshot = CampaignResumeSummaryResponseSchema.parse(
      await generateCampaignResumeSummaryForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        userId: user.id,
        ...(body.model ? { model: body.model } : {})
      })
    );
    await publishRoomSnapshotUpdate(fastify, snapshot);
    return snapshot;
  });

  fastify.post("/campaigns/:campaignId/regenerate", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const body = CampaignRegenerateRequestSchema.parse(request.body);
    const messageId = body.messageId?.trim();

    if (!messageId) {
      throw createHttpError(400, "A DM response is required.");
    }

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    const startedAt = Date.now();
    const snapshot = CampaignRegenerateResponseSchema.parse(
      await regenerateCampaignResponseForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        messageId,
        userId: user.id
      })
    );

    await publishRoomSnapshotUpdate(fastify, snapshot);
    const counts = messageCounts(snapshot);
    analytics?.track({
      name: "Regenerate Response Submitted",
      distinctId: `user:${user.id}`,
      properties: {
        userId: user.id,
        campaignId: params.campaignId,
        campaignMode: snapshot.mode,
        responseLatencyMs: Date.now() - startedAt,
        responseType: "regenerated",
        hasStateChange: hasStateChange(snapshot),
        ...counts
      },
      milestones: ["regenerated_response"]
    });

    return snapshot;
  });

  fastify.get("/campaigns/:campaignId/debug-traces", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const query = CampaignDebugTracesQuerySchema.parse(request.query);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return CampaignDebugTracesResponseSchema.parse({
      traces: await listCampaignDebugTracesForUser(fastify.pg, {
        campaignId: params.campaignId,
        userId: user.id,
        ...(query.traceId ? { traceId: query.traceId } : {}),
        ...(query.limit ? { limit: query.limit } : {})
      })
    });
  });
}
