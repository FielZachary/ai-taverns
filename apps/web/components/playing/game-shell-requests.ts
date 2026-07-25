import type { AiModelId, DiceRollSubmission } from "@/lib/game-types";

type CampaignRequestContext = {
  id: string;
  sessionId: string;
};

export type GameShellRequest = {
  endpoint: string;
  body: Record<string, unknown>;
};

export function buildTurnSubmissionRequest({
  campaign,
  singlePlayer,
  playerId,
  message,
  skipTurn,
  clientMessageId,
  model
}: {
  campaign: CampaignRequestContext;
  singlePlayer: boolean;
  playerId: string;
  message: string;
  skipTurn: boolean;
  clientMessageId: string;
  model: AiModelId;
}): GameShellRequest {
  if (singlePlayer) {
    return {
      endpoint: `/api/campaigns/${encodeURIComponent(campaign.id)}/solo-turn`,
      body: {
        message,
        clientMessageId,
        model
      }
    };
  }

  return {
    endpoint: "/api/room/submit",
    body: {
      roomId: campaign.id,
      sessionId: campaign.sessionId,
      playerId,
      message,
      skipTurn,
      clientMessageId,
      model
    }
  };
}

export function buildRollSubmissionRequest({
  campaign,
  singlePlayer,
  playerId,
  rollSubmissions,
  clientMessageId,
  model
}: {
  campaign: CampaignRequestContext;
  singlePlayer: boolean;
  playerId: string;
  rollSubmissions: DiceRollSubmission[];
  clientMessageId: string;
  model: AiModelId;
}): GameShellRequest {
  if (singlePlayer) {
    return {
      endpoint: `/api/campaigns/${encodeURIComponent(campaign.id)}/solo-turn`,
      body: {
        rollSubmissions,
        clientMessageId,
        model
      }
    };
  }

  return {
    endpoint: "/api/room/submit",
    body: {
      roomId: campaign.id,
      sessionId: campaign.sessionId,
      playerId,
      rollSubmissions,
      clientMessageId,
      model
    }
  };
}
