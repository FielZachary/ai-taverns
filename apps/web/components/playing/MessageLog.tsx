"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bug, RefreshCcw, Sparkles, UserRound, X } from "lucide-react";
import type { AiDebugInfo, GameMessage } from "@/lib/game-types";

export type ChatPlayerStatus = {
  id: string;
  name: string;
  detail?: string;
  status: "waiting" | "submitted";
};

type MessageLogProps = {
  messages: GameMessage[];
  isSending: boolean;
  waitingPlayers?: ChatPlayerStatus[];
  regeneratingMessageId?: string | null;
  regeneratableMessageId?: string | null;
  onRegenerateResponse?: (messageId: string) => void;
};

function MessageBody({ content }: { content: string }) {
  const paragraphs = content
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className="message-body">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function formatDebugPrompt(debug: AiDebugInfo) {
  return debug.requestMessages
    .map(
      (message, index) =>
        `# ${index + 1}. ${message.role.toUpperCase()}\n${message.content}`
    )
    .join("\n\n");
}

function MessageDebugModal({
  debug,
  onClose
}: {
  debug: AiDebugInfo;
  onClose: () => void;
}) {
  return (
    <div className="debug-modal-backdrop" role="presentation">
      <section
        className="debug-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-modal-title"
      >
        <header className="debug-modal-header">
          <div>
            <h2 id="debug-modal-title">AI Debug</h2>
            <p>
              {[debug.model, debug.providerResponseId].filter(Boolean).join(" / ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close debug details"
          >
            <X size={18} />
          </button>
        </header>
        <div className="debug-modal-content">
          <section>
            <h3>Prompt Sent</h3>
            <pre>{formatDebugPrompt(debug)}</pre>
          </section>
          <section>
            <h3>AI Output</h3>
            <pre>{debug.rawResponse}</pre>
          </section>
        </div>
      </section>
    </div>
  );
}

export function MessageLog({
  messages,
  isSending,
  waitingPlayers = [],
  regeneratingMessageId,
  regeneratableMessageId,
  onRegenerateResponse
}: MessageLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [openDebug, setOpenDebug] = useState<AiDebugInfo | null>(null);
  const scrollKey = useMemo(
    () => messages.map((message) => message.id).join("|"),
    [messages]
  );

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const log = logRef.current;

      if (log) {
        log.scrollTo({ top: log.scrollHeight });
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [scrollKey, isSending]);

  return (
    <div className="message-log" aria-live="polite" ref={logRef}>
      {messages.map((message) => (
        <article
          className={`message-card message-${message.role}`}
          key={message.id}
        >
          <div className="message-icon" aria-hidden="true">
            {message.role === "player" ? (
              <UserRound size={18} />
            ) : message.role === "dm" ? (
              <img
                alt=""
                className="message-avatar-image"
                src="/avatars/dungeon-master.jpg"
              />
            ) : (
              <Sparkles size={18} />
            )}
          </div>
          <div>
            <div className="message-heading">
              <p className="message-label">
                {message.role === "player"
                  ? "You"
                  : message.role === "dm"
                    ? "Dungeon Master"
                    : "Table"}
              </p>
              {message.role === "dm" &&
              (message.debug || message.id === regeneratableMessageId) ? (
                <div className="message-actions">
                  {message.debug ? (
                    <button
                      type="button"
                      className="message-action-button"
                      onClick={() => setOpenDebug(message.debug ?? null)}
                      aria-label="Show AI debug details"
                      title="Show AI debug details"
                    >
                      <Bug size={15} />
                    </button>
                  ) : null}
                  {message.id === regeneratableMessageId ? (
                    <button
                      type="button"
                      className="message-action-button"
                      onClick={() => onRegenerateResponse?.(message.id)}
                      disabled={isSending || regeneratingMessageId === message.id}
                      aria-label="Regenerate AI response"
                      title="Regenerate AI response"
                    >
                      <RefreshCcw size={15} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <MessageBody content={message.content} />
          </div>
        </article>
      ))}

      {waitingPlayers.map((player) => (
        <article
          className="message-card message-player message-waiting"
          key={`waiting-${player.id}`}
        >
          <div className="message-icon" aria-hidden="true">
            <UserRound size={18} />
          </div>
          <div>
            <div className="message-heading">
              <p className="message-label">
                {player.name}
                {player.detail ? (
                  <span className="message-label-detail"> {player.detail}</span>
                ) : null}
              </p>
            </div>
            <p className="rune-loader">
              Waiting
              <span className="rune-loader-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>
        </article>
      ))}

      {isSending ? (
        <article className="message-card message-dm">
          <div className="message-icon" aria-hidden="true">
            <img
              alt=""
              className="message-avatar-image"
              src="/avatars/dungeon-master.jpg"
            />
          </div>
          <div>
            <p className="message-label">Dungeon Master</p>
            <p className="rune-loader">
              Reading the runes
              <span className="rune-loader-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>
        </article>
      ) : null}
      <div aria-hidden="true" className="message-end" />
      {openDebug ? (
        <MessageDebugModal debug={openDebug} onClose={() => setOpenDebug(null)} />
      ) : null}
    </div>
  );
}
