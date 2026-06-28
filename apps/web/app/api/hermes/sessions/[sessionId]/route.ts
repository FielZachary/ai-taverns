import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import {
  archiveCampaignBySessionId,
  renameCampaignBySessionId
} from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type RenameBody = {
  title?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as RenameBody;
  const title = body.title?.trim();

  if (!title) {
    return jsonError("An adventure title is required.", 400);
  }

  try {
    const user = await requireUser();
    const campaign = await renameCampaignBySessionId(sessionId, title, user.id);

    return NextResponse.json({
      id: sessionId,
      campaignId: campaign.id,
      title: campaign.title
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Adventure could not be renamed.", 404);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;

  try {
    const user = await requireUser();
    await archiveCampaignBySessionId(sessionId, user.id);

    return NextResponse.json({ deleted: true, id: sessionId });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Adventure could not be archived.", 503);
  }
}
