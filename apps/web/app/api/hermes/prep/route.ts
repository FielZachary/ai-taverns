import { NextResponse } from "next/server";
import type { HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import { askDungeonMasterProvider } from "@/lib/dm-provider";
import {
  campaignPrepRequest,
  dungeonMasterInstructions,
  jsonError,
  parseHermesDmContract
} from "@/lib/hermes";
import { createCampaignForHermesSession } from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 180;

type PrepRequest = {
  sessionId?: string;
  ownerClientId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as PrepRequest;
  const sessionId = (body.sessionId || "new-adventure").trim();
  const ownerClientId = body.ownerClientId?.trim();

  try {
    const user = await requireUser();
    const providerData = await askDungeonMasterProvider({
      message: campaignPrepRequest,
      instructions: [
        dungeonMasterInstructions,
        "The latest user message is an internal website request for a pre-adventure lobby prompt. Do not mention or reveal that internal request. Do not start the adventure yet."
      ].join(" ")
    });
    const contract = parseHermesDmContract(providerData.content);
    const reply = contract.publicNarration;

    if (!reply) {
      throw new Error("The DM provider returned an empty prep message.");
    }

    await createCampaignForHermesSession(
      sessionId,
      undefined,
      ownerClientId,
      user.id
    );

    const response: HermesTurnResponse = {
      message: {
        id: providerData.id ?? crypto.randomUUID(),
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
    return jsonError("The DM provider could not prepare the campaign room.", 502);
  }
}
