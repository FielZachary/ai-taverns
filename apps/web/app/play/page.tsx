import { redirect } from "next/navigation";
import { GameShell } from "@/components/playing/GameShell";
import { getOptionalUser } from "@/lib/auth";

type PlayPageProps = {
  searchParams: Promise<{
    campaignId?: string;
    intro?: string;
  }>;
};

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const user = await getOptionalUser();
  const { campaignId, intro } = await searchParams;

  if (!user) {
    const nextParams: string[] = [];

    if (campaignId) {
      nextParams.push(`campaignId=${encodeURIComponent(campaignId)}`);
    }

    if (intro) {
      nextParams.push(`intro=${encodeURIComponent(intro)}`);
    }

    const nextQuery = nextParams.join("&");
    const next = nextQuery ? `/play?${nextQuery}` : "/play";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <GameShell
      initialBackstoryIntro={intro === "backstory"}
      initialCampaignId={campaignId}
      userEmail={user.email}
    />
  );
}
