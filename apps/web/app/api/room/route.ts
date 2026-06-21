import { NextResponse } from "next/server";
import { getRoom } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRoomParams(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() || "new-adventure";
  const roomId = url.searchParams.get("roomId")?.trim() || sessionId;

  return { roomId, sessionId };
}

export async function GET(request: Request) {
  const { roomId, sessionId } = getRoomParams(request);

  return NextResponse.json(await getRoom(roomId, sessionId));
}
