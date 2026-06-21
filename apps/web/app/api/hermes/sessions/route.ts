import { NextResponse } from "next/server";
import {
  assertHermesConfigured,
  hermesFetch,
  isInternalHermesMessage,
  jsonError,
  normalizeHermesContent,
  type HermesSessionRecord
} from "@/lib/hermes";
import { listCampaignSummaries } from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 30;

type HermesSessionsResponse = {
  data?: HermesSessionRecord[];
};

function formatTime(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function normalizePreview(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  if (isInternalHermesMessage(value)) {
    return "Fill your character sheet, then press Begin Adventure.";
  }

  return normalizeHermesContent(value);
}

export async function GET() {
  try {
    const campaigns = await listCampaignSummaries();
    let hermesSessions = new Map<string, HermesSessionRecord>();

    try {
      assertHermesConfigured();

      const response = await hermesFetch(
        "/api/sessions?source=api_server&include_children=true&limit=100",
        {
          method: "GET"
        }
      );

      if (response.ok) {
        const data = (await response.json()) as HermesSessionsResponse;
        hermesSessions = new Map(
          (data.data ?? [])
            .filter((session) => session.id)
            .map((session) => [session.id as string, session])
        );
      }
    } catch (error) {
      console.error(error);
    }

    const sessions = campaigns.map((campaign) => {
      const hermesSession = hermesSessions.get(campaign.hermesSessionId);

      return {
        id: campaign.hermesSessionId,
        campaignId: campaign.id,
        title:
          campaign.title ||
          hermesSession?.title ||
          campaign.hermesSessionId ||
          "Untitled Adventure",
        preview: normalizePreview(hermesSession?.preview) || campaign.preview,
        time:
          formatTime(hermesSession?.last_active || hermesSession?.started_at) ||
          campaign.time,
        messageCount: hermesSession?.message_count ?? campaign.messageCount ?? 0
      };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error(error);
    return jsonError("Hermes sessions are unavailable.", 503);
  }
}
