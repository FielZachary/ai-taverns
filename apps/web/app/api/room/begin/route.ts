import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { beginRoomAdventure } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type BeginRoomBody = {
  roomId?: string;
  sessionId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as BeginRoomBody;
  const sessionId = body.sessionId?.trim() || "new-adventure";
  const roomId = body.roomId?.trim() || sessionId;

  try {
    const user = await requireUser();
    return NextResponse.json(await beginRoomAdventure(roomId, sessionId, user.id));
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error
        ? error.message
        : "The adventure could not begin.",
      400
    );
  }
}
