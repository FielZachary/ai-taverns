import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { regenerateCampaignResponse } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

type RegenerateBody = {
  messageId?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const body = (await request.json()) as RegenerateBody;
  const messageId = body.messageId?.trim();

  if (!messageId) {
    return jsonError("A DM response is required.", 400);
  }

  try {
    const user = await requireUser();
    return NextResponse.json(
      await regenerateCampaignResponse(campaignId, messageId, user.id)
    );
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error
        ? error.message
        : "The response could not be regenerated.",
      502
    );
  }
}
