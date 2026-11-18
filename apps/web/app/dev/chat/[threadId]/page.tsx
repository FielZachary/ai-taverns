import { redirect } from "next/navigation";
import { isDeveloperChatAuthenticated } from "@/lib/developer-chat-auth";
import { DeveloperChatInbox } from "../developer-chat-inbox";
export default async function DeveloperChatThreadPage({ params }: { params: Promise<{ threadId: string }> }) { if (!process.env.DEV_CHAT_PASSWORD) redirect("/play"); if (!(await isDeveloperChatAuthenticated())) redirect("/dev/chat/login"); const { threadId } = await params; return <DeveloperChatInbox initialThreadId={threadId} />; }
