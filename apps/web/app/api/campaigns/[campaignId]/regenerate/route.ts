import { proxyJsonToFastify } from "@/lib/fastify-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { campaignId } = await context.params;

  return proxyJsonToFastify(
    request,
    `/api/campaigns/${encodeURIComponent(campaignId)}/regenerate`
  );
}
