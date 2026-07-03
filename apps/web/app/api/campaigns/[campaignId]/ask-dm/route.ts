import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { askDungeonMasterQuestion } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

type AskDmBody = {
  question?: string;
  clientMessageId?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const body = (await request.json()) as AskDmBody;
  const question = body.question?.trim();
  const clientMessageId = body.clientMessageId?.trim();

  if (!question) {
    return jsonError("A question is required.", 400);
  }

  try {
    const user = await requireUser();

    return NextResponse.json(
      await askDungeonMasterQuestion(
        campaignId,
        question,
        user.id,
        clientMessageId
      )
    );
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(
      error instanceof Error ? error.message : "The DM could not answer.",
      502
    );
  }
}
