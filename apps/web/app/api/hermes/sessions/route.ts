import { NextResponse } from "next/server";
import {
  HttpError,
  requireUser
} from "@/lib/auth";
import {
  jsonError,
} from "@/lib/hermes";
import { listCampaignSummaries } from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 30;

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

export async function GET() {
  try {
    const user = await requireUser();
    const campaigns = await listCampaignSummaries(user.id);

    const sessions = campaigns.map((campaign) => {
      return {
        id: campaign.hermesSessionId,
        campaignId: campaign.id,
        title:
          campaign.title ||
          campaign.hermesSessionId ||
          "Untitled Adventure",
        preview: campaign.preview,
        time: formatTime(campaign.time) || campaign.time,
        messageCount: campaign.messageCount ?? 0
      };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Adventure sessions are unavailable.", 503);
  }
}
