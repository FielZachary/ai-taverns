import { NextResponse } from "next/server";
import {
  assertCampaignAccessBySessionId,
  HttpError,
  requireUser
} from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { listCampaignMessagesBySessionId } from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;

  try {
    const user = await requireUser();
    await assertCampaignAccessBySessionId(sessionId, user.id);
    const messages = await listCampaignMessagesBySessionId(sessionId);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Adventure messages are unavailable.", 503);
  }
}
