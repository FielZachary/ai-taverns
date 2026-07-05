import {
  CampaignCreateResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadResponseSchema,
  type CampaignCreateRequest,
  type CampaignJoinPreviewRequest,
  type CampaignJoinRequest,
  type CampaignSummary
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

export type { CampaignSummary };

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
