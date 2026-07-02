import { Pencil, Plus, ScrollText, Search, Trash2 } from "lucide-react";

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
  onStartNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onSelectChat: (chatId: string) => void;
  onViewCharacterSheet: () => void;
};

export function ChatHistorySidebar({
  chats,
  activeChatId,
  isLoading,
  isCreatingChat,
  onStartNewChat,
  onDeleteChat,
  onRenameChat,
  onSelectChat,
  onViewCharacterSheet
}: ChatHistorySidebarProps) {
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
        <button type="button" onClick={onViewCharacterSheet}>
          <ScrollText size={18} />
          View Character Sheet
        </button>
      </div>
    </aside>
  );
}
