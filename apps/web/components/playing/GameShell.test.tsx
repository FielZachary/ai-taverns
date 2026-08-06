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
  listCampaignNpcCards: vi.fn(),
  listCampaigns: vi.fn(),
  updateCampaignNpcCard: vi.fn()
}));

vi.mock("./ChatHistorySidebar", () => ({
  ChatHistorySidebar: ({
    chats,
    activeChatId,
    isLoading,
    onSelectChat,
    onStartNewChat,
    onViewCharacterSheet,
    playerPortraitStatus,
    playerPortraitUrl
  }: {
    chats: Array<{ id: string; title: string }>;
    activeChatId: string;
    isLoading: boolean;
    playerPortraitStatus?: "pending" | "ready" | "failed";
    playerPortraitUrl?: string;
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
      {playerPortraitStatus ? (
        <p>Portrait status: {playerPortraitStatus}</p>
      ) : null}
      {playerPortraitUrl ? <p>Portrait URL: {playerPortraitUrl}</p> : null}
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
    retryMessageId,
    onRegenerateResponse,
    onRetryLastTurn
  }: {
    messages: GameMessage[];
    isSending: boolean;
    regeneratingMessageId?: string | null;
    regeneratableMessageId?: string | null;
    retryMessageId?: string | null;
    onRegenerateResponse?: (messageId: string) => void;
    onRetryLastTurn?: () => void;
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
          {message.id === retryMessageId ? (
            <button onClick={onRetryLastTurn} type="button">
              Retry last turn
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

import { listCampaignNpcCards, listCampaigns } from "@/lib/campaign-api";
import { GameShell } from "./GameShell";

const listCampaignNpcCardsMock = vi.mocked(listCampaignNpcCards);
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
  listCampaignNpcCardsMock.mockResolvedValue([]);
  listCampaignsMock.mockResolvedValue([campaign]);
});

afterEach(() => {
  vi.useRealTimers();
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

  it("times out a stuck turn request and retries the last submitted message", async () => {
    let submitAttempts = 0;
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
        submitAttempts += 1;

        if (submitAttempts === 1) {
          return await new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        }

        return responseJson(
          roomSnapshot({
            messages: [
              {
                id: "player-retry",
                role: "player",
                content: "I test the iron handle.",
                createdAt: "2026-07-12T00:00:00.000Z"
              },
              {
                id: "dm-retry",
                role: "dm",
                content: "The handle turns with a reluctant scrape.",
                createdAt: "2026-07-12T00:00:01.000Z"
              }
            ]
          })
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText("The lantern guttered beside the sealed door.")
    ).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox", { name: "Turn draft" }), {
      target: {
        value: "I test the iron handle."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        screen.getByText(
          "The dungeon master wasn't able to respond to that, please press the retry button on the right to re-send your message"
        )
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Message log")).toHaveAttribute(
      "data-sending",
      "false"
    );

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "dm_stream_failed",
        roomId: campaign.id,
        turnId: "turn-timeout",
        message:
          "The operation was aborted due to timeout Trace ID: 0f27fc6e-5dbc-4b01-90ac-3d5ee2d693e4"
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(/The operation was aborted due to timeout/))
        .not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry last turn" }));

    await waitFor(() => {
      expect(screen.getByText("The handle turns with a reluctant scrape."))
        .toBeInTheDocument();
    });

    const submitBodies = fetchMock.mock.calls
      .filter(
        ([input, init]) =>
          String(input) === `/api/campaigns/${campaign.id}/solo-turn` &&
          init?.method === "POST"
      )
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(submitBodies).toHaveLength(2);
    expect(submitBodies[1]).toMatchObject({
      message: "I test the iron handle."
    });
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
    localStorage.setItem("ai-dnd.aiModel", "qwen-3-5-plus");
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
    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });
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

  it("updates the single-player portrait when the room realtime event arrives", async () => {
    const pendingRoom = roomSnapshot({
      players: [
        {
          id: "player-1",
          slot: 0,
          username: "Mira",
          characterName: "Mira Vale",
          characterSheet: "Name: Mira Vale",
          portraitStatus: "pending",
          status: "waiting"
        }
      ]
    });
    const readyRoom = roomSnapshot({
      players: [
        {
          id: "player-1",
          slot: 0,
          username: "Mira",
          characterName: "Mira Vale",
          characterSheet: "Name: Mira Vale",
          portraitStatus: "ready",
          portraitUrl:
            "/media/campaigns/campaign-1/players/player-1/portraits/asset-1/512.webp",
          status: "waiting"
        }
      ]
    });
    let roomFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        roomFetchCount += 1;
        return responseJson(roomFetchCount <= 2 ? pendingRoom : readyRoom);
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText("Portrait status: pending")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        type: "room_updated",
        roomId: campaign.id,
        updatedAt: "2026-07-12T00:00:10.000Z",
        eventId: "portrait-ready"
      });
    });

    expect(
      await screen.findByText(
        "Portrait URL: /media/campaigns/campaign-1/players/player-1/portraits/asset-1/512.webp"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Portrait status: ready")).toBeInTheDocument();
  });

  it("uses the server resolved player id when local browser identity is stale", async () => {
    localStorage.setItem("ai-dnd.playerId", "incognito-player");
    listCampaignsMock.mockResolvedValue([
      {
        ...campaign,
        currentUserPlayerId: "player-1"
      }
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        return responseJson(
          roomSnapshot({
            currentPlayerId: "player-1",
            players: [
              {
                id: "player-1",
                slot: 0,
                username: "Mira",
                characterName: "Mira Vale",
                characterSheet: "Name: Mira Vale",
                portraitStatus: "ready",
                portraitUrl:
                  "https://ai-taverns-media.sgp1.digitaloceanspaces.com/campaigns/campaign-1/players/player-1/portraits/asset-1/512.webp",
                status: "waiting"
              }
            ]
          })
        );
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} />);

    expect(
      await screen.findByText(
        "Portrait URL: https://ai-taverns-media.sgp1.digitaloceanspaces.com/campaigns/campaign-1/players/player-1/portraits/asset-1/512.webp"
      )
    ).toBeInTheDocument();
    expect(localStorage.getItem("ai-dnd.playerId")).toBe("player-1");
  });

  it("loads an unlisted initial campaign when debug mode allows pasted IDs", async () => {
    const debugCampaignId = "99999999-9999-4999-8999-999999999999";
    listCampaignsMock.mockResolvedValue([]);
    const longMessage = "The long tale begins. ".repeat(80).trim();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/room?")) {
        const requestUrl = new URL(url, "https://app.example");

        expect(requestUrl.searchParams.get("roomId")).toBe(debugCampaignId);
        expect(requestUrl.searchParams.get("sessionId")).toBe(debugCampaignId);

        return responseJson(
          roomSnapshot({
            roomId: debugCampaignId,
            sessionId: "provider-debug-session",
            messages: [
              {
                id: "debug-dm-message",
                role: "dm",
                content: longMessage,
                createdAt: "2026-07-12T00:00:00.000Z"
              }
            ]
          })
        );
      }

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GameShell
        allowUnlistedInitialCampaign
        includeAllMessages
        initialCampaignId={debugCampaignId}
        routePath="/debug"
      />
    );

    expect(await screen.findByText(longMessage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Debug 99999999" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("debugAllMessages=true")
      )
    ).toBe(true);
  });

  it("keeps campaign switching on the debug route when rendered for debug", async () => {
    listCampaignsMock.mockResolvedValue([campaign, multiplayerCampaign]);
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/claim-guest-state") {
        return responseJson({});
      }

      if (url.startsWith("/api/room?")) {
        const requestUrl = new URL(url, "https://app.example");
        const roomId = requestUrl.searchParams.get("roomId");

        return responseJson(
          roomId === multiplayerCampaign.id
            ? multiplayerRoomSnapshot({ hasBegun: true })
            : roomSnapshot()
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={campaign.id} routePath="/debug" />);

    expect(await screen.findByRole("button", { name: campaign.title }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: multiplayerCampaign.title }));

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        "",
        `/debug?campaignId=${encodeURIComponent(multiplayerCampaign.id)}`
      );
    });
  });

  it("does not overwrite an old multiplayer adventure with the previous character profile", async () => {
    const pokeCampaign = {
      ...multiplayerCampaign,
      id: "33333333-3333-4333-8333-333333333333",
      sessionId: "provider-session-poke",
      title: "POKE"
    } satisfies CampaignSummary;
    const jinCampaign = {
      ...multiplayerCampaign,
      id: "44444444-4444-4444-8444-444444444444",
      sessionId: "provider-session-jin",
      title: "Jin"
    } satisfies CampaignSummary;

    listCampaignsMock.mockResolvedValue([pokeCampaign, jinCampaign]);

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        const url = String(input);

        if (url === "/api/auth/claim-guest-state") {
          return responseJson({});
        }

        if (url.startsWith("/api/room?")) {
          const requestUrl = new URL(url, "https://app.example");
          const roomId = requestUrl.searchParams.get("roomId");

          if (roomId === pokeCampaign.id) {
            return responseJson(
              multiplayerRoomSnapshot({
                roomId: pokeCampaign.id,
                sessionId: pokeCampaign.sessionId,
                players: [
                  {
                    id: "player-1",
                    slot: 0,
                    username: "Current Player",
                    characterName: "POKE",
                    characterSheet: "Name: POKE",
                    status: "waiting"
                  }
                ]
              })
            );
          }

          if (roomId === jinCampaign.id) {
            return responseJson(
              multiplayerRoomSnapshot({
                roomId: jinCampaign.id,
                sessionId: jinCampaign.sessionId,
                players: [
                  {
                    id: "player-1",
                    slot: 0,
                    username: "Current Player",
                    characterName: "Jin",
                    characterSheet: "Name: Jin",
                    status: "waiting"
                  }
                ]
              })
            );
          }
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<GameShell initialCampaignId={pokeCampaign.id} />);

    expect(await screen.findByRole("button", { name: "POKE" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    fireEvent.click(screen.getByRole("button", { name: "Jin" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Jin" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        if (String(input) !== "/api/room/player" || init?.method !== "POST") {
          return false;
        }

        const body = JSON.parse(String(init.body));
        return body.roomId === jinCampaign.id && body.characterName === "POKE";
      })
    ).toBe(false);
  });
});
