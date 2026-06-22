import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { claimGuestStateForUser } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimGuestStateBody = {
  clientId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ClaimGuestStateBody;
  const clientId = body.clientId?.trim();

  if (!clientId) {
    return jsonError("A client id is required.", 400);
  }

  try {
    const user = await requireUser();
    const result = await claimGuestStateForUser(clientId, user.id);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    console.error(error);
    return jsonError("Guest campaigns could not be claimed.", 500);
  }
}
