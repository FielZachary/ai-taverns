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

  return render(<MessageLog {...props} />);
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
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    value: 480
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  scrollTo.mockReset();
});

describe("MessageLog", () => {
  it("shows the player-facing mechanics update in a separate card", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          role: "dm",
          playerFacingUpdate: "1st-level spell slot consumed — 2 remaining."
        })
      ]
    });

    expect(screen.getByLabelText("Mechanics update")).toHaveTextContent(
      "1st-level spell slot consumed — 2 remaining."
    );
  });

  it("removes the tavern background class when disabled", () => {
    const { container } = renderMessageLog({ chatBackgroundEnabled: false });

    expect(container.querySelector(".message-log")).toHaveClass(
      "chat-background-disabled"
    );
  });

  it("shows the initial Eldermere map instead of scrolling past it", () => {
    const mapMessage = gameMessage({
      id: "eldermere-map",
      role: "dm",
      content: "",
      resourceCard: {
        type: "eldermere_map",
        imageUrl: "/maps/eldermere-map.png",
        imageAlt: "Map of Eldermere",
        actions: ["inspect_map"]
      }
    });
    const { rerender } = renderMessageLog({ messages: [mapMessage] });

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });

    rerender(
      <MessageLog
        messages={[mapMessage, gameMessage({ id: "opening", role: "dm" })]}
        isSending={false}
      />
    );

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 480 });
  });

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

  it("renders a normal-play DM timestamp as a muted header", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "timestamped-dm-message",
          role: "dm",
          content:
            "Night — 9:10 PM\n\n<npc>Orin</npc> chuckles into his tankard."
        })
      ]
    });

    expect(screen.getByText("Night — 9:10 PM")).toHaveClass(
      "message-timestamp"
    );
    expect(screen.getByText("Orin")).toHaveClass(
      "message-semantic-narration-npc"
    );
  });

  it("leaves legacy DM messages without a timestamp unchanged", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "legacy-dm-message",
          role: "dm",
          content: "Orin chuckles into his tankard."
        })
      ]
    });

    expect(screen.queryByText("Night — 9:10 PM")).not.toBeInTheDocument();
    expect(screen.getByText("Orin chuckles into his tankard.")).not.toHaveClass(
      "message-timestamp"
    );
  });

  it("unwraps Ask DM JSON envelopes before rendering player-facing content", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "ask-answer-json",
          role: "dm",
          kind: "ask_dm_answer",
          content: JSON.stringify({
            public_narration: "Use this as clarification only.",
            roll_requests: [],
            next_input_needed: "player_actions",
            input_targets: [],
            input_policy: "all_players"
          })
        })
      ]
    });

    expect(screen.getByText("DM Answer")).toBeInTheDocument();
    expect(screen.getByText("Use this as clarification only.")).toBeInTheDocument();
    expect(screen.queryByText(/public_narration/)).not.toBeInTheDocument();
  });

  it("renders a DM scene location under the Dungeon Master label", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-location-message",
          role: "dm",
          setting: {
            displayLocation: "Ironhold",
            regionName: "Ferrant Concord",
            settlementName: "Ironhold",
            sceneLocation: "Crag Market Street"
          },
          content: "Steam hisses from the grates."
        })
      ]
    });

    const location = screen.getByText(
      "Ferrant Concord / Ironhold / Crag Market Street"
    );

    expect(location).toHaveClass("message-location-label");
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

  it("renders italic markdown emphasis inside message paragraphs", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-italic-message",
          role: "dm",
          content:
            "DC 18 may reveal that the traps react to *intent* or *fear* rather than just weight."
        })
      ]
    });

    expect(screen.getByText("intent").tagName).toBe("EM");
    expect(screen.getByText("fear").tagName).toBe("EM");
    expect(screen.queryByText(/\*intent\*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*fear\*/)).not.toBeInTheDocument();
  });

  it("renders semantic narration markup with role color classes", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-semantic-message",
          role: "dm",
          content:
            "<npc>Captain Vael</npc> lowers the <object>black key</object> beside <place>Graywake Harbor</place>."
        })
      ]
    });

    expect(screen.getByText("Captain Vael")).toHaveClass(
      "message-semantic-narration",
      "message-semantic-narration-npc"
    );
    expect(screen.getByText("black key")).toHaveClass(
      "message-semantic-narration",
      "message-semantic-narration-object"
    );
    expect(screen.getByText("Graywake Harbor")).toHaveClass(
      "message-semantic-narration",
      "message-semantic-narration-place"
    );
    expect(screen.queryByText(/<npc>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<\/object>/)).not.toBeInTheDocument();
  });

  it("renders semantic emphasis markup as italic text", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-semantic-emphasis-message",
          role: "dm",
          content:
            'The magistrate says, <em>"If you have standing, state it now."</em>'
        })
      ]
    });

    expect(
      screen.getByText('"If you have standing, state it now."').tagName
    ).toBe("EM");
    expect(screen.queryByText(/<em>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<\/em>/)).not.toBeInTheDocument();
  });

  it("colors unfinished semantic narration markup while a DM message streams", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-streaming-semantic-message",
          role: "dm",
          content: "The cutlass catches your ribs for <danger>5 piercing"
        })
      ]
    });

    expect(screen.getByText("5 piercing")).toHaveClass(
      "message-semantic-narration",
      "message-semantic-narration-danger"
    );
    expect(screen.queryByText(/<danger>/)).not.toBeInTheDocument();
  });

  it("italicizes unfinished semantic emphasis markup while a DM message streams", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-streaming-semantic-emphasis-message",
          role: "dm",
          content: "The magistrate says, <em>state your proof"
        })
      ]
    });

    expect(screen.getByText("state your proof").tagName).toBe("EM");
    expect(screen.queryByText(/<em>/)).not.toBeInTheDocument();
  });

  it("leaves unsupported angle tags as escaped text", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-unknown-semantic-message",
          role: "dm",
          content: "<mood>The fog curls low.</mood>"
        })
      ]
    });

    expect(screen.getByText("<mood>The fog curls low.</mood>")).toBeInTheDocument();
    expect(screen.queryByText("The fog curls low.")).not.toBeInTheDocument();
  });

  it("renders preserved single newlines as line breaks inside message paragraphs", () => {
    const { container } = renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-line-break-message",
          role: "dm",
          content: [
            "**Inquisitor Manifold initiative roll: 14.**",
            "**Unbound Word Acolyte 1 initiative roll: 10.**",
            "**Unbound Word Acolyte 2 initiative roll: 8.**",
            "",
            "**Initiative Order:**",
            "1. Oktai Uni (16)",
            "2. Inquisitor Manifold (14)"
          ].join("\n")
        })
      ]
    });

    expect(screen.getByText("Inquisitor Manifold initiative roll: 14.").tagName).toBe(
      "STRONG"
    );
    expect(screen.getByText("Initiative Order:").tagName).toBe("STRONG");
    expect(screen.getByText("1. Oktai Uni (16)")).toBeInTheDocument();
    expect(container.querySelectorAll(".message-body br")).toHaveLength(4);
  });

  it("renders inventory update notes as muted italic parentheticals", () => {
    renderMessageLog({
      messages: [
        gameMessage({
          id: "dm-inventory-update",
          role: "dm",
          content:
            "The barkeep slides the cup across.\n\n*(Inventory update: you spent 3 CP.)*"
        })
      ]
    });

    const inventoryUpdate = screen.getByText(
      "(Inventory update: you spent 3 CP.)"
    );

    expect(inventoryUpdate).toHaveClass("message-inventory-update");
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
      askDmContextSelector: {
        requestMessages: [
          {
            role: "system",
            content: "You are the AI Taverns Ask DM context selector."
          },
          {
            role: "user",
            content: "Available context chunk keys JSON: world:road-tracks"
          }
        ],
        rawResponse:
          "{\"context_keys\":{\"relevant_world_context\":[\"world:road-tracks\"]}}",
        parsedOutput: {
          contextKeys: {
            relevant_world_context: ["world:road-tracks"]
          }
        }
      },
      mechanicsUpdater: {
        requestMessages: [
          {
            role: "system",
            content: "You are AI Taverns' mechanics state updater."
          },
          {
            role: "user",
            content: "Finalized narrator prose: Hector puts the fish in his backpack."
          }
        ],
        rawResponse:
          '{"no_changes_needed":false,"inventory_state_update":{"patches":[{"operation":"add","item":"Strange fish"}]}}',
        parsedOutput: {
          no_changes_needed: false,
          inventory_state_update: {
            patches: [{ operation: "add", item: "Strange fish" }]
          }
        },
        acceptedInventoryPatches: [{ operation: "add", item: "Strange fish" }],
        discardedInventoryPatches: [],
        noChangesNeeded: false,
        durationMs: 1234
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
    expect(screen.getByText("Ask DM Selector Prompt Sent")).toBeInTheDocument();
    expect(screen.getByText(/Ask DM context selector/)).toBeInTheDocument();
    expect(screen.getByText("Ask DM Selector Output")).toBeInTheDocument();
    expect(screen.getAllByText(/world:road-tracks/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Ask DM Selector Parsed Output")).toBeInTheDocument();
    expect(screen.getByText("Mechanics Executor Prompt Sent")).toBeInTheDocument();
    expect(screen.getByText(/mechanics state updater/)).toBeInTheDocument();
    expect(screen.getByText("Mechanics Executor Output")).toBeInTheDocument();
    expect(screen.getByText(/\"no_changes_needed\":false/)).toBeInTheDocument();
    expect(screen.getByText("Mechanics Executor Parsed Output")).toBeInTheDocument();
    expect(screen.getByText("Mechanics Executor Validation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy ai output/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy ask dm selector prompt sent/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy mechanics executor output/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close debug details/i }));

    expect(screen.queryByRole("dialog", { name: /ai debug/i })).not.toBeInTheDocument();
  });

  it("copies the prompt sent from AI debug", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const debug: AiDebugInfo = {
      model: "deepseek-chat",
      requestMessages: [
        { role: "system", content: "Stay in character." },
        { role: "user", content: "Open the door." }
      ],
      rawResponse: "The hinges complain."
    };

    renderMessageLog({
      messages: [
        gameMessage({
          id: "debug-copy-dm",
          role: "dm",
          content: "The hinges complain.",
          debug
        })
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: /show ai debug details/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy prompt/i }));

    expect(writeText).toHaveBeenCalledWith(
      "# 1. SYSTEM\nStay in character.\n\n# 2. USER\nOpen the door."
    );
  });

  it("copies any AI debug value", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const debug: AiDebugInfo = {
      model: "deepseek-chat",
      requestMessages: [{ role: "user", content: "Open the door." }],
      rawResponse: "The hinges complain."
    };

    renderMessageLog({
      messages: [
        gameMessage({
          id: "debug-output-copy-dm",
          role: "dm",
          content: "The hinges complain.",
          debug
        })
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: /show ai debug details/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy ai output/i }));

    expect(writeText).toHaveBeenCalledWith("The hinges complain.");
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
