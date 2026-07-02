import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/hermes";
import { listCampaignDebugTraces } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;
  const url = new URL(request.url);
  const traceId = url.searchParams.get("traceId")?.trim() || undefined;
  const limitParam = url.searchParams.get("limit")?.trim();
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const user = await requireUser();
    return NextResponse.json({
      traces: await listCampaignDebugTraces({
        campaignId,
        userId: user.id,
        traceId,
        limit
      })
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }
    return jsonError("Debug traces could not be loaded.", 503);
  }
}
