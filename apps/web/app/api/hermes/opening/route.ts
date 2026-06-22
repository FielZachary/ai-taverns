import { NextResponse } from "next/server";
import type { HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import {
  assertHermesConfigured,
  dungeonMasterInstructions,
  ensureHermesSession,
  hermesFetch,
  jsonError,
  normalizeHermesContent,
  openingSceneRequest
} from "@/lib/hermes";

export const runtime = "nodejs";
export const maxDuration = 180;

type OpeningRequest = {
  sessionId?: string;
};

type HermesSessionChatResponse = {
  message?: {
    content?: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as OpeningRequest;
  const sessionId = (body.sessionId || "new-adventure").trim();

  try {
    await requireUser();
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
          message: openingSceneRequest,
          instructions: [
            dungeonMasterInstructions,
            "The latest user message is an internal website request for the opening scene. Do not mention or reveal that internal request."
          ].join(" ")
        })
      }
    );

    if (!hermesResponse.ok) {
      throw new Error(`Hermes opening failed with status ${hermesResponse.status}.`);
    }

    const hermesData =
      (await hermesResponse.json()) as HermesSessionChatResponse;
    const reply = normalizeHermesContent(hermesData.message?.content);

    if (!reply) {
      throw new Error("Hermes returned an empty opening scene.");
    }

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
    return jsonError("Hermes could not open the campaign.", 502);
  }
}
