import {
  CampaignInviteCreateResponseSchema,
  CampaignInviteDisableResponseSchema,
  CampaignInviteListResponseSchema,
  CampaignCreateResponseSchema,
  CampaignNpcCardUpdateResponseSchema,
  CampaignNpcCardsResponseSchema,
  CharacterPortraitResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadResponseSchema,
  LobbyInviteJoinResponseSchema,
  LobbyInvitePreviewResponseSchema,
  type CampaignInviteCreateRequest,
  type CampaignCreateRequest,
  type CampaignNpcCard,
  type CampaignNpcCardUpdateRequest,
  type CharacterPortraitGenerateRequest,
  type CharacterPortraitUploadRequest,
  type CampaignJoinPreviewRequest,
  type CampaignJoinRequest,
  type CampaignSummary,
  type LobbyInviteJoinRequest
} from "@ai-dnd/contracts";

type Parser<T> = {
  parse(value: unknown): T;
};

type ApiErrorBody = {
  error?: string | {
    message?: string;
  };
};

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;

    if (typeof body.error === "string") {
      return body.error;
    }

    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Preserve the original fallback when an error response has no JSON body.
  }

  return fallback;
}

async function parseJsonResponse<T>(
  response: Response,
  schema: Parser<T>,
  fallbackMessage: string
): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }

  return schema.parse(await response.json());
}

export type { CampaignNpcCard, CampaignSummary };

export async function listCampaigns() {
  const response = await fetch("/api/campaigns");
  const data = await parseJsonResponse(
    response,
    CampaignListResponseSchema,
    "Campaigns could not be loaded."
  );

  return data.campaigns;
}

export async function createCampaign(input: CampaignCreateRequest) {
  const response = await fetch("/api/campaigns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const data = await parseJsonResponse(
    response,
    CampaignCreateResponseSchema,
    "The campaign could not be created."
  );

  return data.campaign;
}

export async function readCampaign(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`);
  const data = await parseJsonResponse(
    response,
    CampaignReadResponseSchema,
    "Campaign could not be loaded."
  );

  return data.campaign;
}

export async function generateCharacterPortrait(
  campaignId: string,
  input: CharacterPortraitGenerateRequest
) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/portrait/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  const data = await parseJsonResponse(
    response,
    CharacterPortraitResponseSchema,
    "Character art could not be created."
  );

  return data.campaign;
}

export async function uploadCharacterPortrait(
  campaignId: string,
  input: CharacterPortraitUploadRequest
) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/portrait/upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  const data = await parseJsonResponse(
    response,
    CharacterPortraitResponseSchema,
    "Character art could not be uploaded."
  );

  return data.campaign;
}

export async function listCampaignNpcCards(campaignId: string) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/npc-cards`
  );
  const data = await parseJsonResponse(
    response,
    CampaignNpcCardsResponseSchema,
    "NPC cards could not be loaded."
  );

  return data.npcCards;
}

export async function updateCampaignNpcCard(
  campaignId: string,
  npcCardId: string,
  input: CampaignNpcCardUpdateRequest
) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(
      campaignId
    )}/npc-cards/${encodeURIComponent(npcCardId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  const data = await parseJsonResponse(
    response,
    CampaignNpcCardUpdateResponseSchema,
    "NPC card could not be saved."
  );

  return data.npcCard;
}

export async function previewCampaignJoin(input: CampaignJoinPreviewRequest) {
  const response = await fetch("/api/campaigns/join/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return parseJsonResponse(
    response,
    CampaignJoinPreviewResponseSchema,
    "That game code could not be checked."
  );
}

export async function joinCampaign(input: CampaignJoinRequest) {
  const response = await fetch("/api/campaigns/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const data = await parseJsonResponse(
    response,
    CampaignJoinResponseSchema,
    "The game could not be joined."
  );

  return data.campaign;
}

export async function createCampaignInvite(
  campaignId: string,
  input: CampaignInviteCreateRequest = {}
) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/invites`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  const data = await parseJsonResponse(
    response,
    CampaignInviteCreateResponseSchema,
    "The invite link could not be created."
  );

  return data.invite;
}

export async function listCampaignInvites(campaignId: string) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/invites`
  );
  const data = await parseJsonResponse(
    response,
    CampaignInviteListResponseSchema,
    "Invite links could not be loaded."
  );

  return data.invites;
}

export async function disableCampaignInvite(
  campaignId: string,
  inviteId: string
) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(
      campaignId
    )}/invites/${encodeURIComponent(inviteId)}/disable`,
    {
      method: "POST"
    }
  );
  const data = await parseJsonResponse(
    response,
    CampaignInviteDisableResponseSchema,
    "The invite link could not be disabled."
  );

  return data.invite;
}

export async function previewLobbyInvite(token: string) {
  const response = await fetch(
    `/api/invites/${encodeURIComponent(token)}/preview`
  );

  return parseJsonResponse(
    response,
    LobbyInvitePreviewResponseSchema,
    "That invite link could not be checked."
  );
}

export async function joinLobbyInvite(
  token: string,
  input: LobbyInviteJoinRequest
) {
  const response = await fetch(`/api/invites/${encodeURIComponent(token)}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const data = await parseJsonResponse(
    response,
    LobbyInviteJoinResponseSchema,
    "The lobby could not be joined."
  );

  return data.campaign;
}
