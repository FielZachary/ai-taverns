import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import {
  createCampaignForMode,
  listCampaignSummaries,
  type CampaignMode
} from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type CreateCampaignBody = {
  mode?: CampaignMode;
  title?: string;
  campaignGenre?: string;
  ownerClientId?: string;
  playerName?: string;
  characterName?: string;
  characterSheet?: string;
};

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      campaigns: await listCampaignSummaries(user.id)
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Campaigns could not be loaded.", 503);
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateCampaignBody;
  const mode = body.mode === "single_player" ? "single_player" : "multiplayer";
  const title = body.title?.trim();
  const campaignGenre = body.campaignGenre?.trim();
  const playerName =
    body.playerName?.trim() ||
    body.characterName?.trim() ||
    (mode === "single_player" ? "Solo Player" : "Table Owner");

  if (!title || !campaignGenre) {
    return jsonError("A campaign title and genre are required.", 400);
  }

  if (mode === "single_player" && !body.characterName?.trim()) {
    return jsonError("A character name is required for singleplayer.", 400);
  }

  try {
    const user = await requireUser();
    const campaign = await createCampaignForMode({
      mode,
      title,
      campaignGenre,
      ownerClientId: body.ownerClientId?.trim(),
      playerName,
      characterName: body.characterName?.trim(),
      characterSheet: body.characterSheet?.trim(),
      userId: user.id
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Campaign could not be created.", 502);
  }
}
