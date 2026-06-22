import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { kickRoomPlayer } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KickPlayerBody = {
  roomId?: string;
  sessionId?: string;
  playerId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as KickPlayerBody;
  const playerId = body.playerId?.trim();
  const sessionId = body.sessionId?.trim() || "new-adventure";
  const roomId = body.roomId?.trim() || sessionId;

  if (!playerId) {
    return jsonError("A player id is required.", 400);
  }

  try {
    const user = await requireUser();
    return NextResponse.json(
      await kickRoomPlayer(roomId, sessionId, playerId, user.id)
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "Player could not be removed.",
      404
    );
  }
}
