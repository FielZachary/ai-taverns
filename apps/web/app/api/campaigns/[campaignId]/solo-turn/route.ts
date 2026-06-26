import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { submitSoloTurn } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

type SoloTurnBody = {
  message?: string;
  rollRequestId?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const body = (await request.json()) as SoloTurnBody;
  const message = body.message?.trim();
  const rollRequestId = body.rollRequestId?.trim();

  if (!message && !rollRequestId) {
    return jsonError("A player message is required.", 400);
  }

  try {
    const user = await requireUser();
    return NextResponse.json(
      await submitSoloTurn(campaignId, message ?? "", user.id, rollRequestId)
    );
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "The solo turn could not be sent.",
      502
    );
  }
}
