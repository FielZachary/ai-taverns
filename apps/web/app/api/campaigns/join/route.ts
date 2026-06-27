import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { joinCampaignByCode } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JoinCampaignBody = {
  gameCode?: string;
  clientId?: string;
  username?: string;
  characterName?: string;
  characterSheet?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as JoinCampaignBody;

  try {
    const user = await requireUser();
    const campaign = await joinCampaignByCode({
      gameCode: body.gameCode ?? "",
      clientId: body.clientId ?? "",
      username: body.username ?? "",
      characterName: body.characterName ?? "",
      characterSheet: body.characterSheet ?? "",
      userId: user.id
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    console.error(error);
    return jsonError("Game could not be joined.", 500);
  }
}
