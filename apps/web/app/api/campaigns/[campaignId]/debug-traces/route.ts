import { proxyJsonToFastify } from "@/lib/fastify-api";

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

  return proxyJsonToFastify(
    request,
    `/api/campaigns/${encodeURIComponent(campaignId)}/debug-traces${url.search}`
  );
}
