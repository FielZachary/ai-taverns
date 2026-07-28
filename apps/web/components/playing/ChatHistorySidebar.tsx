"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";

export type ChatSummary = {
  id: string;
  campaignId?: string;
  title: string;
  preview?: string;
  time?: string;
};

type ChatHistorySidebarProps = {
  chats: ChatSummary[];
  activeChatId: string;
  isLoading: boolean;
  isCreatingChat: boolean;
  playerPortraitAlt?: string;
  playerPortraitStatus?: "pending" | "ready" | "failed";
  playerPortraitUrl?: string;
  onStartNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onSelectChat: (chatId: string) => void;
  onViewCharacterSheet: () => void;
};

function fullSizePortraitUrl(portraitUrl: string) {
  return portraitUrl.replace(/\/(?:512|128)\.webp(\?.*)?$/, "/original.png$1");
}

export function ChatHistorySidebar({
  chats,
  activeChatId,
  isLoading,
  isCreatingChat,
  playerPortraitAlt = "Player character portrait",
  playerPortraitStatus,
  playerPortraitUrl,
  onStartNewChat,
  onDeleteChat,
  onRenameChat,
  onSelectChat,
  onViewCharacterSheet
}: ChatHistorySidebarProps) {
  const [isPortraitModalOpen, setIsPortraitModalOpen] = useState(false);
  const modalPortraitUrl = playerPortraitUrl
    ? fullSizePortraitUrl(playerPortraitUrl)
    : "";

  useEffect(() => {
    if (!isPortraitModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPortraitModalOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPortraitModalOpen]);

  return (
    <aside className="chat-sidebar" aria-label="Chat history">
      <div className="chat-sidebar-history">
        <div className="chat-sidebar-header">
          <div>
            <h2 className="eyebrow adventures-title">Adventures</h2>
          </div>
          <button
            type="button"
            aria-label="Start new chat"
            disabled={isCreatingChat}
            onClick={onStartNewChat}
          >
            <Plus size={18} />
          </button>
        </div>

        <label className="chat-search">
          <Search size={17} />
          <input type="search" placeholder="Search chats" />
        </label>

        <div className="chat-list">
          {isLoading ? <p className="chat-list-empty">Loading adventures...</p> : null}
          {chats.map((chat) => (
            <div
              className={`chat-list-row ${
                chat.id === activeChatId ? "active" : ""
              }`}
              key={chat.id}
            >
              <button
                aria-label={`Open chat: ${chat.title}`}
                className="chat-list-item"
                type="button"
                onClick={() => onSelectChat(chat.id)}
              >
                <span>
                  <strong>{chat.title}</strong>
                  {chat.preview ? <small>{chat.preview}</small> : null}
                </span>
              </button>
              <div className="chat-row-actions">
                <button
                  className="chat-action-button chat-delete-button"
                  type="button"
                  aria-label={`Delete chat: ${chat.title}`}
                  onClick={() => onDeleteChat(chat.id)}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  className="chat-action-button chat-rename-button"
                  type="button"
                  aria-label={`Rename chat: ${chat.title}`}
                  onClick={() => onRenameChat(chat.id)}
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-sidebar-actions" aria-label="Table actions">
        {playerPortraitUrl ? (
          <button
            className="chat-sidebar-portrait"
            type="button"
            aria-label="View player portrait"
            onClick={() => setIsPortraitModalOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={playerPortraitUrl} alt={playerPortraitAlt} />
          </button>
        ) : playerPortraitStatus === "pending" ? (
          <div className="chat-sidebar-portrait pending" aria-live="polite">
            <span className="rune-loader">
              Generating portrait
              <span className="rune-loader-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
          </div>
        ) : null}
        <button
          className="player-resources-button"
          type="button"
          onClick={onViewCharacterSheet}
        >
          Player Resources
        </button>
      </div>

      {playerPortraitUrl && isPortraitModalOpen ? (
        <div
          className="portrait-viewer-backdrop"
          role="presentation"
          onClick={() => setIsPortraitModalOpen(false)}
        >
          <div
            aria-modal="true"
            aria-label="Player portrait"
            className="portrait-viewer-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="portrait-viewer-close"
              type="button"
              aria-label="Close player portrait"
              onClick={() => setIsPortraitModalOpen(false)}
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modalPortraitUrl} alt={playerPortraitAlt} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
