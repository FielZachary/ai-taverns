import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import {
  archiveCampaignById,
  getCampaignById,
  renameCampaignById
} from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

type RenameBody = {
  title?: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const { campaignId } = await context.params;

  try {
    const user = await requireUser();
    return NextResponse.json({
      campaign: await getCampaignById(campaignId, user.id)
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Campaign could not be loaded.", 404);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const body = (await request.json()) as RenameBody;
  const title = body.title?.trim();

  if (!title) {
    return jsonError("An adventure title is required.", 400);
  }

  try {
    const user = await requireUser();
    return NextResponse.json({
      campaign: await renameCampaignById(campaignId, title, user.id)
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
  const { campaignId } = await context.params;

  try {
    const user = await requireUser();
    const campaign = await archiveCampaignById(campaignId, user.id);

    return NextResponse.json({
      deleted: true,
      id: campaign.id,
      hermesSessionId: campaign.hermes_session_id
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Adventure could not be archived.", 503);
  }
}
