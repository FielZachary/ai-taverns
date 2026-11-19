"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Message = { id: string; senderRole: "user" | "developer"; body: string; createdAt: string };
type Thread = { id: string; campaignId: string; campaignTitle: string; userEmail: string; characterName?: string; updatedAt: string; unreadForDeveloper: number; lastMessage?: Message };

export function DeveloperChatInbox({ initialThreadId }: { initialThreadId?: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const router = useRouter();

  async function load() {
    const response = await fetch("/api/internal/developer-chat", { cache: "no-store" });
    if (response.ok) setThreads((await response.json()).threads);
  }

  async function open(threadId: string) {
    const response = await fetch(`/api/internal/developer-chat?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setActive(data.thread); setMessages(data.messages); void load();
  }

  async function send() {
    if (!active || !draft.trim()) return;
    const response = await fetch(`/api/internal/developer-chat?threadId=${encodeURIComponent(active.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: draft }) });
    if (!response.ok) return;
    const data = await response.json();
    setMessages(data.messages); setActive(data.thread); setDraft(""); void load();
  }

  useEffect(() => {
    void load();
    if (initialThreadId) void open(initialThreadId);
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [initialThreadId]);

  return <main className="developer-chat-page"><aside><p className="eyebrow">Internal support</p><h1>Developer chat</h1>{threads.map((thread) => <button className={active?.id === thread.id ? "active" : ""} key={thread.id} onClick={() => { router.push(`/dev/chat/${thread.id}`); void open(thread.id); }}><strong>{thread.userEmail}</strong><span>{thread.characterName || "No character"} · {thread.campaignTitle}</span><small>{new Date(thread.updatedAt).toLocaleString()} {thread.unreadForDeveloper ? `· ${thread.unreadForDeveloper} unread` : ""}</small><em>{thread.lastMessage?.body}</em></button>)}</aside><section>{active ? <><header><p className="eyebrow">{active.campaignId}</p><h2>{active.campaignTitle}</h2><span>{active.userEmail} {active.characterName ? `· ${active.characterName}` : ""}</span></header><div className="developer-chat-messages">{messages.map((message) => <article key={message.id} className={message.senderRole}><small>{message.senderRole} · {new Date(message.createdAt).toLocaleString()}</small><p>{message.body}</p></article>)}</div><form className="developer-chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea className="developer-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Report a bug, make a suggestion, or have a little chat....." rows={3} /><button className="developer-chat-send" type="submit" aria-label="Send message" disabled={!draft.trim()} /></form></> : <p>Select a conversation.</p>}</section></main>;
}
