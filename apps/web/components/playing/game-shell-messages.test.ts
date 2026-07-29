import { describe, expect, it } from "vitest";

import type { GameMessage } from "@/lib/game-types";
import {
  appendStreamingDmDelta,
  completeStreamingDmMessage,
  mergeVisibleGameMessages,
  playerResourcesIntroText,
  removePersistedStreamingDmMessages,
  removeStreamingDmMessage,
  startStreamingDmMessage,
  withOpeningResourceMessages,
  withPlayerMessageAvatars,
  type StreamingDmMessage
} from "./game-shell-messages";

function message(
  id: string,
  role: GameMessage["role"],
  createdAt: string,
  content = `${role} ${id}`
): GameMessage {
  return {
    id,
    role,
    content,
    createdAt
  };
}

function streamingMessage(
  id: string,
  turnId: string,
  createdAt: string,
  content = `stream ${turnId}`
): StreamingDmMessage {
  return {
    ...message(id, "dm", createdAt, content),
    turnId
  };
}

describe("game shell message helpers", () => {
  it("prepends Eldermere resources before the first campaign opener", () => {
    const visibleMessages = withOpeningResourceMessages([
      message("opener-1", "dm", "2026-07-11T10:00:00.000Z", "Welcome to Selwick.")
    ]);

    expect(visibleMessages.map((visibleMessage) => visibleMessage.id)).toEqual([
      "opener-1-eldermere-map",
      "opener-1-player-resources-guide",
      "opener-1"
    ]);
    expect(visibleMessages[0]?.resourceCard).toMatchObject({
      type: "eldermere_map",
      imageUrl: "/maps/eldermere-map.png",
      actions: ["inspect_map", "view_eldermere_lore"]
    });
    expect(visibleMessages[1]?.content).toBe(playerResourcesIntroText);
  });

  it("uses room player portraits for matching player messages", () => {
    const visibleMessages = withPlayerMessageAvatars(
      [
        {
          ...message(
            "player-1",
            "player",
            "2026-07-11T10:00:00.000Z",
            "I draw my blade."
          ),
          characterName: "Lyra",
          playerName: "Maya"
        }
      ],
      [
        {
          characterName: "Lyra",
          username: "Maya",
          portraitUrl: "/portraits/lyra.png"
        }
      ]
    );

    expect(visibleMessages[0]?.avatarUrl).toBe("/portraits/lyra.png");
  });

  it("merges local and room messages in chronological order", () => {
    const visibleMessages = mergeVisibleGameMessages({
      localMessages: [
        message("optimistic-player", "player", "2026-07-11T10:00:02.000Z"),
        message("old-local", "system", "2026-07-11T09:59:59.000Z")
      ],
      roomMessages: [
        message("room-dm", "dm", "2026-07-11T10:00:01.000Z")
      ],
      streamingDmMessages: []
    });

    expect(visibleMessages.map((visibleMessage) => visibleMessage.id)).toEqual([
      "old-local",
      "room-dm",
      "optimistic-player"
    ]);
  });

  it("lets room snapshots replace local copies with the same message id", () => {
    const visibleMessages = mergeVisibleGameMessages({
      localMessages: [
        message(
          "player-turn",
          "player",
          "2026-07-11T10:00:00.000Z",
          "Optimistic text"
        )
      ],
      roomMessages: [
        message(
          "player-turn",
          "player",
          "2026-07-11T10:00:00.000Z",
          "Persisted text"
        )
      ],
      streamingDmMessages: []
    });

    expect(visibleMessages).toEqual([
      message(
        "player-turn",
        "player",
        "2026-07-11T10:00:00.000Z",
        "Persisted text"
      )
    ]);
  });

  it("keeps streaming DM messages until the room snapshot contains the final message id", () => {
    const visibleWithStream = mergeVisibleGameMessages({
      localMessages: [],
      roomMessages: [
        message("player-turn", "player", "2026-07-11T10:00:00.000Z")
      ],
      streamingDmMessages: [
        streamingMessage(
          "dm-stream-turn-1",
          "turn-1",
          "2026-07-11T10:00:01.000Z",
          "The door begins to open"
        )
      ]
    });

    expect(visibleWithStream.map((visibleMessage) => visibleMessage.id)).toEqual([
      "player-turn",
      "dm-stream-turn-1"
    ]);

    const visibleAfterSnapshot = mergeVisibleGameMessages({
      localMessages: [],
      roomMessages: [
        message("player-turn", "player", "2026-07-11T10:00:00.000Z"),
        message(
          "dm-stream-turn-1",
          "dm",
          "2026-07-11T10:00:02.000Z",
          "The door opens all the way."
        )
      ],
      streamingDmMessages: [
        streamingMessage(
          "dm-stream-turn-1",
          "turn-1",
          "2026-07-11T10:00:01.000Z",
          "The door begins to open"
        )
      ]
    });

    expect(visibleAfterSnapshot).toEqual([
      message("player-turn", "player", "2026-07-11T10:00:00.000Z"),
      message(
        "dm-stream-turn-1",
        "dm",
        "2026-07-11T10:00:02.000Z",
        "The door opens all the way."
      )
    ]);
  });

  it("keeps same-timestamp ask DM questions before the in-flight DM answer", () => {
    const visibleMessages = mergeVisibleGameMessages({
      localMessages: [
        message(
          "ask-dm-question",
          "player",
          "2026-07-20T00:48:42.000Z",
          "Can we see them?"
        )
      ],
      roomMessages: [],
      streamingDmMessages: [
        streamingMessage(
          "dm-stream-ask-1",
          "ask-1",
          "2026-07-20T00:48:42.000Z",
          ""
        )
      ]
    });

    expect(visibleMessages.map((visibleMessage) => visibleMessage.id)).toEqual([
      "ask-dm-question",
      "dm-stream-ask-1"
    ]);
  });

  it("uses deterministic fallback ordering for malformed timestamps", () => {
    const visibleMessages = mergeVisibleGameMessages({
      localMessages: [
        message("local-player", "player", "not-a-date"),
        message("local-system", "system", "not-a-date")
      ],
      roomMessages: [message("room-dm", "dm", "not-a-date")],
      streamingDmMessages: [
        streamingMessage("streaming-dm", "turn-1", "not-a-date")
      ]
    });

    expect(visibleMessages.map((visibleMessage) => visibleMessage.id)).toEqual([
      "local-player",
      "room-dm",
      "streaming-dm",
      "local-system"
    ]);
  });

  it("allows streaming updates to replace earlier streaming text for the same id", () => {
    const visibleMessages = mergeVisibleGameMessages({
      localMessages: [],
      roomMessages: [],
      streamingDmMessages: [
        streamingMessage(
          "dm-stream-turn-1",
          "turn-1",
          "2026-07-11T10:00:01.000Z",
          "First chunk"
        ),
        streamingMessage(
          "dm-stream-turn-1",
          "turn-1",
          "2026-07-11T10:00:01.000Z",
          "First chunk plus more"
        )
      ]
    });

    expect(visibleMessages).toEqual([
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:01.000Z",
        "First chunk plus more"
      )
    ]);
  });

  it("starts a streaming DM message and replaces any earlier stream for the turn", () => {
    const currentMessages = [
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:00.000Z",
        "stale text"
      ),
      streamingMessage(
        "dm-stream-turn-2",
        "turn-2",
        "2026-07-11T10:00:01.000Z",
        "other turn"
      )
    ];

    expect(
      startStreamingDmMessage(
        currentMessages,
        "turn-1",
        "2026-07-11T10:00:02.000Z"
      )
    ).toEqual([
      streamingMessage(
        "dm-stream-turn-2",
        "turn-2",
        "2026-07-11T10:00:01.000Z",
        "other turn"
      ),
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:02.000Z",
        ""
      )
    ]);
  });

  it("appends streaming DM deltas without changing the original stream timestamp", () => {
    const currentMessages = [
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:00.000Z",
        "The door"
      )
    ];

    expect(
      appendStreamingDmDelta(
        currentMessages,
        "turn-1",
        " opens.",
        "2026-07-11T10:00:05.000Z"
      )
    ).toEqual([
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:00.000Z",
        "The door opens."
      )
    ]);
  });

  it("creates a streaming DM message when a delta arrives before the start event", () => {
    expect(
      appendStreamingDmDelta(
        [],
        "turn-1",
        "A sudden voice echoes.",
        "2026-07-11T10:00:05.000Z"
      )
    ).toEqual([
      streamingMessage(
        "dm-stream-turn-1",
        "turn-1",
        "2026-07-11T10:00:05.000Z",
        "A sudden voice echoes."
      )
    ]);
  });

  it("removes only the completed or failed streaming DM message", () => {
    const currentMessages = [
      streamingMessage("dm-stream-turn-1", "turn-1", "2026-07-11T10:00:00.000Z"),
      streamingMessage("dm-stream-turn-2", "turn-2", "2026-07-11T10:00:01.000Z")
    ];

    expect(removeStreamingDmMessage(currentMessages, "turn-1")).toEqual([
      streamingMessage("dm-stream-turn-2", "turn-2", "2026-07-11T10:00:01.000Z")
    ]);
  });

  it("keeps completed streaming text under the final message id until the snapshot arrives", () => {
    const completedMessages = completeStreamingDmMessage(
      [
        streamingMessage(
          "dm-stream-turn-1",
          "turn-1",
          "2026-07-11T10:00:00.000Z",
          "The answer is nearly complete."
        )
      ],
      "turn-1",
      "provider-answer-1"
    );

    expect(completedMessages).toEqual([
      streamingMessage(
        "provider-answer-1",
        "turn-1",
        "2026-07-11T10:00:00.000Z",
        "The answer is nearly complete."
      )
    ]);

    expect(
      removePersistedStreamingDmMessages(completedMessages, [
        message(
          "provider-answer-1",
          "dm",
          "2026-07-11T10:00:01.000Z",
          "The persisted answer."
        )
      ])
    ).toEqual([]);
  });
});
