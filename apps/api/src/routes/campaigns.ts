import type { FastifyInstance } from "fastify";
import {
  CampaignCreateRequestSchema,
  CampaignCreateResponseSchema,
  CampaignJoinPreviewRequestSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinRequestSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadParamsSchema,
  CampaignReadResponseSchema,
  type CampaignMode
} from "@ai-dnd/contracts";
import {
  createCampaignForMode,
  getCampaignSummaryForUser,
  joinCampaignByCode,
  listCampaignSummariesForUser,
  previewCampaignJoinByCode
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

type CampaignRouteOptions = {
  config: ApiConfig;
};

const campaignGenrePresets = [
  {
    id: "classic_fantasy",
    label: "Classic Fantasy",
    promptBrief:
      "Run this as a classic fantasy campaign with ancient ruins, strange magic, mythic quests, clear heroism, wondrous danger, and room for tavern-born adventure."
  },
  {
    id: "dark_fantasy",
    label: "Dark Fantasy",
    promptBrief:
      "Run this as a dark fantasy campaign with curses, hard bargains, haunted places, moral pressure, ominous magic, and danger that feels intimate rather than gratuitous."
  },
  {
    id: "high_adventure",
    label: "High Adventure",
    promptBrief:
      "Run this as a high adventure campaign with bold heroes, wild travel, ancient threats, kinetic action, colorful allies, and sweeping stakes that invite decisive choices."
  },
  {
    id: "mystery",
    label: "Mystery",
    promptBrief:
      "Run this as a fantasy mystery campaign with secrets, suspects, layered clues, social tension, hidden motives, and discoveries that reward careful attention."
  }
] as const;

function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function getCampaignGenrePreset(presetId: string | undefined) {
  return campaignGenrePresets.find((preset) => preset.id === presetId);
}

export async function registerCampaignRoutes(
  fastify: FastifyInstance,
  options: CampaignRouteOptions
) {
  const { config } = options;

  fastify.get("/campaigns", async (request) => {
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const response = {
      campaigns: await listCampaignSummariesForUser(fastify.pg, user.id)
    };

    return CampaignListResponseSchema.parse(response);
  });

  fastify.post("/campaigns", async (request, reply) => {
    const body = CampaignCreateRequestSchema.parse(request.body);
    const mode: CampaignMode =
      body.mode === "single_player" ? "single_player" : "multiplayer";
    const campaignGenreKind =
      body.campaignGenreKind === "custom" ? "custom" : "preset";
    const customWorldName = body.customWorldName?.trim();
    const campaignGenrePresetId = body.campaignGenrePresetId?.trim();
    const campaignGenrePreset = getCampaignGenrePreset(campaignGenrePresetId);
    const campaignGenre =
      campaignGenreKind === "custom"
        ? body.campaignGenre?.trim() || "Custom World"
        : campaignGenrePreset?.label;
    const campaignGenrePromptBrief =
      campaignGenreKind === "custom"
        ? body.customWorldDescription?.trim()
        : campaignGenrePreset?.promptBrief;
    const customWorldDescription = body.customWorldDescription?.trim();
    const title =
      body.title?.trim() ||
      (campaignGenreKind === "custom"
        ? customWorldName
        : campaignGenre
          ? `${campaignGenre} Adventure`
          : undefined);
    const playerName =
      body.playerName?.trim() ||
      body.characterName?.trim() ||
      (mode === "single_player" ? "Solo Player" : "Table Owner");

    if (!title || !campaignGenre || !campaignGenrePromptBrief) {
      throw createHttpError(400, "A campaign genre is required.");
    }

    if (
      campaignGenreKind === "custom" &&
      (!customWorldName || !customWorldDescription)
    ) {
      throw createHttpError(
        400,
        "A custom world name and description are required."
      );
    }

    if (mode === "single_player" && !body.characterName?.trim()) {
      throw createHttpError(
        400,
        "A character name is required for singleplayer."
      );
    }

    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await createCampaignForMode(fastify.pg, {
      mode,
      title,
      campaignGenre,
      campaignGenreKind,
      campaignGenrePresetId,
      campaignGenrePromptBrief,
      customWorldName,
      customWorldDescription,
      ownerClientId: body.ownerClientId?.trim(),
      playerName,
      characterName: body.characterName?.trim(),
      characterSheet: body.characterSheet?.trim(),
      userId: user.id
    });

    reply.status(201);
    return CampaignCreateResponseSchema.parse({ campaign });
  });

  fastify.get("/campaigns/:campaignId", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    return CampaignReadResponseSchema.parse({ campaign });
  });

  fastify.post("/campaigns/join/preview", async (request) => {
    const body = CampaignJoinPreviewRequestSchema.parse(request.body);

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return CampaignJoinPreviewResponseSchema.parse(
      await previewCampaignJoinByCode(fastify.pg, body.gameCode ?? "")
    );
  });

  fastify.post("/campaigns/join", async (request) => {
    const body = CampaignJoinRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await joinCampaignByCode(fastify.pg, {
      gameCode: body.gameCode ?? "",
      clientId: body.clientId ?? "",
      username: body.username ?? "",
      characterName: body.characterName ?? "",
      characterSheet: body.characterSheet ?? "",
      userId: user.id
    });

    return CampaignJoinResponseSchema.parse({ campaign });
  });
}
