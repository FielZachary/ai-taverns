import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { InviteJoinForm } from "./invite-join-form";

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

  return <InviteJoinForm token={inviteToken} userEmail={user.email ?? ""} />;
}
