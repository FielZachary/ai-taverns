import { redirect } from "next/navigation";
import { NewAdventureForm } from "./new-adventure-form";
import { getOptionalUser } from "@/lib/auth";

type NewAdventurePageProps = {
  searchParams: Promise<{
    invite?: string;
  }>;
};

export default async function NewAdventurePage({
  searchParams
}: NewAdventurePageProps) {
  const user = await getOptionalUser();
  const { invite } = await searchParams;
  const inviteToken = invite?.trim();

  if (!user) {
    const next = inviteToken
      ? `/new-adventure?invite=${encodeURIComponent(inviteToken)}`
      : "/new-adventure";

    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return <NewAdventureForm initialInviteToken={inviteToken} />;
}
