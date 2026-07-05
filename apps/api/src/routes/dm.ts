import type { FastifyInstance } from "fastify";
import {
  CampaignAskDmRequestSchema,
  CampaignAskDmResponseSchema,
  CampaignDebugTracesQuerySchema,
  CampaignDebugTracesResponseSchema,
  CampaignReadParamsSchema,
  CampaignRegenerateRequestSchema,
  CampaignRegenerateResponseSchema,
  CampaignSoloTurnRequestSchema,
  CampaignSoloTurnResponseSchema
} from "@ai-dnd/contracts";
import {
  askDungeonMasterQuestionForUser,
  listCampaignDebugTracesForUser,
  regenerateCampaignResponseForUser,
  submitSoloTurnForUser
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type DmRouteOptions = {
  config: ApiConfig;
};

function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export async function registerDmRoutes(
  fastify: FastifyInstance,
  options: DmRouteOptions
) {
  const { config } = options;
  const runtime = {
    askProvider: askDungeonMasterProvider
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

    return CampaignSoloTurnResponseSchema.parse(
      await submitSoloTurnForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        message: message ?? "",
        userId: user.id,
        ...(rollRequestId ? { rollRequestId } : {}),
        ...(body.rollResult ? { rollResult: body.rollResult } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
        ...(rollSubmissions ? { rollSubmissions } : {})
      })
    );
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

    return CampaignAskDmResponseSchema.parse(
      await askDungeonMasterQuestionForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        question,
        userId: user.id,
        ...(clientMessageId ? { clientMessageId } : {})
      })
    );
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

    return CampaignRegenerateResponseSchema.parse(
      await regenerateCampaignResponseForUser(fastify.pg, runtime, {
        campaignId: params.campaignId,
        messageId,
        userId: user.id
      })
    );
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
