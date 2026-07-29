"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bug,
  RefreshCcw,
  Sparkles,
  Undo2,
  UserRound,
  X
} from "lucide-react";
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
  hideSendingIndicator?: boolean;
  waitingPlayers?: ChatPlayerStatus[];
  regeneratingMessageId?: string | null;
  regeneratableMessageId?: string | null;
  onRegenerateResponse?: (messageId: string) => void;
};

function renderInlineMarkdown(content: string) {
  const segments = content.split(/(\*\*[^*]+?\*\*)/g);

  return segments.map((segment, index) => {
    const boldMatch = segment.match(/^\*\*([^*]+?)\*\*$/);

    if (boldMatch?.[1]) {
      return <strong key={`${index}-${boldMatch[1].slice(0, 16)}`}>{boldMatch[1]}</strong>;
    }

    return segment;
  });
}

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
        <p key={`${index}-${paragraph.slice(0, 16)}`}>
          {renderInlineMarkdown(paragraph)}
        </p>
      ))}
    </div>
  );
}

function RuneLoader({ label }: { label: string }) {
  return (
    <p className="rune-loader">
      {label}
      <span className="rune-loader-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </p>
  );
}

function formatDebugPrompt(debug: Pick<AiDebugInfo, "requestMessages">) {
  return debug.requestMessages
    .map(
      (message, index) =>
        `# ${index + 1}. ${message.role.toUpperCase()}\n${message.content}`
    )
    .join("\n\n");
}

function formatDebugJson(value: unknown) {
  return value === undefined ? "Not recorded" : JSON.stringify(value, null, 2);
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
          {debug.router ? (
            <>
              <section>
                <h3>Router Prompt Sent</h3>
                <pre>{formatDebugPrompt(debug.router)}</pre>
              </section>
              <section>
                <h3>Router Output</h3>
                <pre>{debug.router.rawResponse}</pre>
              </section>
              <section>
                <h3>Router Parsed Output</h3>
                <pre>{formatDebugJson(debug.router.parsedOutput)}</pre>
              </section>
            </>
          ) : null}
          {debug.eldermereOpeningPlanner ? (
            <>
              <section>
                <h3>Eldermere Planner Prompt Sent</h3>
                <pre>{formatDebugPrompt(debug.eldermereOpeningPlanner)}</pre>
              </section>
              <section>
                <h3>Eldermere Planner Output</h3>
                <pre>{debug.eldermereOpeningPlanner.rawResponse}</pre>
              </section>
              <section>
                <h3>Eldermere Planner Parsed Output</h3>
                <pre>
                  {formatDebugJson(debug.eldermereOpeningPlanner.parsedOutput)}
                </pre>
              </section>
            </>
          ) : null}
          <section>
            <h3>Temperature</h3>
            <pre>{debug.temperature ?? "Not recorded"}</pre>
          </section>
          <section>
            <h3>Combat State</h3>
            <pre>{formatDebugJson(debug.combatState)}</pre>
          </section>
          <section>
            <h3>Context Storage</h3>
            <pre>{formatDebugJson(debug.contextStorageState)}</pre>
          </section>
          {debug.livingWorldPressureEngine ? (
            <section>
              <h3>Pressure Engine Output</h3>
              <pre>{formatDebugJson(debug.livingWorldPressureEngine)}</pre>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function messageLabel(message: GameMessage) {
  const playerLabel = message.characterName?.trim() || message.playerName?.trim();

  if (message.kind === "ask_dm_question") {
    return playerLabel ? `${playerLabel} asks the DM` : "Question to DM";
  }

  if (message.kind === "ask_dm_answer") {
    return "DM Answer";
  }

  return message.role === "player"
    ? playerLabel || "Player"
    : message.role === "dm"
      ? "Dungeon Master"
      : "Table";
}

export function MessageLog({
  messages,
  isSending,
  hideSendingIndicator = false,
  waitingPlayers = [],
  regeneratingMessageId,
  regeneratableMessageId,
  onRegenerateResponse
}: MessageLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [openDebugMessageId, setOpenDebugMessageId] = useState<string | null>(
    null
  );
  const scrollKey = useMemo(
    () =>
      messages
        .map((message) => `${message.id}:${message.content.length}`)
        .join("|"),
    [messages]
  );
  const openDebug = useMemo(
    () =>
      openDebugMessageId
        ? messages.find((message) => message.id === openDebugMessageId)?.debug ?? null
        : null,
    [messages, openDebugMessageId]
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
      {messages.map((message) => {
        const canRegenerateMessage =
          message.role === "dm" &&
          message.kind !== "ask_dm_answer" &&
          Boolean(onRegenerateResponse);
        const isLatestRegeneratableMessage =
          message.id === regeneratableMessageId;
        const canRewindToMessage =
          canRegenerateMessage && !isLatestRegeneratableMessage;

        return (
          <article
            className={`message-card message-${message.role} ${
              message.kind ? `message-${message.kind.replaceAll("_", "-")}` : ""
            }`}
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
            <div className="message-content">
              <div className="message-heading">
                <p className="message-label">{messageLabel(message)}</p>
                {message.role === "dm" &&
                (message.debug || canRegenerateMessage) ? (
                  <div className="message-actions">
                    {message.debug ? (
                      <button
                        type="button"
                        className="message-action-button"
                        onClick={() => setOpenDebugMessageId(message.id)}
                        aria-label="Show AI debug details"
                        title="Show AI debug details"
                      >
                        <Bug size={15} />
                      </button>
                    ) : null}
                    {message.debug?.livingWorldPressureEngine ? (
                      <span
                        className="message-pressure-badge"
                        aria-label="Pressure engine ran"
                        title="Pressure engine ran"
                        role="img"
                      >
                        <Activity size={15} />
                      </span>
                    ) : null}
                    {canRewindToMessage ? (
                      <button
                        type="button"
                        className="message-action-button"
                        onClick={() => onRegenerateResponse?.(message.id)}
                        disabled={isSending || regeneratingMessageId === message.id}
                        aria-label="Go back to this response"
                        title="Go back to this response"
                      >
                        <Undo2 size={15} />
                      </button>
                    ) : null}
                    {isLatestRegeneratableMessage ? (
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
              {message.role === "dm" && !message.content.trim() ? (
                <RuneLoader label="Reading the runes" />
              ) : (
                <MessageBody content={message.content} />
              )}
            </div>
          </article>
        );
      })}

      {waitingPlayers.map((player) => (
        <article
          className="message-card message-player message-waiting"
          key={`waiting-${player.id}`}
        >
          <div className="message-icon" aria-hidden="true">
            <UserRound size={18} />
          </div>
          <div className="message-content">
            <div className="message-heading">
              <p className="message-label">
                {player.name}
                {player.detail ? (
                  <span className="message-label-detail"> {player.detail}</span>
                ) : null}
              </p>
            </div>
            <RuneLoader label="Waiting" />
          </div>
        </article>
      ))}

      {isSending && !hideSendingIndicator ? (
        <article className="message-card message-dm">
          <div className="message-icon" aria-hidden="true">
            <img
              alt=""
              className="message-avatar-image"
              src="/avatars/dungeon-master.jpg"
            />
          </div>
          <div className="message-content">
            <p className="message-label">Dungeon Master</p>
            <RuneLoader label="Reading the runes" />
          </div>
        </article>
      ) : null}
      <div aria-hidden="true" className="message-end" />
      {openDebug ? (
        <MessageDebugModal
          debug={openDebug}
          onClose={() => setOpenDebugMessageId(null)}
        />
      ) : null}
    </div>
  );
}
