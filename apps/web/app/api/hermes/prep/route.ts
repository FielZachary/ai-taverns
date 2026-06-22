import { NextResponse } from "next/server";
import type { HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import {
  assertHermesConfigured,
  campaignPrepRequest,
  dungeonMasterInstructions,
  ensureHermesSession,
  hermesFetch,
  jsonError,
  normalizeHermesContent
} from "@/lib/hermes";
import { createCampaignForHermesSession } from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 180;

type PrepRequest = {
  sessionId?: string;
  ownerClientId?: string;
};

type HermesSessionChatResponse = {
  message?: {
    content?: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as PrepRequest;
  const sessionId = (body.sessionId || "new-adventure").trim();
  const ownerClientId = body.ownerClientId?.trim();

  try {
    const user = await requireUser();
    assertHermesConfigured();
    await ensureHermesSession(sessionId);

    const hermesResponse = await hermesFetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/chat`,
      {
        method: "POST",
        headers: {
          "X-Hermes-Session-Key": `ai-dnd:${sessionId}`
        },
        body: JSON.stringify({
          message: campaignPrepRequest,
          instructions: [
            dungeonMasterInstructions,
            "The latest user message is an internal website request for a pre-adventure lobby prompt. Do not mention or reveal that internal request. Do not start the adventure yet."
          ].join(" ")
        })
      }
    );

    if (!hermesResponse.ok) {
      throw new Error(`Hermes prep failed with status ${hermesResponse.status}.`);
    }

    const hermesData =
      (await hermesResponse.json()) as HermesSessionChatResponse;
    const reply = normalizeHermesContent(hermesData.message?.content);

    if (!reply) {
      throw new Error("Hermes returned an empty prep message.");
    }

    await createCampaignForHermesSession(
      sessionId,
      undefined,
      ownerClientId,
      user.id
    );

    const response: HermesTurnResponse = {
      message: {
        id: crypto.randomUUID(),
        role: "dm",
        content: reply,
        createdAt: new Date().toISOString()
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Hermes could not prepare the campaign room.", 502);
  }
}
