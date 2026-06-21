import { Bot, Sparkles, UserRound } from "lucide-react";
import type { GameMessage } from "@/lib/game-types";

type MessageLogProps = {
  messages: GameMessage[];
  isSending: boolean;
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

export function MessageLog({ messages, isSending }: MessageLogProps) {
  return (
    <div className="message-log" aria-live="polite">
      {messages.map((message) => (
        <article
          className={`message-card message-${message.role}`}
          key={message.id}
        >
          <div className="message-icon" aria-hidden="true">
            {message.role === "player" ? (
              <UserRound size={18} />
            ) : message.role === "dm" ? (
              <Bot size={18} />
            ) : (
              <Sparkles size={18} />
            )}
          </div>
          <div>
            <p className="message-label">
              {message.role === "player"
                ? "You"
                : message.role === "dm"
                  ? "Dungeon Master"
                  : "Table"}
            </p>
            <MessageBody content={message.content} />
          </div>
        </article>
      ))}

      {isSending ? (
        <article className="message-card message-system">
          <div className="message-icon" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="message-label">Hermes</p>
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
    </div>
  );
}
