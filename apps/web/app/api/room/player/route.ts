import { NextResponse } from "next/server";
import { getOptionalUser, HttpError } from "@/lib/auth";
import { registerRoomPlayer } from "@/lib/room-store";
import { jsonError } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterPlayerBody = {
  roomId?: string;
  sessionId?: string;
  playerId?: string;
  username?: string;
  characterName?: string;
  characterSheet?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterPlayerBody;
  const playerId = body.playerId?.trim();
  const username = body.username?.trim();
  const characterName = body.characterName?.trim();
  const characterSheet = body.characterSheet?.trim();
  const sessionId = body.sessionId?.trim() || "new-adventure";
  const roomId = body.roomId?.trim() || sessionId;

  if (!playerId || !username || !characterName || !characterSheet) {
    return jsonError("Player profile is incomplete.", 400);
  }

  try {
    const user = await getOptionalUser();
    return NextResponse.json(
      await registerRoomPlayer(roomId, sessionId, {
        playerId,
        username,
        characterName,
        characterSheet
      }, user?.id)
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "Player could not join the room.",
      409
    );
  }
}
