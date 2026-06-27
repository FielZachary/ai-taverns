import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { previewCampaignJoinByCode } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewJoinBody = {
  gameCode?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as PreviewJoinBody;

  try {
    await requireUser();
    return NextResponse.json(await previewCampaignJoinByCode(body.gameCode ?? ""));
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    console.error(error);
    return jsonError("Game code could not be checked.", 500);
  }
}
