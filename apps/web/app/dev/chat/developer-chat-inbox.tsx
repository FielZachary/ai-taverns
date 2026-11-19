"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Message = { id: string; senderRole: "user" | "developer"; body: string; createdAt: string; deliveryStatus?: "sending" | "sent" };
type Thread = { id: string; campaignId: string; campaignTitle: string; userEmail: string; characterName?: string; updatedAt: string; unreadForDeveloper: number; lastMessage?: Message };

function sentTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DeveloperChatInbox({ initialThreadId }: { initialThreadId?: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const router = useRouter();

  async function load() {
    const response = await fetch("/api/internal/developer-chat", { cache: "no-store" });
    if (response.ok) setThreads((await response.json()).threads);
  }

  async function open(threadId: string) {
    const response = await fetch(`/api/internal/developer-chat?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setActive(data.thread);
    setMessages(data.messages.map((message: Message) => ({ ...message, deliveryStatus: message.senderRole === "developer" ? "sent" : undefined })));
    void load();
  }

  async function send() {
    const body = draft.trim();
    if (!active || !body || isSending) return;
    const optimisticMessage: Message = { id: `sending-${crypto.randomUUID()}`, senderRole: "developer", body, createdAt: new Date().toISOString(), deliveryStatus: "sending" };
    setMessages((current) => [...current, optimisticMessage]);
    setDraft(""); setIsSending(true);
    try {
      const response = await fetch(`/api/internal/developer-chat?threadId=${encodeURIComponent(active.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      if (!response.ok) throw new Error("Message could not be sent.");
      const data = await response.json();
      setMessages(data.messages.map((message: Message) => ({ ...message, deliveryStatus: message.senderRole === "developer" ? "sent" : undefined })));
      setActive(data.thread); void load();
    } finally { setIsSending(false); }
  }

  useEffect(() => {
    void load();
    if (initialThreadId) void open(initialThreadId);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [initialThreadId]);

  return <main className="developer-chat-page"><aside><p className="eyebrow">Internal support</p><h1>Developer chat</h1>{threads.map((thread) => <button className={active?.id === thread.id ? "active" : ""} key={thread.id} onClick={() => { router.push(`/dev/chat/${thread.id}`); void open(thread.id); }}><strong>{thread.userEmail}</strong><span>{thread.characterName || "No character"} · {thread.campaignTitle}</span><small>{new Date(thread.updatedAt).toLocaleString()} {thread.unreadForDeveloper ? `· ${thread.unreadForDeveloper} unread` : ""}</small><em>{thread.lastMessage?.body}</em></button>)}</aside><section>{active ? <><header><p className="eyebrow">{active.campaignId}</p><h2>{active.campaignTitle}</h2><span>{active.userEmail} {active.characterName ? `· ${active.characterName}` : ""}</span></header><div className="developer-chat-messages">{messages.map((message) => <article key={message.id} className={message.senderRole}><small>{message.senderRole === "developer" ? message.deliveryStatus === "sending" ? "Sending…" : `Sent · ${sentTime(message.createdAt)}` : `Player · ${sentTime(message.createdAt)}`}</small><p>{message.body}</p></article>)}</div><form className="developer-chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea className="developer-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Report a bug, make a suggestion, or have a little chat....." rows={3} /><button className="developer-chat-send" type="submit" aria-label="Send message" disabled={!draft.trim() || isSending} /></form></> : <p>Select a conversation.</p>}</section></main>;
}
