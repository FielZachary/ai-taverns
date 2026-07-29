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

  it("renders bold markdown emphasis inside message paragraphs", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-bold-message",
          role: "dm",
          content:
            "**Attack: 14 vs AC 10 - hit.** The spearpoint drives into Klave."
        })
      ]
    });

    const mechanicText = screen.getByText("Attack: 14 vs AC 10 - hit.");

    expect(mechanicText.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Attack/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/The spearpoint drives into Klave\./)
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

  it("renders character art avatars and Eldermere resource card actions", () => {
    const onInspectMap = vi.fn();
    const onViewEldermereLore = vi.fn();

    renderMessageLog({
      messages: [
        gameMessage({
          id: "player-message",
          avatarUrl: "/portraits/lyra.png",
          characterName: "Lyra",
          content: "I study the map."
        }),
        gameMessage({
          id: "map-message",
          role: "dm",
          content: "",
          resourceCard: {
            type: "eldermere_map",
            imageUrl: "/maps/eldermere-map.png",
            imageAlt: "Map of Eldermere",
            actions: ["inspect_map", "view_eldermere_lore"]
          }
        })
      ],
      onInspectMap,
      onViewEldermereLore
    });

    expect(screen.getByAltText("Map of Eldermere")).toHaveAttribute(
      "src",
      "/maps/eldermere-map.png"
    );
    expect(document.querySelector(".message-player img")).toHaveAttribute(
      "src",
      "/portraits/lyra.png"
    );
    expect(document.querySelector(".message-resource")).toBeInTheDocument();
    expect(screen.queryByText("Dungeon Master")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inspect Map" }));
    fireEvent.click(screen.getByRole("button", { name: "View Eldermere Lore" }));

    expect(onInspectMap).toHaveBeenCalledOnce();
    expect(onViewEldermereLore).toHaveBeenCalledOnce();
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

  it("shows the rune loader inside an empty streaming DM message", () => {
    render(
      <MessageLog
        messages={[
          gameMessage({
            id: "streaming-dm",
            role: "dm",
            content: ""
          })
        ]}
        isSending={true}
        hideSendingIndicator={true}
      />
    );

    expect(screen.getByText(/reading the runes/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reading the runes/i)).toHaveLength(1);
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
      temperature: 0.8,
      combatState: {
        combat: {
          active: true,
          round: 2,
          turnOwner: "npc:mara",
          initiativeOrder: ["player:vayne", "npc:mara"]
        },
        actors: {
          "npc:mara": {
            characterName: "Mara",
            currentHp: 33,
            maxHp: 45,
            conditions: []
          }
        }
      },
      contextStorageState: {
        contextChunkCount: 1,
        contextChunks: [
          {
            context_id: "npc:mara",
            category: "npc_context",
            body_markdown: "# Mara\n\n## Motivations\nProtect her crew."
          }
        ]
      },
      livingWorldPressureEngine: {
        coveredMessageCount: 21,
        rawResponse: "{\"world_clock_updates\":[{\"title\":\"Accord pressure\"}]}",
        parsedOutput: {
          dmGuidance: {
            currentDirection:
              "Surface the Accord pressure through nervous clerks."
          },
          possibleIntrusions: [
            {
              title: "Accord surveyors arrive"
            }
          ]
        },
        acceptedPatches: [
          {
            operation: "append",
            context_id: "thread:lysa-trail"
          }
        ],
        discardedPatches: []
      },
      eldermereOpeningPlanner: {
        requestMessages: [
          {
            role: "system",
            content: "You are the campaign-opening planner."
          },
          {
            role: "user",
            content: "Selected opener region and settlement: Selwick."
          }
        ],
        rawResponse: "{\"campaign_title\":\"The Quiet Road\"}",
        parsedOutput: {
          campaign_title: "The Quiet Road",
          starting_location: {
            name: "Selwick"
          }
        }
      },
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
    const plannerDebug = debug.eldermereOpeningPlanner!;

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

    expect(
      screen.getByRole("img", { name: /pressure engine ran/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show ai debug details/i }));

    expect(
      screen.getByRole("dialog", { name: /ai debug/i })
    ).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat / response-1")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("0.8")).toBeInTheDocument();
    expect(screen.getByText("Combat State")).toBeInTheDocument();
    expect(screen.getByText(/"turnOwner": "npc:mara"/)).toBeInTheDocument();
    expect(screen.getByText(/"currentHp": 33/)).toBeInTheDocument();
    expect(screen.getByText("Context Storage")).toBeInTheDocument();
    expect(screen.getByText(/"context_id": "npc:mara"/)).toBeInTheDocument();
    expect(screen.getByText(/Protect her crew/)).toBeInTheDocument();
    expect(screen.getByText("Pressure Engine Output")).toBeInTheDocument();
    expect(screen.getByText(/"coveredMessageCount": 21/)).toBeInTheDocument();
    expect(screen.getByText(/Accord surveyors arrive/)).toBeInTheDocument();
    expect(screen.getByText(/thread:lysa-trail/)).toBeInTheDocument();
    expect(screen.getAllByText(/# 1\. SYSTEM/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(debug.rawResponse)).toBeInTheDocument();
    expect(screen.getByText("Eldermere Planner Prompt Sent")).toBeInTheDocument();
    expect(screen.getByText(/Selected opener region and settlement/)).toBeInTheDocument();
    expect(screen.getByText("Eldermere Planner Output")).toBeInTheDocument();
    expect(screen.getByText(plannerDebug.rawResponse)).toBeInTheDocument();
    expect(screen.getByText("Eldermere Planner Parsed Output")).toBeInTheDocument();
    expect(screen.getByText(/"name": "Selwick"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close debug details/i }));

    expect(screen.queryByRole("dialog", { name: /ai debug/i })).not.toBeInTheDocument();
  });

  it("updates an open AI debug modal when message debug data refreshes", () => {
    const baseDebug: AiDebugInfo = {
      model: "deepseek-chat",
      temperature: 0.8,
      combatState: {
        combat: {
          active: false
        }
      },
      requestMessages: [
        {
          role: "system",
          content: "Stay in character."
        }
      ],
      rawResponse: "{\"message\":\"The dock creaks.\"}"
    };
    const message = gameMessage({
      id: "debug-refresh-dm",
      role: "dm",
      content: "The dock creaks.",
      debug: baseDebug
    });
    const { rerender } = render(
      <MessageLog messages={[message]} isSending={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /show ai debug details/i }));

    expect(screen.getByRole("dialog", { name: /ai debug/i })).toBeInTheDocument();
    expect(screen.getByText("Context Storage")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();

    rerender(
      <MessageLog
        messages={[
          {
            ...message,
            debug: {
              ...baseDebug,
              contextStorageState: {
                contextChunkCount: 1,
                contextChunks: [
                  {
                    context_id: "npc:marra-vell",
                    body_markdown: "# Marra Vell"
                  }
                ]
              }
            }
          }
        ]}
        isSending={false}
      />
    );

    expect(screen.getByText(/"context_id": "npc:marra-vell"/)).toBeInTheDocument();
    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
  });
});
