import type { FastifyInstance } from "fastify";
import {
  HermesPrepRequestSchema,
  HermesTurnRequestSchema,
  HermesTurnResponseSchema
} from "@ai-dnd/contracts";
import {
  createCampaignForHermesSession,
  type DungeonMasterRuntime
} from "@ai-dnd/db";
import {
  campaignPrepRequest,
  type GameMessage,
  openingSceneRequest,
  parseHermesDmContract
} from "@ai-dnd/dm";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type HermesRouteOptions = {
  config: ApiConfig;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

const hermesDungeonMasterInstructions = [
  "You are the AI Taverns DnD Dungeon Master.",
  "Return exactly one valid JSON object and no Markdown.",
  "Use public_narration for player-facing narration.",
  "Use roll_requests for player-facing dice the website must collect.",
  "Required top-level keys: public_narration, resolution_mode, roll_requests, next_input_needed, input_targets, input_policy, mechanics_state_update."
].join("\n");

function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function hermesResponseFromProvider(input: {
  id?: string | undefined;
  content: string;
  currentAction?: string | undefined;
}) {
  const contract = parseHermesDmContract(input.content, {
    ...(input.currentAction ? { currentAction: input.currentAction } : {})
  });
  const reply = contract.publicNarration;

  if (!reply) {
    throw new Error("The DM provider returned an empty reply.");
  }

  return HermesTurnResponseSchema.parse({
    message: {
      id: input.id ?? crypto.randomUUID(),
      role: "dm",
      content: reply,
      createdAt: new Date().toISOString()
    },
    pendingRollRequest: contract.rollRequests[0] ?? null,
    pendingRollRequests: contract.rollRequests,
    inputTargets: contract.inputTargets,
    inputPolicy: contract.inputPolicy
  });
}

export async function registerHermesRoutes(
  fastify: FastifyInstance,
  options: HermesRouteOptions
) {
  const { config } = options;
  const runtime = options.dmRuntime ?? {
    askProvider: askDungeonMasterProvider
  };

  fastify.post("/hermes", async (request) => {
    const body = HermesTurnRequestSchema.parse(request.body);
    const playerMessage = body.message?.trim();

    if (!playerMessage) {
      throw createHttpError(400, "A player message is required.");
    }

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const providerData = await runtime.askProvider({
      message: playerMessage,
      instructions: hermesDungeonMasterInstructions,
      currentPlayerAction: playerMessage,
      ...(body.history ? { history: body.history as GameMessage[] } : {})
    });

    return hermesResponseFromProvider({
      id: providerData.id,
      content: providerData.content,
      currentAction: playerMessage
    });
  });

  fastify.post("/hermes/opening", async (request) => {
    await HermesPrepRequestSchema.parseAsync(request.body ?? {});
    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const providerData = await runtime.askProvider({
      message: openingSceneRequest,
      instructions: [
        hermesDungeonMasterInstructions,
        "The latest user message is an internal website request for the opening scene. Do not mention or reveal that internal request."
      ].join(" ")
    });

    return hermesResponseFromProvider({
      id: providerData.id,
      content: providerData.content
    });
  });

  fastify.post("/hermes/prep", async (request) => {
    const body = HermesPrepRequestSchema.parse(request.body);
    const sessionId = body.sessionId?.trim() || "new-adventure";
    const ownerClientId = body.ownerClientId?.trim();
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const providerData = await runtime.askProvider({
      message: campaignPrepRequest,
      instructions: [
        hermesDungeonMasterInstructions,
        "The latest user message is an internal website request for a pre-adventure lobby prompt. Do not mention or reveal that internal request. Do not start the adventure yet."
      ].join(" ")
    });

    await createCampaignForHermesSession(fastify.pg, {
      sessionId,
      ...(ownerClientId ? { ownerClientId } : {}),
      ownerUserId: user.id
    });

    return hermesResponseFromProvider({
      id: providerData.id,
      content: providerData.content
    });
  });
}
