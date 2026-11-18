"use client";
import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  senderRole: "user" | "developer";
  body: string;
  createdAt: string;
};

export function DeveloperChatOverlay({
  campaignId,
  onClose
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const previousDeveloperIds = useRef(new Set<string>());

  async function load(playSound = false) {
    const response = await fetch(`/api/developer-chat/campaign/${campaignId}`, {
      cache: "no-store"
    });
    if (!response.ok) { setLoading(false); return; }
    const payload = await response.json() as { messages: Message[] };
    const incoming = payload.messages.filter((message) => message.senderRole === "developer" && !previousDeveloperIds.current.has(message.id));
    if (playSound && incoming.length) new Audio("/message-notif.mp3").play().catch(() => undefined);
    payload.messages.filter((message) => message.senderRole === "developer").forEach((message) => previousDeveloperIds.current.add(message.id));
    setMessages(payload.messages);
    setLoading(false);
  }

  async function send() {
    if (!draft.trim()) return;
    const response = await fetch(`/api/developer-chat/campaign/${campaignId}/messages`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: draft })
    });
    if (!response.ok) return;
    const payload = await response.json() as { messages: Message[] };
    setMessages(payload.messages); setDraft("");
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 12_000);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => { window.clearInterval(id); document.removeEventListener("keydown", key); };
  }, [campaignId]);

  return <div className="developer-chat-overlay" role="dialog" aria-modal="true" aria-label="Chat with developer">
    <button className="developer-chat-backdrop" aria-label="Close chat" onClick={onClose} />
    <section>
      <header><div><p className="eyebrow">AI Taverns support</p><h2>Chat w/ Developer</h2></div><button onClick={onClose} aria-label="Close chat">×</button></header>
      <div className="developer-chat-messages">{loading ? <p>Loading conversation…</p> : messages.length ? messages.map((message) => <article key={message.id} className={message.senderRole}><small>{message.senderRole === "developer" ? "Developer" : "You"}</small><p>{message.body}</p></article>) : <p>Ask about bugs, feedback, or your campaign.</p>}</div>
      <form className="developer-chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea className="developer-chat-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Speak, search, attack, bargain…" maxLength={4000} rows={3} />
        <button className="developer-chat-send" type="submit" aria-label="Send message" disabled={!draft.trim()} />
      </form>
    </section>
  </div>;
}
