import { NextResponse } from "next/server";
import type { HermesTurnRequest, HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import {
  assertHermesConfigured,
  dungeonMasterInstructions,
  ensureHermesSession,
  extractHermesRollRequests,
  hermesFetch,
  jsonError,
  normalizeHermesDmContent
} from "@/lib/hermes";

export const runtime = "nodejs";
export const maxDuration = 180;

type HermesSessionChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<HermesTurnRequest>;
  const playerMessage = body.message?.trim();
  const sessionId = (body.sessionId || "new-adventure").trim();

  if (!playerMessage) {
    return jsonError("A player message is required.", 400);
  }

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
          message: playerMessage,
          instructions: dungeonMasterInstructions
        })
      }
    );

    if (!hermesResponse.ok) {
      throw new Error(`Hermes turn failed with status ${hermesResponse.status}.`);
    }

    const hermesData =
      (await hermesResponse.json()) as HermesSessionChatResponse;
    const reply = normalizeHermesDmContent(hermesData.message?.content);

    if (!reply) {
      throw new Error("Hermes returned an empty reply.");
    }

    const pendingRollRequests = extractHermesRollRequests(hermesData);
    const response: HermesTurnResponse = {
      message: {
        id: crypto.randomUUID(),
        role: "dm",
        content: reply,
        createdAt: new Date().toISOString()
      },
      pendingRollRequest: pendingRollRequests[0] ?? null,
      pendingRollRequests
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Hermes did not complete the turn.", 502);
  }
}
