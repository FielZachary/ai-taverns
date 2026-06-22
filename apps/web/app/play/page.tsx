import { redirect } from "next/navigation";
import { GameShell } from "@/components/playing/GameShell";
import { getOptionalUser } from "@/lib/auth";

type PlayPageProps = {
  searchParams: Promise<{
    campaignId?: string;
  }>;
};

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const user = await getOptionalUser();
  const { campaignId } = await searchParams;

  if (!user) {
    const next = campaignId
      ? `/play?campaignId=${encodeURIComponent(campaignId)}`
      : "/play";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return <GameShell initialCampaignId={campaignId} userEmail={user.email} />;
}
