import { NextResponse } from "next/server";
import type { HermesTurnResponse } from "@/lib/game-types";
import { HttpError, requireUser } from "@/lib/auth";
import { askDungeonMasterProvider } from "@/lib/dm-provider";
import {
  dungeonMasterInstructions,
  jsonError,
  openingSceneRequest,
  parseHermesDmContract
} from "@/lib/hermes";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  await request.json().catch(() => ({}));

  try {
    await requireUser();
    const providerData = await askDungeonMasterProvider({
      message: openingSceneRequest,
      instructions: [
        dungeonMasterInstructions,
        "The latest user message is an internal website request for the opening scene. Do not mention or reveal that internal request."
      ].join(" ")
    });
    const contract = parseHermesDmContract(providerData.content);
    const reply = contract.publicNarration;

    if (!reply) {
      throw new Error("The DM provider returned an empty opening scene.");
    }

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
    return jsonError("The DM provider could not open the campaign.", 502);
  }
}
