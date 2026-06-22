import { NextResponse } from "next/server";
import {
  assertCampaignAccessBySessionId,
  HttpError,
  requireUser
} from "@/lib/auth";
import {
  assertHermesConfigured,
  hermesFetch,
  isInternalHermesMessage,
  jsonError,
  mapHermesMessage,
  type HermesMessageRecord
} from "@/lib/hermes";

export const runtime = "nodejs";
export const maxDuration = 30;

type HermesMessagesResponse = {
  data?: HermesMessageRecord[];
};

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
    assertHermesConfigured();

    const response = await hermesFetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: "GET"
      }
    );

    if (response.status === 404) {
      return NextResponse.json({ messages: [] });
    }

    if (!response.ok) {
      throw new Error(`Hermes messages failed with status ${response.status}.`);
    }

    const data = (await response.json()) as HermesMessagesResponse;
    const messages = (data.data ?? [])
      .filter(
        (message) => message.role === "user" || message.role === "assistant"
      )
      .filter((message) => !isInternalHermesMessage(message.content))
      .map(mapHermesMessage)
      .filter((message) => message.content.trim());

    return NextResponse.json({ messages });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Hermes messages are unavailable.", 503);
  }
}
