import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaignSummary } from "@/lib/campaign-api";
import type { GameMessage } from "@/lib/game-types";
import type { RoomSnapshot } from "./game-shell-state";

vi.mock("@/lib/campaign-api", () => ({
  listCampaigns: vi.fn()
}));

vi.mock("./ChatHistorySidebar", () => ({
  ChatHistorySidebar: ({
    chats,
    activeChatId,
    isLoading,
    onSelectChat,
    onStartNewChat,
    onViewCharacterSheet
  }: {
    chats: Array<{ id: string; title: string }>;
    activeChatId: string;
    isLoading: boolean;
    onSelectChat: (chatId: string) => void;
    onStartNewChat: () => void;
    onViewCharacterSheet: () => void;
  }) => (
    <aside aria-label="Chat history">
      {isLoading ? <p>Loading adventures...</p> : null}
      <button type="button" onClick={onStartNewChat}>
        New adventure
      </button>
      <button type="button" onClick={onViewCharacterSheet}>
        View Character Sheet
      </button>
      {chats.map((chat) => (
        <button
          aria-current={chat.id === activeChatId ? "page" : undefined}
          key={chat.id}
          onClick={() => onSelectChat(chat.id)}
          type="button"
        >
          {chat.title}
        </button>
      ))}
    </aside>
  )
}));

vi.mock("./MessageLog", () => ({
  MessageLog: ({
    messages,
    isSending,
    regeneratingMessageId,
    regeneratableMessageId,
    onRegenerateResponse
  }: {
    messages: GameMessage[];
    isSending: boolean;
    regeneratingMessageId?: string | null;
    regeneratableMessageId?: string | null;
    onRegenerateResponse?: (messageId: string) => void;
  }) => (
    <section aria-label="Message log" data-sending={String(isSending)}>
      {messages.map((message) => (
        <article key={message.id}>
          <p>{message.role}</p>
          <p>{message.content}</p>
          {message.id === regeneratableMessageId ? (
            <button
              aria-label="Regenerate AI response"
              disabled={isSending || regeneratingMessageId === message.id}
              onClick={() => onRegenerateResponse?.(message.id)}
              type="button"
            >
              Regenerate
            </button>
          ) : null}
        </article>
      ))}
    </section>
  )
}));

vi.mock("./PlayerInput", async () => {
  const React = await import("react");

  return {
    PlayerInput: React.forwardRef<
      HTMLTextAreaElement,
      {
        draft: string;
        isSending: boolean;
        canSelectAiModel?: boolean;
        onDraftChange: (value: string) => void;
        onSubmit: (event: FormEvent<HTMLFormElement>) => void;
      }
    >(function MockPlayerInput(
      { draft, isSending, canSelectAiModel, onDraftChange, onSubmit },
      ref
    ) {
      return (
        <form data-can-select-model={String(canSelectAiModel)} onSubmit={onSubmit}>
          <textarea
            aria-label="Turn draft"
            onChange={(event) => onDraftChange(event.target.value)}
            ref={ref}
            value={draft}
          />
          <button disabled={isSending || !draft.trim()} type="submit">
            Send
          </button>
        </form>
      );
    })
  };
});

vi.mock("./DiceRollReveal3D", () => ({
  DiceRollReveal3D: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete} type="button">
      Finish dice roll
    </button>
  )
}));

vi.mock("./CharacterSheetOverlay", () => ({
  CharacterSheetOverlay: ({
    characterSheet,
    onClose
  }: {
    characterSheet: string;
    onClose: () => void;
  }) => (
    <dialog open>
      <p>{characterSheet}</p>
      <button onClick={onClose} type="button">
        Close
      </button>
    </dialog>
  )
}));

import { listCampaigns } from "@/lib/campaign-api";
import { GameShell } from "./GameShell";

const listCampaignsMock = vi.mocked(listCampaigns);

const campaign = {
  id: "11111111-1111-4111-8111-111111111111",
  sessionId: "provider-session-1",
  mode: "single_player",
  title: "Lantern Below",
  preview: "A damp stone stairway waits."
} satisfies CampaignSummary;

const multiplayerCampaign = {
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: "provider-session-2",
  mode: "multiplayer",
  title: "Candlekeep Circle",
  ownerClientId: "player-1",
  preview: "Two players gather at the table.",
  joinCode: "GLOW-42"
} satisfies CampaignSummary;

function roomSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomId: campaign.id,
    mode: "single_player",
    sessionId: campaign.sessionId,
    players: [],
    messages: [
      {
        id: "dm-opening",
        role: "dm",
        content: "The lantern guttered beside the sealed door.",
        createdAt: "2026-07-12T00:00:00.000Z"
      }
    ],
    isResolving: false,
    hasBegun: true,
    pendingRollRequest: null,
    pendingRollRequests: [],
    inputTargets: [],
    inputPolicy: "all_players",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides
  };
}

