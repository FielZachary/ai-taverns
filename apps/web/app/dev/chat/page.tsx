import { redirect } from "next/navigation";
import { isDeveloperChatAuthenticated } from "@/lib/developer-chat-auth";
import { DeveloperChatInbox } from "./developer-chat-inbox";

export default async function DeveloperChatPage() {
  if (!process.env.DEV_CHAT_PASSWORD) redirect("/play");
  if (!(await isDeveloperChatAuthenticated())) redirect("/dev/chat/login");
  return <DeveloperChatInbox />;
}
