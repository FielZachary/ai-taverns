"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bug,
  ChevronsDown,
  Copy,
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
  isCraftingCampaignSummary?: boolean;
  chatBackgroundEnabled?: boolean;
  hideSendingIndicator?: boolean;
  waitingPlayers?: ChatPlayerStatus[];
  regeneratingMessageId?: string | null;
  regeneratableMessageId?: string | null;
  onInspectMap?: () => void;
  onRegenerateResponse?: (messageId: string) => void;
  onViewEldermereLore?: () => void;
};

const semanticNarrationRoles = [
  "npc",
  "place",
  "clue",
  "danger",
  "faction",
  "object",
  "em"
] as const;

type SemanticNarrationRole = (typeof semanticNarrationRoles)[number];

type SemanticNarrationPart =
  | { text: string; role?: undefined }
  | { text: string; role: SemanticNarrationRole };

function isSemanticNarrationRole(value: string): value is SemanticNarrationRole {
  return semanticNarrationRoles.includes(value as SemanticNarrationRole);
}

function parseSemanticNarrationMarkup(content: string): SemanticNarrationPart[] {
  const parts: SemanticNarrationPart[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const openingMatch = content.slice(cursor).match(/<(npc|place|clue|danger|faction|object|em)>/);

    if (!openingMatch?.index && openingMatch?.index !== 0) {
      parts.push({ text: content.slice(cursor) });
      break;
    }

    const openingIndex = cursor + openingMatch.index;
    const role = openingMatch[1];

    if (!isSemanticNarrationRole(role)) {
      parts.push({ text: content.slice(cursor, openingIndex + openingMatch[0].length) });
      cursor = openingIndex + openingMatch[0].length;
      continue;
    }

    if (openingIndex > cursor) {
      parts.push({ text: content.slice(cursor, openingIndex) });
    }

    const contentStart = openingIndex + openingMatch[0].length;
    const closingTag = `</${role}>`;
    const closingIndex = content.indexOf(closingTag, contentStart);

    if (closingIndex === -1) {
      parts.push({ text: content.slice(contentStart), role });
      break;
    }

    parts.push({ text: content.slice(contentStart, closingIndex), role });
    cursor = closingIndex + closingTag.length;
  }

  return parts.filter((part) => part.text.length > 0);
}

function renderInlineMarkdown(content: string) {
  const segments = content.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g);

  return segments.map((segment, index) => {
    const boldMatch = segment.match(/^\*\*([^*]+?)\*\*$/);

    if (boldMatch?.[1]) {
      return <strong key={`${index}-${boldMatch[1].slice(0, 16)}`}>{boldMatch[1]}</strong>;
    }

    const italicMatch = segment.match(/^\*([^*]+?)\*$/);

    if (italicMatch?.[1]) {
      return <em key={`${index}-${italicMatch[1].slice(0, 16)}`}>{italicMatch[1]}</em>;
    }

    return segment;
  });
}

function renderSemanticNarrationPart(
  part: SemanticNarrationPart,
  partIndex: number
) {
  const lines = part.text.split("\n");

  return lines.flatMap((line, lineIndex) => {
    const renderedLine = part.role === "em" ? (
      <em key={`semantic-em-${partIndex}-${lineIndex}-${line.slice(0, 16)}`}>
        {renderInlineMarkdown(line)}
      </em>
    ) : part.role ? (
      <span
        className={`message-semantic-narration message-semantic-narration-${part.role}`}
        key={`semantic-${partIndex}-${lineIndex}-${line.slice(0, 16)}`}
      >
        {renderInlineMarkdown(line)}
      </span>
    ) : (
      <span key={`plain-${partIndex}-${lineIndex}-${line.slice(0, 16)}`}>
        {renderInlineMarkdown(line)}
      </span>
    );

    return lineIndex === 0
      ? [renderedLine]
      : [<br key={`break-${partIndex}-${lineIndex}`} />, renderedLine];
  });
}

function renderInlineContentWithLineBreaks(content: string) {
  return parseSemanticNarrationMarkup(content).flatMap((part, index) =>
    renderSemanticNarrationPart(part, index)
  );
}

