import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { submitRoomTurn } from "@/lib/room-store";
import { jsonError } from "@/lib/hermes";
import type { DiceRollResult } from "@/lib/game-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type SubmitTurnBody = {
  roomId?: string;
  sessionId?: string;
  playerId?: string;
  message?: string;
  rollRequestId?: string;
  rollResult?: DiceRollResult;
  clientMessageId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SubmitTurnBody;
  const playerId = body.playerId?.trim();
  const message = body.message?.trim();
  const rollRequestId = body.rollRequestId?.trim();
  const clientMessageId = body.clientMessageId?.trim();
  const sessionId = body.sessionId?.trim() || "new-adventure";
  const roomId = body.roomId?.trim() || sessionId;

  if (!playerId || (!message && !rollRequestId)) {
    return jsonError("A player and message are required.", 400);
  }

  try {
    const user = await requireUser();
    return NextResponse.json(
      await submitRoomTurn(
        roomId,
        sessionId,
        playerId,
        message ?? "",
        user.id,
        rollRequestId,
        body.rollResult,
        clientMessageId
      )
    );
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "The room turn could not be sent.",
      502
    );
  }
}
