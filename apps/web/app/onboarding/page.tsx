import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";
import { getOptionalUser } from "@/lib/auth";

type OnboardingPageProps = {
  searchParams: Promise<{
    invite?: string;
  }>;
};

export default async function OnboardingPage({
  searchParams
}: OnboardingPageProps) {
  const user = await getOptionalUser();
  const { invite } = await searchParams;
  const inviteToken = invite?.trim();

  if (!user) {
    const next = inviteToken
      ? `/onboarding?invite=${encodeURIComponent(inviteToken)}`
      : "/onboarding";

    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <OnboardingForm
      initialInviteToken={inviteToken}
      userEmail={user.email}
      userId={user.id}
    />
  );
}
