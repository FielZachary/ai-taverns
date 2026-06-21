import { NextResponse } from "next/server";
import {
  assertHermesConfigured,
  hermesFetch,
  jsonError
} from "@/lib/hermes";
import {
  archiveCampaignBySessionId,
  renameCampaignBySessionId
} from "@/lib/room-store";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type RenameBody = {
  title?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as RenameBody;
  const title = body.title?.trim();

  if (!title) {
    return jsonError("An adventure title is required.", 400);
  }

  try {
    const campaign = await renameCampaignBySessionId(sessionId, title);

    return NextResponse.json({
      id: sessionId,
      campaignId: campaign.id,
      title: campaign.title
    });
  } catch (error) {
    console.error(error);
    return jsonError("Adventure could not be renamed.", 404);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;

  try {
    await archiveCampaignBySessionId(sessionId);

    try {
      assertHermesConfigured();

      const response = await hermesFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: "DELETE"
        }
      );

      if (response.status === 404) {
        return NextResponse.json({ deleted: true, id: sessionId });
      }

      if (!response.ok) {
        console.error(`Hermes delete failed with status ${response.status}.`);
        return NextResponse.json({ deleted: true, id: sessionId });
      }

      const data = (await response.json()) as { deleted?: boolean; id?: string };

      return NextResponse.json({
        deleted: data.deleted ?? true,
        id: data.id ?? sessionId
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json({ deleted: true, id: sessionId });
    }
  } catch (error) {
    console.error(error);
    return jsonError("Adventure could not be archived.", 503);
  }
}