function multiplayerRoomSnapshot(
  overrides: Partial<RoomSnapshot> = {}
): RoomSnapshot {
  return roomSnapshot({
    roomId: multiplayerCampaign.id,
    mode: "multiplayer",
    sessionId: multiplayerCampaign.sessionId,
    players: [
      {
        id: "player-1",
        slot: 0,
        username: "Mira",
        characterName: "Ash",
        characterSheet: "Name: Ash\nClass: Ranger",
        status: "waiting"
      },
      {
        id: "player-2",
        slot: 1,
        username: "Theo",
        characterName: "Bram",
        characterSheet: "Name: Bram\nClass: Cleric",
        status: "waiting"
      }
    ],
    messages: [],
    isResolving: false,
    hasBegun: false,
    ...overrides
  });
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, EventListener[]>();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  close() {
    return undefined;
  }
}

function responseJson(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("ai-dnd.playerId", "player-1");
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  listCampaignsMock.mockResolvedValue([campaign]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GameShell", () => {
  it("shows a turn submit failure and unlocks the input for retry", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(roomSnapshot());
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      if (
        url === `/api/campaigns/${campaign.id}/solo-turn` &&
        init?.method === "POST"
      ) {
        return responseJson(
          { error: { message: "The dungeon master lost the thread." } },
          { status: 503 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText("The lantern guttered beside the sealed door.")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Turn draft" }), {
      target: {
        value: "I test the iron handle."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        screen.getByText("The dungeon master lost the thread.")
      ).toBeInTheDocument();
    });

    const submitCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === `/api/campaigns/${campaign.id}/solo-turn` &&
        init?.method === "POST"
    );
    expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
      message: "I test the iron handle."
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Turn draft" }), {
      target: {
        value: "I try again carefully."
      }
    });

    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    expect(screen.getByLabelText("Message log")).toHaveAttribute(
      "data-sending",
      "false"
    );
  });

  it("surfaces regenerate failures without leaving the table busy", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(roomSnapshot());
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      if (
        url === `/api/campaigns/${campaign.id}/regenerate` &&
        init?.method === "POST"
      ) {
        return responseJson(
          { error: "The past refuses to change." },
          { status: 409 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText("The lantern guttered beside the sealed door.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /regenerate ai response/i })
    );

    await waitFor(() => {
      expect(screen.getByText("The past refuses to change.")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /regenerate ai response/i })
    ).toBeEnabled();
    expect(screen.getByLabelText("Message log")).toHaveAttribute(
      "data-sending",
      "false"
    );
  });

  it("shows begin-adventure failures and re-enables the start control", async () => {
    listCampaignsMock.mockResolvedValue([multiplayerCampaign]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(multiplayerRoomSnapshot());
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      if (url === "/api/room/begin" && init?.method === "POST") {
        return responseJson(
          {
            error: {
              message: "The party needs one more oath before beginning."
            }
          },
          { status: 409 }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={multiplayerCampaign.id} />);

    expect(
      await screen.findByText("The party is gathered. Let the DM open the campaign.")
    ).toBeInTheDocument();
    expect(screen.getByText("GLOW-42")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /begin adventure/i }));

    await waitFor(() => {
      expect(
        screen.getByText("The party needs one more oath before beginning.")
      ).toBeInTheDocument();
    });

    const beginCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === "/api/room/begin" && init?.method === "POST"
    );
    expect(JSON.parse(String(beginCall?.[1]?.body))).toEqual({
      roomId: multiplayerCampaign.id,
      sessionId: multiplayerCampaign.sessionId
    });
    expect(
      screen.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
    expect(screen.getByLabelText("Message log")).toHaveAttribute(
      "data-sending",
      "false"
    );
  });

  it("disables model selection for non-leader multiplayer players", async () => {
    localStorage.setItem("ai-dnd.aiModel", "qwen-3-7-flash");
    listCampaignsMock.mockResolvedValue([
      {
        ...multiplayerCampaign,
        ownerClientId: "player-2"
      }
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(multiplayerRoomSnapshot({ hasBegun: true }));
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      if (url === "/api/room/submit" && init?.method === "POST") {
        return responseJson(
          multiplayerRoomSnapshot({
            hasBegun: true,
            messages: [
              {
                id: "dm-response",
                role: "dm",
                content: "The corridor answers with dust and silence.",
                createdAt: "2026-07-12T00:00:01.000Z"
              }
            ]
          })
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={multiplayerCampaign.id} />);

    const inputForm = await screen.findByText("Send").then((button) =>
      button.closest("form")
    );

    expect(inputForm).toHaveAttribute("data-can-select-model", "false");

    fireEvent.change(screen.getByRole("textbox", { name: "Turn draft" }), {
      target: {
        value: "I listen at the sealed door."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      const submitCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input) === "/api/room/submit" && init?.method === "POST"
      );

      expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
        message: "I listen at the sealed door.",
        model: "deepseek-v4-flash"
      });
    });
  });

  it("shows realtime DM stream failures and refreshes the room state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(roomSnapshot());
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText("The lantern guttered beside the sealed door.")
    ).toBeInTheDocument();
    expect(MockWebSocket.instances).toHaveLength(1);
    const roomFetchCountBeforeFailure = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/room?")
    ).length;

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "dm_stream_failed",
        roomId: campaign.id,
        turnId: "turn-1",
        message: "The DM stream collapsed into static."
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText("The DM stream collapsed into static.")
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/room?"))
          .length
      ).toBeGreaterThan(roomFetchCountBeforeFailure);
    });
    expect(screen.getByLabelText("Message log")).toHaveAttribute(
      "data-sending",
      "false"
    );
  });
});
