import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatHistorySidebar, type ChatSummary } from "./ChatHistorySidebar";

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "chat-1",
    title: "The Ember Vault",
    preview: "You stand before a sealed bronze door.",
    ...overrides
  };
}

function renderChatHistorySidebar(
  overrides: Partial<ComponentProps<typeof ChatHistorySidebar>> = {}
) {
  const props = {
    chats: [],
    activeChatId: "",
    isLoading: false,
    isCreatingChat: false,
    onStartNewChat: vi.fn(),
    onDeleteChat: vi.fn(),
    onRenameChat: vi.fn(),
    onSelectChat: vi.fn(),
    onViewCharacterSheet: vi.fn(),
    ...overrides
  } satisfies ComponentProps<typeof ChatHistorySidebar>;

  render(<ChatHistorySidebar {...props} />);

  return props;
}

describe("ChatHistorySidebar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unreadCount: 0 })
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the loading state and disables new chat creation while creating", () => {
    const props = renderChatHistorySidebar({
      isLoading: true,
      isCreatingChat: true
    });

    const startButton = screen.getByRole("button", { name: /start new chat/i });

    expect(screen.getByLabelText(/adventures and player resources/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search adventures/i)).toBeInTheDocument();
    expect(screen.getByText("Loading adventures...")).toBeInTheDocument();
    expect(startButton).toBeDisabled();

    fireEvent.click(startButton);

    expect(props.onStartNewChat).not.toHaveBeenCalled();
  });

  it("starts a new chat and opens the character sheet action", () => {
    const props = renderChatHistorySidebar();

    fireEvent.click(screen.getByRole("button", { name: /start new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /start new campaign/i }));
    fireEvent.click(screen.getByRole("button", { name: /player resources/i }));

    expect(props.onStartNewChat).toHaveBeenCalledTimes(2);
    expect(props.onViewCharacterSheet).toHaveBeenCalledTimes(1);
  });

  it("shows the player portrait above the resources button and opens the portrait viewer", () => {
    const props = renderChatHistorySidebar({
      playerPortraitAlt: "Seraphina portrait",
      playerPortraitName: "Seraphina",
      playerPortraitUrl: "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/128.webp"
    });

    const portrait = screen.getByRole("img", { name: /seraphina portrait/i });
    const portraitButton = screen.getByRole("button", {
      name: /view player portrait/i
    });
    const resourcesButton = screen.getByRole("button", {
      name: "Player Resources"
    });

    expect(screen.getByText("Seraphina")).toHaveClass(
      "chat-sidebar-portrait-name"
    );

    expect(portrait).toHaveAttribute(
      "src",
      "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/128.webp"
    );
    expect(
      portraitButton.compareDocumentPosition(resourcesButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(portraitButton);

    expect(props.onViewCharacterSheet).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /player portrait/i })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: /seraphina portrait/i })
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("img", { name: /seraphina portrait/i })[1]
    ).toHaveAttribute(
      "src",
      "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/original.png"
    );

    fireEvent.click(
      screen.getByRole("button", { name: /close player portrait/i })
    );

    expect(
      screen.queryByRole("dialog", { name: /player portrait/i })
    ).not.toBeInTheDocument();

    fireEvent.click(resourcesButton);

    expect(props.onViewCharacterSheet).toHaveBeenCalledTimes(1);
  });

  it("shows a pending portrait placeholder while character art is generating", () => {
    renderChatHistorySidebar({
      playerPortraitStatus: "pending"
    });

    expect(screen.getByText(/generating portrait/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "this takes about 3 minutes, so don't be too surprised its taking a bit, hope its not too much of a hassle ;)"
      )
    ).toHaveClass("chat-sidebar-portrait-note");
    expect(
      screen.queryByRole("button", { name: /view player portrait/i })
    ).not.toBeInTheDocument();
  });

  it("renders chats with previews and marks the active chat", () => {
    renderChatHistorySidebar({
      activeChatId: "chat-2",
      chats: [
        chat({ id: "chat-1", title: "The Ember Vault" }),
        chat({
          id: "chat-2",
          title: "Moonlit Crossing",
          preview: "The bridge sways over black water."
        })
      ]
    });

    const activeButton = screen.getByRole("button", {
      name: /open chat: moonlit crossing/i
    });
    const activeRow = activeButton.closest(".chat-list-row");

    expect(screen.getByText("The Ember Vault")).toBeInTheDocument();
    expect(screen.getByText("The bridge sways over black water.")).toBeInTheDocument();
    expect(activeRow).toHaveClass("active");
  });

  it("routes select, delete, and rename actions to the requested chat", () => {
    const props = renderChatHistorySidebar({
      chats: [
        chat({ id: "chat-1", title: "The Ember Vault" }),
        chat({ id: "chat-2", title: "Moonlit Crossing" })
      ]
    });

    fireEvent.click(
      screen.getByRole("button", { name: /open chat: moonlit crossing/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete chat: the ember vault/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /rename chat: moonlit crossing/i })
    );

    expect(props.onSelectChat).toHaveBeenCalledWith("chat-2");
    expect(props.onDeleteChat).toHaveBeenCalledWith("chat-1");
    expect(props.onRenameChat).toHaveBeenCalledWith("chat-2");
  });

  it("supports mobile drawer close behavior", () => {
    const props = renderChatHistorySidebar({
      isMobileDrawerOpen: true,
      onCloseMobileDrawer: vi.fn(),
      chats: [chat({ id: "chat-1", title: "The Ember Vault" })]
    });

    const sidebar = screen.getByRole("dialog", {
      name: /adventures and player resources/i
    });

    expect(sidebar).toHaveClass("mobile-open");
    expect(sidebar).toHaveAttribute("aria-modal", "true");

    fireEvent.click(
      screen.getByRole("button", { name: /close adventures drawer/i })
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", { name: /open chat: the ember vault/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /player resources/i }));

    expect(props.onCloseMobileDrawer).toHaveBeenCalledTimes(4);
    expect(props.onSelectChat).toHaveBeenCalledWith("chat-1");
    expect(props.onViewCharacterSheet).toHaveBeenCalledTimes(1);
  });

  it("omits optional previews without hiding the chat action", () => {
    renderChatHistorySidebar({
      chats: [
        chat({
          id: "chat-without-preview",
          title: "Silent Hall",
          preview: undefined
        })
      ]
    });

    expect(
      screen.getByRole("button", { name: /open chat: silent hall/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("You stand before a sealed bronze door.")).not.toBeInTheDocument();
  });
});