function playerFacingMessageContent(message: GameMessage) {
  if (message.kind !== "ask_dm_answer") {
    return message.content;
  }

  try {
    const parsed = JSON.parse(message.content.trim()) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const publicNarration = (parsed as { public_narration?: unknown })
        .public_narration;
      const answer = (parsed as { answer?: unknown }).answer;

      if (typeof publicNarration === "string" && publicNarration.trim()) {
        return publicNarration;
      }

      if (typeof answer === "string" && answer.trim()) {
        return answer;
      }
    }
  } catch {
    // Older messages may be plain prose; render them as-is.
  }

  return message.content;
}

const timestampHeaderPattern =
  /^(Midnight|Dawn|Morning|Mid-Day|Afternoon|Evening|Dusk|Night)\s+—\s+(1[0-2]|[1-9]):[0-5]\d\s+(AM|PM)$/;

function splitTimestampHeader(content: string) {
  const [firstLine = "", ...remainingLines] = content.split(/\r?\n/);
  const timestamp = firstLine.trim();

  if (!timestampHeaderPattern.test(timestamp)) {
    return { timestamp: null, narration: content };
  }

  return {
    timestamp,
    narration: remainingLines.join("\n").trimStart()
  };
}

function MessageBody({
  content
}: {
  content: string;
}) {
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
      {paragraphs.map((paragraph, index) => {
        const inventoryUpdate = paragraph.match(
          /^\*?\(?(Inventory update:\s*[\s\S]+?)\)?\*?$/
        )?.[1];

        if (inventoryUpdate) {
          return (
            <p
              className="message-inventory-update"
              key={`${index}-${inventoryUpdate.slice(0, 16)}`}
            >
              ({inventoryUpdate})
            </p>
          );
        }

        return (
          <p key={`${index}-${paragraph.slice(0, 16)}`}>
            {renderInlineContentWithLineBreaks(paragraph)}
          </p>
        );
      })}
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

function MessageAvatar({ message }: { message: GameMessage }) {
  if (message.role === "player") {
    return message.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" className="message-avatar-image" src={message.avatarUrl} />
    ) : (
      <UserRound size={18} />
    );
  }

  if (message.role === "dm") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="message-avatar-image"
        src="/avatars/dungeon-master.jpg"
      />
    );
  }

  return <Sparkles size={18} />;
}

