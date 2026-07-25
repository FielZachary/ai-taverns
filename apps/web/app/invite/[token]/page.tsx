import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const user = await getOptionalUser();
  const { token } = await params;
  const inviteToken = token ?? "";

  if (!inviteToken) {
    redirect("/new-adventure");
  }

  const invitePath = `/invite/${encodeURIComponent(inviteToken)}`;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(invitePath)}`);
  }

  redirect(`/new-adventure?invite=${encodeURIComponent(inviteToken)}`);
}
