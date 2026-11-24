import { describe, expect, it } from "vitest";

import type { DiceRollSubmission } from "@/lib/game-types";
import {
  buildRollSubmissionRequest,
  buildTurnSubmissionRequest
} from "./game-shell-requests";

const campaign = {
  id: "campaign/with space",
  sessionId: "session-1"
};

const rollSubmissions: DiceRollSubmission[] = [
  {
    rollRequestId: "roll-1",
    rollResult: {
      rolls: [18, 4],
      total: 18
    },
    clientMessageId: "message-1"
  }
];

describe("game shell request helpers", () => {
  it("builds solo turn requests without room-only fields", () => {
    expect(
      buildTurnSubmissionRequest({
        campaign,
        singlePlayer: true,
        playerId: "player-1",
        message: "I inspect the door.",
        skipTurn: false,
        clientMessageId: "message-1"
      })
    ).toEqual({
      endpoint: "/api/campaigns/campaign%2Fwith%20space/solo-turn",
      body: {
        message: "I inspect the door.",
        clientMessageId: "message-1"
      }
    });
  });

  it("builds multiplayer turn requests with room, session, player, and skip state", () => {
    expect(
      buildTurnSubmissionRequest({
        campaign,
        singlePlayer: false,
        playerId: "player-1",
        message: "Nyx skips their turn.",
        skipTurn: true,
        clientMessageId: "message-2"
      })
    ).toEqual({
      endpoint: "/api/room/submit",
      body: {
        roomId: "campaign/with space",
        sessionId: "session-1",
        playerId: "player-1",
        message: "Nyx skips their turn.",
        skipTurn: true,
        clientMessageId: "message-2"
      }
    });
  });

  it("builds solo roll requests without room-only fields", () => {
    expect(
      buildRollSubmissionRequest({
        campaign,
        singlePlayer: true,
        playerId: "player-1",
        rollSubmissions,
        clientMessageId: "message-3"
      })
    ).toEqual({
      endpoint: "/api/campaigns/campaign%2Fwith%20space/solo-turn",
      body: {
        rollSubmissions,
        clientMessageId: "message-3"
      }
    });
  });

  it("builds multiplayer roll requests with room, session, and player context", () => {
    expect(
      buildRollSubmissionRequest({
        campaign,
        singlePlayer: false,
        playerId: "player-1",
        rollSubmissions,
        clientMessageId: "message-4"
      })
    ).toEqual({
      endpoint: "/api/room/submit",
      body: {
        roomId: "campaign/with space",
        sessionId: "session-1",
        playerId: "player-1",
        rollSubmissions,
        clientMessageId: "message-4"
      }
    });
  });
});