function MessageResourceCard({
  message,
  onInspectMap,
  onViewEldermereLore
}: {
  message: GameMessage;
  onInspectMap?: () => void;
  onViewEldermereLore?: () => void;
}) {
  const resourceCard = message.resourceCard;

  if (!resourceCard) {
    return null;
  }

  return (
    <div className="message-resource-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={resourceCard.imageAlt} src={resourceCard.imageUrl} />
      <div className="message-resource-actions">
        {resourceCard.actions.includes("inspect_map") ? (
          <button type="button" onClick={onInspectMap}>
            Inspect Map
          </button>
        ) : null}
        {resourceCard.actions.includes("view_eldermere_lore") ? (
          <button type="button" onClick={onViewEldermereLore}>
            View Eldermere Lore
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StandaloneResourceMessage({
  message,
  onInspectMap,
  onViewEldermereLore
}: {
  message: GameMessage;
  onInspectMap?: () => void;
  onViewEldermereLore?: () => void;
}) {
  return (
    <article className="message-card message-resource" key={message.id}>
      <MessageResourceCard
        message={message}
        onInspectMap={onInspectMap}
        onViewEldermereLore={onViewEldermereLore}
      />
    </article>
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

function DebugValueSection({
  title,
  value
}: {
  title: string;
  value: string | number;
}) {
  const text = String(value);

  return (
    <section>
      <div className="debug-section-heading">
        <h3>{title}</h3>
        <button
          type="button"
          className="debug-copy-button"
          onClick={() => void navigator.clipboard.writeText(text)}
          aria-label={`Copy ${title}`}
          title={`Copy ${title}`}
        >
          <Copy size={14} />
          Copy
        </button>
      </div>
      <pre>{text}</pre>
    </section>
  );
}

function MessageDebugModal({
  debug,
  onClose
}: {
  debug: AiDebugInfo;
  onClose: () => void;
}) {
  const prompt = formatDebugPrompt(debug);

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
          <DebugValueSection title="Prompt Sent" value={prompt} />
          <DebugValueSection title="AI Output" value={debug.rawResponse} />
          {debug.askDmContextSelector ? (
            <>
              <DebugValueSection title="Ask DM Selector Prompt Sent" value={formatDebugPrompt(debug.askDmContextSelector)} />
              <DebugValueSection title="Ask DM Selector Output" value={debug.askDmContextSelector.rawResponse} />
              <DebugValueSection title="Ask DM Selector Parsed Output" value={formatDebugJson(debug.askDmContextSelector.parsedOutput)} />
            </>
          ) : null}
          {debug.router ? (
            <>
              <DebugValueSection title="Router Prompt Sent" value={formatDebugPrompt(debug.router)} />
              <DebugValueSection title="Router Output" value={debug.router.rawResponse} />
              <DebugValueSection title="Router Parsed Output" value={formatDebugJson(debug.router.parsedOutput)} />
            </>
          ) : null}
          {debug.postTurnUpdater ? (
            <>
              <DebugValueSection title="Post-Turn Updater Prompt Sent" value={debug.postTurnUpdater.requestMessages ? formatDebugPrompt(debug.postTurnUpdater as AiDebugInfo) : "Not recorded"} />
              <DebugValueSection title="Post-Turn Updater Output" value={debug.postTurnUpdater.rawResponse ?? "Not recorded"} />
              <DebugValueSection title="Post-Turn Updater Parsed Output" value={formatDebugJson(debug.postTurnUpdater.parsedOutput)} />
              <DebugValueSection title="Post-Turn Updater Validation" value={formatDebugJson({
                    acceptedPatches: debug.postTurnUpdater.acceptedPatches,
                    discardedPatches: debug.postTurnUpdater.discardedPatches,
                    failed: debug.postTurnUpdater.failed,
                    error: debug.postTurnUpdater.error,
                    durationMs: debug.postTurnUpdater.durationMs
                  })} />
            </>
          ) : null}
          {debug.mechanicsUpdater ? (
            <>
              <DebugValueSection title="Mechanics Executor Prompt Sent" value={debug.mechanicsUpdater.requestMessages ? formatDebugPrompt(debug.mechanicsUpdater as AiDebugInfo) : "Not recorded"} />
              <DebugValueSection title="Mechanics Executor Output" value={debug.mechanicsUpdater.rawResponse ?? "Not recorded"} />
              <DebugValueSection title="Mechanics Executor Parsed Output" value={formatDebugJson(debug.mechanicsUpdater.parsedOutput)} />
              <DebugValueSection title="Mechanics Executor Validation" value={formatDebugJson({
                    acceptedMechanicsStateUpdate:
                      debug.mechanicsUpdater.acceptedMechanicsStateUpdate,
                    acceptedInventoryPatches:
                      debug.mechanicsUpdater.acceptedInventoryPatches,
                    discardedInventoryPatches:
                      debug.mechanicsUpdater.discardedInventoryPatches,
                    noChangesNeeded: debug.mechanicsUpdater.noChangesNeeded,
                    durationMs: debug.mechanicsUpdater.durationMs
                  })} />
            </>
          ) : null}
          {debug.eldermereOpeningPlanner ? (
            <>
              <DebugValueSection title="Eldermere Planner Prompt Sent" value={formatDebugPrompt(debug.eldermereOpeningPlanner)} />
              <DebugValueSection title="Eldermere Planner Output" value={debug.eldermereOpeningPlanner.rawResponse} />
              <DebugValueSection title="Eldermere Planner Parsed Output" value={formatDebugJson(debug.eldermereOpeningPlanner.parsedOutput)} />
            </>
          ) : null}
          <DebugValueSection title="Temperature" value={debug.temperature ?? "Not recorded"} />
          <DebugValueSection title="Combat State" value={formatDebugJson(debug.combatState)} />
          <DebugValueSection title="Context Storage" value={formatDebugJson(debug.contextStorageState)} />
          {debug.livingWorldPressureEngine ? (
            <DebugValueSection title="Pressure Engine Output" value={formatDebugJson(debug.livingWorldPressureEngine)} />
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

  if (message.kind === "campaign_summary") {
    return "Campaign Summary";
  }

  return message.role === "player"
    ? playerLabel || "Player"
    : message.role === "dm"
      ? "Dungeon Master"
      : "Table";
}

const dmJobLabels = {
  scene_director: "Scene Director",
  npc_dialogue: "NPC Dialogue",
  combat: "Combat",
  rest_mechanics: "Rest Mechanics",
  death_saving_throws: "Death Saving Throws",
  clarification: "Clarification",
  out_of_character: "Out of Character"
} as const;

function messageJobLabel(message: GameMessage) {
  if (message.role !== "dm" || message.kind !== "turn") {
    return "";
  }

  const jobNeeded = message.debug?.router?.parsedOutput;

  if (!jobNeeded || typeof jobNeeded !== "object" || Array.isArray(jobNeeded)) {
    return "";
  }

  const job = (jobNeeded as { jobNeeded?: unknown }).jobNeeded;

  return typeof job === "string" && job in dmJobLabels
    ? dmJobLabels[job as keyof typeof dmJobLabels]
    : "";
}

function messageLocationLabel(message: GameMessage) {
  if (message.role !== "dm" || message.kind === "ask_dm_answer") {
    return "";
  }

  const setting = message.setting;

  if (!setting) {
    return "";
  }

  const structuredParts = [
    setting.regionName,
    setting.settlementName,
    setting.sceneLocation
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const dedupedParts = structuredParts.filter(
    (part, index) => structuredParts.indexOf(part) === index
  );

  if (dedupedParts.length > 0) {
    return dedupedParts.join(" / ");
  }

  return (
    setting.displayLocation?.trim() ||
    setting.startingLocation?.trim() ||
    setting.worldName?.trim() ||
    ""
  );
}

export function MessageLog({
  messages,
  isSending,
  isCraftingCampaignSummary = false,
  chatBackgroundEnabled = true,
  hideSendingIndicator = false,
  waitingPlayers = [],
  regeneratingMessageId,
  regeneratableMessageId,
  onInspectMap,
  onRegenerateResponse,
  onViewEldermereLore
}: MessageLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const hasPositionedInitialViewRef = useRef(false);
  const [isAtLatestMessage, setIsAtLatestMessage] = useState(true);
  const [openDebugMessageId, setOpenDebugMessageId] = useState<string | null>(
    null
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

      if (log && messages.length > 0 && !hasPositionedInitialViewRef.current) {
        log.scrollTo({ top: 0 });
        hasPositionedInitialViewRef.current = true;
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [messages.length]);

  useLayoutEffect(() => {
    const log = logRef.current;

    if (!log) {
      return;
    }

    const updateLatestMessageState = () => {
      const remainingScroll = log.scrollHeight - log.clientHeight - log.scrollTop;
      setIsAtLatestMessage(remainingScroll <= 32);
    };

    updateLatestMessageState();
    log.addEventListener("scroll", updateLatestMessageState, { passive: true });

    return () => {
      log.removeEventListener("scroll", updateLatestMessageState);
    };
  }, [messages.length]);

  const scrollToLatestMessage = () => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth"
    });
  };

  return (
    <div
      className={`message-log ${
        chatBackgroundEnabled ? "" : "chat-background-disabled"
      }`}
      aria-live="polite"
      ref={logRef}
    >
      {messages.map((message) => {
        if (message.resourceCard) {
          return (
            <StandaloneResourceMessage
              key={message.id}
              message={message}
              onInspectMap={onInspectMap}
              onViewEldermereLore={onViewEldermereLore}
            />
          );
        }

        const canRegenerateMessage =
          message.role === "dm" &&
          message.kind !== "ask_dm_answer" &&
          !message.isSyntheticIntro &&
          Boolean(onRegenerateResponse);
        const isLatestRegeneratableMessage =
          message.id === regeneratableMessageId;
        const canRewindToMessage =
          canRegenerateMessage && !isLatestRegeneratableMessage;
        const locationLabel = messageLocationLabel(message);
        const jobLabel = messageJobLabel(message);
        const messageContent = playerFacingMessageContent(message);
        const timestampedContent =
          message.role === "dm" && message.kind === "turn"
            ? splitTimestampHeader(messageContent)
            : { timestamp: null, narration: messageContent };

        return (
          <article
            className={`message-card message-${message.role} ${
              message.kind ? `message-${message.kind.replaceAll("_", "-")}` : ""
            }`}
            key={message.id}
          >
            <div className="message-icon message-icon-outside" aria-hidden="true">
              <MessageAvatar message={message} />
            </div>
            <div className="message-content">
              <div className="message-heading">
                <div className="message-icon message-icon-inline" aria-hidden="true">
                  <MessageAvatar message={message} />
                </div>
                <div className="message-label-stack">
                  <p className="message-label">
                    {messageLabel(message)}
                    {jobLabel ? (
                      <span className="message-job-label"> ({jobLabel})</span>
                    ) : null}
                  </p>
                  {locationLabel ? (
                    <p className="message-location-label">{locationLabel}</p>
                  ) : null}
                </div>
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
              {message.role === "dm" && !messageContent.trim() ? (
                <RuneLoader label={message.kind === "campaign_summary" ? "Crafting campaign summary" : "Reading the runes"} />
              ) : (
                <>
                  {timestampedContent.timestamp ? (
                    <p className="message-timestamp">
                      {timestampedContent.timestamp}
                    </p>
                  ) : null}
                  <MessageBody content={timestampedContent.narration} />
                  {message.playerFacingUpdate ? (
                    <aside className="message-mechanics-update" aria-label="Mechanics update">
                      {message.playerFacingUpdate.split("\n").map((line, index) => (
                        <p key={`${index}-${line.slice(0, 16)}`}>{line}</p>
                      ))}
                    </aside>
                  ) : null}
                </>
              )}
              <MessageResourceCard
                message={message}
                onInspectMap={onInspectMap}
                onViewEldermereLore={onViewEldermereLore}
              />
            </div>
          </article>
        );
      })}

      {waitingPlayers.map((player) => (
        <article
          className="message-card message-player message-waiting"
          key={`waiting-${player.id}`}
        >
          <div className="message-icon message-icon-outside" aria-hidden="true">
            <UserRound size={18} />
          </div>
          <div className="message-content">
            <div className="message-heading">
              <div className="message-icon message-icon-inline" aria-hidden="true">
                <UserRound size={18} />
              </div>
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

      {(isSending || isCraftingCampaignSummary) && !hideSendingIndicator ? (
        <article className="message-card message-dm">
          <div className="message-icon message-icon-outside" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="message-avatar-image"
              src="/avatars/dungeon-master.jpg"
            />
          </div>
          <div className="message-content">
            <div className="message-heading">
              <div className="message-icon message-icon-inline" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="message-avatar-image"
                  src="/avatars/dungeon-master.jpg"
                />
              </div>
              <p className="message-label">Dungeon Master</p>
            </div>
            <RuneLoader label={isCraftingCampaignSummary ? "Crafting campaign summary" : "Reading the runes"} />
          </div>
        </article>
      ) : null}
      <div aria-hidden="true" className="message-end" />
      {messages.length > 0 ? (
        <button
          type="button"
          className={`message-scroll-to-latest ${
            isAtLatestMessage ? "message-scroll-to-latest-hidden" : ""
          }`}
          onClick={scrollToLatestMessage}
          aria-label="Scroll to newest message"
          title="Scroll to newest message"
          aria-hidden={isAtLatestMessage}
          tabIndex={isAtLatestMessage ? -1 : undefined}
        >
          <ChevronsDown aria-hidden="true" size={22} strokeWidth={2.5} />
          <span>Newest</span>
        </button>
      ) : null}
      {openDebug ? (
        <MessageDebugModal
          debug={openDebug}
          onClose={() => setOpenDebugMessageId(null)}
        />
      ) : null}
    </div>
  );
}
