import { NextResponse } from "next/server";
import type { HermesTurnRequest, HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import { askDungeonMasterProvider } from "@/lib/dm-provider";
import {
  dungeonMasterInstructions,
  jsonError,
  parseHermesDmContract
} from "@/lib/hermes";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<HermesTurnRequest>;
  const playerMessage = body.message?.trim();
  const sessionId = (body.sessionId || "new-adventure").trim();

  if (!playerMessage) {
    return jsonError("A player message is required.", 400);
  }

  try {
    await requireUser();
    const providerData = await askDungeonMasterProvider({
      message: playerMessage,
      instructions: dungeonMasterInstructions
    });
    const contract = parseHermesDmContract(providerData.content, {
      currentAction: playerMessage
    });
    const reply = contract.publicNarration;

    if (!reply) {
      throw new Error("The DM provider returned an empty reply.");
    }

    const pendingRollRequests = contract.rollRequests;
    const response: HermesTurnResponse = {
      message: {
        id: providerData.id ?? crypto.randomUUID(),
        role: "dm",
        content: reply,
        createdAt: new Date().toISOString()
      },
      pendingRollRequest: pendingRollRequests[0] ?? null,
      pendingRollRequests,
      inputTargets: contract.inputTargets,
      inputPolicy: contract.inputPolicy
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("The DM provider did not complete the turn.", 502);
  }
}
