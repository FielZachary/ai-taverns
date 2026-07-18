import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiDebugInfo, GameMessage } from "@/lib/game-types";
import { MessageLog } from "./MessageLog";

const scrollTo = vi.fn();

function gameMessage(overrides: Partial<GameMessage>): GameMessage {
  return {
    id: "message-1",
    role: "player",
    kind: "turn",
    content: "The door opens.",
    createdAt: "2026-07-12T00:00:00.000Z",
    ...overrides
  };
}

function renderMessageLog(overrides: Partial<ComponentProps<typeof MessageLog>> = {}) {
  const props = {
    messages: [],
    isSending: false,
    ...overrides
  } satisfies ComponentProps<typeof MessageLog>;

  render(<MessageLog {...props} />);

  return props;
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scrollTo
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  scrollTo.mockReset();
});

describe("MessageLog", () => {
  it("renders player, DM, system, and ask-DM answer message variants", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "player-message",
          characterName: "Lyra",
          playerName: "Maya",
          content: "I check the carved door."
        }),
        gameMessage({
          id: "dm-message",
          role: "dm",
          content: "The carving shows a silver key."
        }),
        gameMessage({
          id: "system-message",
          role: "system",
          content: "Maya joined the table."
        }),
        gameMessage({
          id: "ask-answer",
          role: "dm",
          kind: "ask_dm_answer",
          content: "You know this sigil belongs to the old guild."
        })
      ]
    });

    expect(screen.getByText("Lyra")).toBeInTheDocument();
    expect(screen.getByText("Dungeon Master")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
    expect(screen.getByText("DM Answer")).toBeInTheDocument();
    expect(screen.getByText("I check the carved door.")).toBeInTheDocument();
    expect(
      screen.getByText("You know this sigil belongs to the old guild.")
    ).toBeInTheDocument();
  });

  it("renders ask-DM questions and waiting player status details", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "ask-question",
          kind: "ask_dm_question",
          characterName: "Nim",
          content: "Do I recognize the sigil?"
        })
      ],
      waitingPlayers: [
        {
          id: "waiting-1",
          name: "Rowan",
          detail: "choosing an action",
          status: "waiting"
        }
      ]
    });

    expect(screen.getByText("Nim asks the DM")).toBeInTheDocument();
    expect(screen.getByText("Do I recognize the sigil?")).toBeInTheDocument();
    expect(screen.getByText("Rowan")).toBeInTheDocument();
    expect(screen.getByText("choosing an action")).toBeInTheDocument();
    expect(screen.getByText(/waiting/i)).toBeInTheDocument();
  });

  it("shows the sending indicator unless a streaming DM message is already visible", () => {
    const { rerender } = render(
      <MessageLog messages={[]} isSending={true} />
    );

    expect(screen.getByText(/reading the runes/i)).toBeInTheDocument();

    rerender(
      <MessageLog
        messages={[
          gameMessage({
            id: "streaming-dm",
            role: "dm",
            content: "The answer is already arriving."
          })
        ]}
        isSending={true}
        hideSendingIndicator={true}
      />
    );

    expect(screen.getByText("The answer is already arriving.")).toBeInTheDocument();
    expect(screen.queryByText(/reading the runes/i)).not.toBeInTheDocument();
  });

  it("calls regenerate only for the eligible DM message and disables while busy", () => {
    const onRegenerateResponse = vi.fn();
    const messages = [
      gameMessage({
        id: "dm-1",
        role: "dm",
        content: "The first answer."
      }),
      gameMessage({
        id: "dm-2",
        role: "dm",
        content: "The second answer."
      })
    ];
    const { rerender } = render(
      <MessageLog
        messages={messages}
        isSending={false}
        regeneratableMessageId="dm-2"
        onRegenerateResponse={onRegenerateResponse}
      />
    );

    const regenerateButton = screen.getByRole("button", {
      name: /regenerate ai response/i
    });

    fireEvent.click(regenerateButton);

    expect(onRegenerateResponse).toHaveBeenCalledWith("dm-2");
    expect(screen.getAllByRole("article")).toHaveLength(2);

    rerender(
      <MessageLog
        messages={messages}
        isSending={true}
        regeneratableMessageId="dm-2"
        onRegenerateResponse={onRegenerateResponse}
      />
    );

    expect(
      screen.getByRole("button", { name: /regenerate ai response/i })
    ).toBeDisabled();

    rerender(
      <MessageLog
        messages={messages}
        isSending={false}
        regeneratableMessageId="dm-2"
        regeneratingMessageId="dm-2"
        onRegenerateResponse={onRegenerateResponse}
      />
    );

    expect(
      screen.getByRole("button", { name: /regenerate ai response/i })
    ).toBeDisabled();
  });

  it("calls rewind regeneration for older DM turn messages", () => {
    const onRegenerateResponse = vi.fn();

    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-1",
          role: "dm",
          content: "The first answer."
        }),
        gameMessage({
          id: "ask-answer",
          role: "dm",
          kind: "ask_dm_answer",
          content: "A side answer."
        }),
        gameMessage({
          id: "dm-2",
          role: "dm",
          content: "The second answer."
        })
      ],
      isSending: false,
      regeneratableMessageId: "dm-2",
      onRegenerateResponse
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /go back to this response/i
      })
    );

    expect(onRegenerateResponse).toHaveBeenCalledWith("dm-1");
    expect(
      screen.queryByRole("button", {
        name: /go back to this response/i
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /regenerate ai response/i })
    ).toBeInTheDocument();
  });

  it("opens and closes AI debug details for debugged DM messages", () => {
    const debug: AiDebugInfo = {
      model: "deepseek-chat",
      providerResponseId: "response-1",
      requestMessages: [
        {
          role: "system",
          content: "Stay in character."
        },
        {
          role: "user",
          content: "Open the door."
        }
      ],
      rawResponse: "{\"message\":\"The hinges complain.\"}"
    };

    renderMessageLog({
      messages: [
        gameMessage({
          id: "debugged-dm",
          role: "dm",
          content: "The hinges complain.",
          debug
        })
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: /show ai debug details/i }));

    expect(
      screen.getByRole("dialog", { name: /ai debug/i })
    ).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat / response-1")).toBeInTheDocument();
    expect(screen.getByText(/# 1\. SYSTEM/)).toBeInTheDocument();
    expect(screen.getByText(debug.rawResponse)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close debug details/i }));

    expect(screen.queryByRole("dialog", { name: /ai debug/i })).not.toBeInTheDocument();
  });
});
