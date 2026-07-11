import { describe, expect, it } from "vitest";

import type { DiceRollRequest, GameMessage } from "@/lib/game-types";
import { defaultCharacterSheet, type PlayerProfile } from "./PlayerPanel";
import {
  currentPlayerRollRequests,
  getMissingPlayerProfileFields,
  inputTargetsCurrentPlayer,
  rollRequestTargetsCurrentPlayer,
  rollRequestsFromRoom,
  snapshotHasResponseAfterMessage,
  type RoomPlayer,
  type RoomSnapshot
} from "./game-shell-state";

const completeProfile: PlayerProfile = {
  username: "Ada Lovelace",
  characterName: "Nyx Ember",
  characterSheet: "Name: Nyx\nClass: Wizard"
};

const currentRoomPlayer: RoomPlayer = {
  id: "player-1",
  slot: 1,
  username: "Ada at Table",
  characterName: "Nyx the Bright",
  characterSheet: "Name: Nyx",
  status: "waiting"
};

function rollRequest(
  id: string,
  player?: string
): DiceRollRequest {
  return {
    id,
    dice: "1d20",
    label: `Check ${id}`,
    player
  };
}

function message(
  id: string,
  role: GameMessage["role"],
  createdAt: string
): GameMessage {
  return {
    id,
    role,
    content: `${role} message`,
    createdAt
  };
}

function roomSnapshot(
  overrides: Partial<RoomSnapshot> = {}
): RoomSnapshot {
  return {
    roomId: "room-1",
    mode: "multiplayer",
    sessionId: "session-1",
    players: [currentRoomPlayer],
    messages: [],
    isResolving: false,
    hasBegun: true,
    pendingRollRequest: null,
    ...overrides
  };
}

describe("game shell state helpers", () => {
  it("reports only the missing player profile fields", () => {
    expect(
      getMissingPlayerProfileFields({
        username: "Ada",
        characterName: "Nyx",
        characterSheet: "Name: Nyx"
      })
    ).toEqual([]);

    expect(
      getMissingPlayerProfileFields({
        username: " ",
        characterName: "",
        characterSheet: defaultCharacterSheet
      })
    ).toEqual(["username", "character name", "character sheet"]);

    expect(
      getMissingPlayerProfileFields({
        username: "Ada",
        characterName: "Nyx",
        characterSheet: `  ${defaultCharacterSheet}  `
      })
    ).toEqual(["character sheet"]);
  });

  it("normalizes roll request targets against profile and room player names", () => {
    expect(
      rollRequestTargetsCurrentPlayer(
        rollRequest("untargeted"),
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(true);

    expect(
      rollRequestTargetsCurrentPlayer(
        rollRequest("profile-character", "nyx ember"),
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(true);

    expect(
      rollRequestTargetsCurrentPlayer(
        rollRequest("room-character", "NYX!!! THE BRIGHT"),
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(true);

    expect(
      rollRequestTargetsCurrentPlayer(
        rollRequest("other-player", "Bran"),
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(false);
  });

  it("uses input target lists to decide whether the current player can act", () => {
    expect(inputTargetsCurrentPlayer([], completeProfile)).toBe(true);
    expect(
      inputTargetsCurrentPlayer(
        ["Other Player", "Ada at Table"],
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(true);
    expect(
      inputTargetsCurrentPlayer(
        ["Other Player"],
        completeProfile,
        currentRoomPlayer
      )
    ).toBe(false);
  });

  it("returns all pending rolls for solo play and only the leading targeted batch for multiplayer", () => {
    const requests = [
      rollRequest("first", "Nyx"),
      rollRequest("second", "Ada at Table"),
      rollRequest("third", "Bran")
    ];

    expect(
      currentPlayerRollRequests(requests, completeProfile, currentRoomPlayer, true)
    ).toEqual(requests);
    expect(
      currentPlayerRollRequests(requests, completeProfile, currentRoomPlayer, false)
    ).toEqual(requests.slice(0, 2));
    expect(
      currentPlayerRollRequests(
        [rollRequest("other", "Bran"), rollRequest("nyx", "Nyx")],
        completeProfile,
        currentRoomPlayer,
        false
      )
    ).toEqual([]);
  });

  it("prefers batched pending roll requests over the legacy single request", () => {
    const legacyRequest = rollRequest("legacy", "Nyx");
    const batchedRequests = [
      rollRequest("first", "Nyx"),
      rollRequest("second", "Nyx")
    ];

    expect(
      rollRequestsFromRoom(
        roomSnapshot({
          pendingRollRequest: legacyRequest,
          pendingRollRequests: batchedRequests
        })
      )
    ).toEqual(batchedRequests);
    expect(
      rollRequestsFromRoom(roomSnapshot({ pendingRollRequest: legacyRequest }))
    ).toEqual([legacyRequest]);
    expect(rollRequestsFromRoom(roomSnapshot())).toEqual([]);
  });

  it("detects whether a room snapshot answered an optimistic player submission", () => {
    const pendingSubmission = {
      messageId: "player-turn",
      createdAt: "2026-07-11T10:00:00.000Z"
    };

    expect(
      snapshotHasResponseAfterMessage(
        roomSnapshot({
          messages: [
            message("player-turn", "player", "2026-07-11T10:00:00.000Z"),
            message("dm-answer", "dm", "2026-07-11T10:00:03.000Z")
          ]
        }),
        pendingSubmission
      )
    ).toBe(true);

    expect(
      snapshotHasResponseAfterMessage(
        roomSnapshot({
          messages: [
            message("dm-before", "dm", "2026-07-11T09:59:59.000Z"),
            message("other-player", "player", "2026-07-11T10:00:03.000Z")
          ]
        }),
        pendingSubmission
      )
    ).toBe(false);

    expect(
      snapshotHasResponseAfterMessage(
        roomSnapshot({
          messages: [
            message("system-after", "system", "2026-07-11T10:00:00.000Z")
          ]
        }),
        pendingSubmission
      )
    ).toBe(true);
  });
});
