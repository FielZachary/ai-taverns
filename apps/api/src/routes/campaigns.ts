import type { FastifyInstance } from "fastify";
import {
  CampaignInviteCreateParamsSchema,
  CampaignInviteCreateRequestSchema,
  CampaignInviteCreateResponseSchema,
  CampaignInviteDisableParamsSchema,
  CampaignInviteDisableResponseSchema,
  CampaignInviteListParamsSchema,
  CampaignInviteListResponseSchema,
  CampaignCreateRequestSchema,
  CampaignCreateResponseSchema,
  CampaignNpcCardUpdateParamsSchema,
  CampaignNpcCardUpdateRequestSchema,
  CampaignNpcCardUpdateResponseSchema,
  CampaignNpcCardsResponseSchema,
  CampaignJoinPreviewRequestSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinRequestSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadParamsSchema,
  CampaignReadResponseSchema,
  LobbyInviteJoinParamsSchema,
  LobbyInviteJoinRequestSchema,
  LobbyInviteJoinResponseSchema,
  LobbyInvitePreviewParamsSchema,
  LobbyInvitePreviewResponseSchema,
  type CampaignMode
} from "@ai-dnd/contracts";
import {
  createCampaignInvite,
  createCampaignForMode,
  disableCampaignInvite,
  type DungeonMasterRuntime,
  getCampaignSummaryForUser,
  joinCampaignByInvite,
  joinCampaignByCode,
  listPlayerSafeNpcCardsForCampaign,
  listCampaignInvitesForOwner,
  listCampaignSummariesForUser,
  updatePlayerSafeNpcCardMarkdown,
  previewLobbyInvite,
  previewCampaignJoinByCode
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

type CampaignRouteOptions = {
  config: ApiConfig;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

const campaignGenrePresets = [
  {
    id: "eldermere",
    label: "Eldermere",
    promptBrief:
      "Run this campaign in Eldermere, AI Taverns' flagship anchored-high-fantasy world: a world built on the bones of the fallen Second Dominion, where the gods have gone quiet, Wellglass makes the strongest magic scarce and costly, and every region is deciding what the Third Age should become."
  },
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
  const runtime = options.dmRuntime ?? {
    askProvider: askDungeonMasterProvider
  };

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
      mechanicsSeed: body.mechanicsSeed,
      userId: user.id,
      runtime
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

  fastify.get("/campaigns/:campaignId/npc-cards", async (request) => {
    const params = CampaignReadParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    const npcCards = await listPlayerSafeNpcCardsForCampaign(
      fastify.pg,
      params.campaignId
    );

    return CampaignNpcCardsResponseSchema.parse({ npcCards });
  });

  fastify.patch("/campaigns/:campaignId/npc-cards/:npcCardId", async (request) => {
    const params = CampaignNpcCardUpdateParamsSchema.parse(request.params);
    const body = CampaignNpcCardUpdateRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    await getCampaignSummaryForUser(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    const npcCard = await updatePlayerSafeNpcCardMarkdown(fastify.pg, {
      campaignId: params.campaignId,
      npcCardId: params.npcCardId,
      markdown: body.markdown
    });

    return CampaignNpcCardUpdateResponseSchema.parse({ npcCard });
  });

  fastify.get("/campaigns/:campaignId/invites", async (request) => {
    const params = CampaignInviteListParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const invites = await listCampaignInvitesForOwner(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id
    });

    return CampaignInviteListResponseSchema.parse({ invites });
  });

  fastify.post("/campaigns/:campaignId/invites", async (request, reply) => {
    const params = CampaignInviteCreateParamsSchema.parse(request.params);
    const body = CampaignInviteCreateRequestSchema.parse(request.body ?? {});
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const response = await createCampaignInvite(fastify.pg, {
      campaignId: params.campaignId,
      userId: user.id,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt
    });

    reply.status(201);
    return CampaignInviteCreateResponseSchema.parse(response);
  });

  fastify.post(
    "/campaigns/:campaignId/invites/:inviteId/disable",
    async (request) => {
      const params = CampaignInviteDisableParamsSchema.parse(request.params);
      const user = await requireAuthenticatedUser(
        fastify,
        config,
        request.cookies[config.authCookieName]
      );
      const invite = await disableCampaignInvite(fastify.pg, {
        campaignId: params.campaignId,
        inviteId: params.inviteId,
        userId: user.id
      });

      return CampaignInviteDisableResponseSchema.parse({ invite });
    }
  );

  fastify.get("/invites/:token/preview", async (request) => {
    const params = LobbyInvitePreviewParamsSchema.parse(request.params);

    await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return LobbyInvitePreviewResponseSchema.parse(
      await previewLobbyInvite(fastify.pg, params.token)
    );
  });

  fastify.post("/invites/:token/join", async (request) => {
    const params = LobbyInviteJoinParamsSchema.parse(request.params);
    const body = LobbyInviteJoinRequestSchema.parse(request.body ?? {});
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
    const campaign = await joinCampaignByInvite(fastify.pg, {
      token: params.token,
      clientId: body.clientId ?? "",
      username: body.username ?? "",
      characterName: body.characterName ?? "",
      characterSheet: body.characterSheet ?? "",
      mechanicsSeed: body.mechanicsSeed,
      userId: user.id
    });

    return LobbyInviteJoinResponseSchema.parse({ campaign });
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
      mechanicsSeed: body.mechanicsSeed,
      userId: user.id
    });

    return CampaignJoinResponseSchema.parse({ campaign });
  });
}
