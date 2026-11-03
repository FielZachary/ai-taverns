import { describe, expect, it } from "vitest";

import type { GameMessage } from "@/lib/game-types";
import { clientRollRequestFromLatestDmMessage } from "./game-shell-roll-lock";

function message(overrides: Partial<GameMessage> = {}): GameMessage {
  return {
    id: "message-1",
    role: "dm",
    content: "Make a 1d20 roll.",
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides
  };
}

describe("clientRollRequestFromLatestDmMessage", () => {
  it("creates a client-only roll request from the latest DM response", () => {
    expect(clientRollRequestFromLatestDmMessage([message()])).toEqual({
      id: "client-roll-message-1",
      dice: "1d20",
      label: "Roll 1d20"
    });
  });

  it("does not lock after a player has replied", () => {
    expect(
      clientRollRequestFromLatestDmMessage([
        message(),
        message({ id: "player-1", role: "player", content: "I rolled 14." })
      ])
    ).toBeNull();
  });

  it("ignores DM messages without supported dice notation", () => {
    expect(
      clientRollRequestFromLatestDmMessage([
        message({ content: "The corridor is silent." })
      ])
    ).toBeNull();
  });
});
