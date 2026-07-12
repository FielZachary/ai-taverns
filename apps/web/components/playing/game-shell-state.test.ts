import { describe, expect, it } from "vitest";

import type { DiceRollRequest, GameMessage } from "@/lib/game-types";
import { defaultCharacterSheet, type PlayerProfile } from "./PlayerPanel";
import {
  activeCharacterSheetForRoom,
  currentPlayerRollRequests,
  displayedRoomPlayersWithOptimisticSubmission,
  getMissingPlayerProfileFields,
  hasOptimisticSubmissionForCurrentPlayer,
  isInputSubmittedForCurrentRoomState,
  isWaitingOnAnotherPlayerRoll,
  isWaitingOnTargetedInput,
  inputTargetsCurrentPlayer,
  rollRequestTargetsCurrentPlayer,
  rollRequestsFromRoom,
  roomSnapshotSubmissionUpdate,
  snapshotHasResponseAfterMessage,
  turnSubmissionValidationMessage,
  waitingPlayerStatuses,
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

  it("returns turn submission validation messages for blocking room states", () => {
    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [rollRequest("current", "Nyx")],
        currentPendingRollRequest: rollRequest("current", "Nyx"),
        isWaitingOnTargetedInput: false,
        isSinglePlayer: false,
        hasAdventureBegun: true,
        playerProfile: completeProfile
      })
    ).toBe("The DM is waiting for the required roll.");

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [rollRequest("other", "Bran")],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false,
        isSinglePlayer: false,
        hasAdventureBegun: true,
        playerProfile: completeProfile
      })
    ).toBe("The DM is waiting on another player's roll.");

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: true,
        isSinglePlayer: false,
        hasAdventureBegun: true,
        playerProfile: completeProfile
      })
    ).toBe("The DM is waiting on another player.");

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false,
        isSinglePlayer: false,
        hasAdventureBegun: false,
        playerProfile: completeProfile
      })
    ).toBe("Begin the adventure before sending turns.");
  });

  it("requires complete multiplayer profiles before turn submission but allows solo play", () => {
    const incompleteProfile = {
      username: "",
      characterName: " ",
      characterSheet: defaultCharacterSheet
    };

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false,
        isSinglePlayer: false,
        hasAdventureBegun: true,
        playerProfile: incompleteProfile
      })
    ).toBe("Finish your username, character name, character sheet before sending.");

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false,
        isSinglePlayer: true,
        hasAdventureBegun: false,
        playerProfile: incompleteProfile
      })
    ).toBeNull();

    expect(
      turnSubmissionValidationMessage({
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false,
        isSinglePlayer: false,
        hasAdventureBegun: true,
        playerProfile: completeProfile
      })
    ).toBeNull();
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

  it("derives room snapshot submission updates for submitted and resolving rooms", () => {
    expect(
      roomSnapshotSubmissionUpdate({
        room: roomSnapshot(),
        currentPlayer: {
          ...currentRoomPlayer,
          status: "submitted"
        },
        pendingSubmission: null,
        optimisticSubmittedPlayerId: null,
        playerId: "player-1"
      })
    ).toEqual({
      inputSubmitted: true,
      stopSending: true,
      clearPendingSubmission: false,
      clearOptimisticSubmittedPlayerId: false
    });

    expect(
      roomSnapshotSubmissionUpdate({
        room: roomSnapshot({ isResolving: true }),
        currentPlayer: {
          ...currentRoomPlayer,
          status: "waiting"
        },
        pendingSubmission: null,
        optimisticSubmittedPlayerId: null,
        playerId: "player-1"
      })
    ).toEqual({
      inputSubmitted: true,
      stopSending: false,
      clearPendingSubmission: false,
      clearOptimisticSubmittedPlayerId: false
    });
  });

  it("keeps or clears optimistic submitted state from waiting room snapshots", () => {
    const pendingSubmission = {
      messageId: "player-turn",
      createdAt: "2026-07-11T10:00:00.000Z"
    };

    expect(
      roomSnapshotSubmissionUpdate({
        room: roomSnapshot({
          messages: [
            message("player-turn", "player", "2026-07-11T10:00:00.000Z"),
            message("other-player", "player", "2026-07-11T10:00:02.000Z")
          ]
        }),
        currentPlayer: {
          ...currentRoomPlayer,
          status: "waiting"
        },
        pendingSubmission,
        optimisticSubmittedPlayerId: "player-1",
        playerId: "player-1"
      })
    ).toEqual({
      inputSubmitted: true,
      stopSending: false,
      clearPendingSubmission: false,
      clearOptimisticSubmittedPlayerId: false
    });

    expect(
      roomSnapshotSubmissionUpdate({
        room: roomSnapshot({
          messages: [
            message("player-turn", "player", "2026-07-11T10:00:00.000Z"),
            message("dm-answer", "dm", "2026-07-11T10:00:03.000Z")
          ]
        }),
        currentPlayer: {
          ...currentRoomPlayer,
          status: "waiting"
        },
        pendingSubmission,
        optimisticSubmittedPlayerId: "player-1",
        playerId: "player-1"
      })
    ).toEqual({
      inputSubmitted: false,
      stopSending: true,
      clearPendingSubmission: true,
      clearOptimisticSubmittedPlayerId: true
    });
  });

  it("leaves submission state unchanged when the current player is absent", () => {
    expect(
      roomSnapshotSubmissionUpdate({
        room: roomSnapshot(),
        currentPlayer: undefined,
        pendingSubmission: null,
        optimisticSubmittedPlayerId: null,
        playerId: "player-1"
      })
    ).toBeNull();
  });

  it("marks the optimistic submitted player without changing other room players", () => {
    const waitingPlayer: RoomPlayer = {
      ...currentRoomPlayer,
      status: "waiting"
    };
    const otherPlayer: RoomPlayer = {
      id: "player-2",
      slot: 2,
      username: "Bran",
      characterName: "Bran Oak",
      characterSheet: "Name: Bran",
      status: "waiting"
    };

    expect(
      displayedRoomPlayersWithOptimisticSubmission(
        [waitingPlayer, otherPlayer],
        "player-1"
      )
    ).toEqual([
      {
        ...waitingPlayer,
        status: "submitted"
      },
      otherPlayer
    ]);
    const unchangedPlayers = [waitingPlayer, otherPlayer];

    expect(
      displayedRoomPlayersWithOptimisticSubmission(unchangedPlayers, null)
    ).toBe(unchangedPlayers);
  });

  it("shapes waiting player statuses only after multiplayer adventure start", () => {
    const players: RoomPlayer[] = [
      {
        ...currentRoomPlayer,
        username: "Ada",
        characterName: "Nyx",
        status: "waiting"
      },
      {
        id: "player-2",
        slot: 2,
        username: "Bran",
        characterName: "",
        characterSheet: "Name: Bran",
        status: "waiting"
      },
      {
        id: "player-3",
        slot: 3,
        username: "",
        characterName: "",
        characterSheet: "",
        status: "waiting"
      },
      {
        id: "player-4",
        slot: 4,
        username: "Submitted",
        characterName: "Done",
        characterSheet: "Name: Done",
        status: "submitted"
      }
    ];

    expect(
      waitingPlayerStatuses({
        roomPlayers: players,
        hasAdventureBegun: false,
        isSinglePlayer: false
      })
    ).toEqual([]);
    expect(
      waitingPlayerStatuses({
        roomPlayers: players,
        hasAdventureBegun: true,
        isSinglePlayer: true
      })
    ).toEqual([]);
    expect(
      waitingPlayerStatuses({
        roomPlayers: players,
        hasAdventureBegun: true,
        isSinglePlayer: false
      })
    ).toEqual([
      {
        id: "player-1",
        status: "waiting",
        name: "Nyx",
        detail: "Ada"
      },
      {
        id: "player-2",
        status: "waiting",
        name: "Bran",
        detail: undefined
      },
      {
        id: "player-3",
        status: "waiting",
        name: "Player",
        detail: undefined
      }
    ]);
  });

  it("selects the active character sheet from current player, room players, then profile", () => {
    const fallbackProfile = {
      ...completeProfile,
      characterSheet: "Profile sheet"
    };
    const roomPlayers: RoomPlayer[] = [
      {
        ...currentRoomPlayer,
        characterSheet: ""
      },
      {
        id: "player-2",
        slot: 2,
        username: "Bran",
        characterName: "Bran",
        characterSheet: "Bran sheet",
        status: "waiting"
      }
    ];

    expect(
      activeCharacterSheetForRoom({
        currentRoomPlayer: {
          ...currentRoomPlayer,
          characterSheet: "Current sheet"
        },
        roomPlayers,
        playerProfile: fallbackProfile
      })
    ).toBe("Current sheet");
    expect(
      activeCharacterSheetForRoom({
        currentRoomPlayer: {
          ...currentRoomPlayer,
          characterSheet: ""
        },
        roomPlayers,
        playerProfile: fallbackProfile
      })
    ).toBe("Bran sheet");
    expect(
      activeCharacterSheetForRoom({
        roomPlayers: [
          {
            ...currentRoomPlayer,
            characterSheet: " "
          }
        ],
        playerProfile: fallbackProfile
      })
    ).toBe("Profile sheet");
  });

  it("detects when multiplayer input is waiting on another player's roll", () => {
    expect(
      isWaitingOnAnotherPlayerRoll({
        isSinglePlayer: false,
        pendingRollRequests: [rollRequest("other", "Bran")],
        currentPendingRollRequest: null
      })
    ).toBe(true);
    expect(
      isWaitingOnAnotherPlayerRoll({
        isSinglePlayer: false,
        pendingRollRequests: [rollRequest("current", "Nyx")],
        currentPendingRollRequest: rollRequest("current", "Nyx")
      })
    ).toBe(false);
    expect(
      isWaitingOnAnotherPlayerRoll({
        isSinglePlayer: true,
        pendingRollRequests: [rollRequest("solo")],
        currentPendingRollRequest: null
      })
    ).toBe(false);
  });

  it("detects when targeted input excludes the current player", () => {
    expect(
      isWaitingOnTargetedInput({
        isSinglePlayer: false,
        inputPolicy: "only_targeted_players",
        inputTargets: ["Bran"],
        playerProfile: completeProfile,
        currentRoomPlayer
      })
    ).toBe(true);
    expect(
      isWaitingOnTargetedInput({
        isSinglePlayer: false,
        inputPolicy: "only_targeted_players",
        inputTargets: ["Nyx"],
        playerProfile: completeProfile,
        currentRoomPlayer
      })
    ).toBe(false);
    expect(
      isWaitingOnTargetedInput({
        isSinglePlayer: false,
        inputPolicy: "all_players",
        inputTargets: ["Bran"],
        playerProfile: completeProfile,
        currentRoomPlayer
      })
    ).toBe(false);
    expect(
      isWaitingOnTargetedInput({
        isSinglePlayer: true,
        inputPolicy: "only_targeted_players",
        inputTargets: ["Bran"],
        playerProfile: completeProfile,
        currentRoomPlayer
      })
    ).toBe(false);
  });

  it("treats optimistic submissions as current-player submitted state only in multiplayer", () => {
    expect(
      hasOptimisticSubmissionForCurrentPlayer({
        isSinglePlayer: false,
        optimisticSubmittedPlayerId: "player-1",
        playerId: "player-1"
      })
    ).toBe(true);
    expect(
      hasOptimisticSubmissionForCurrentPlayer({
        isSinglePlayer: false,
        optimisticSubmittedPlayerId: "player-2",
        playerId: "player-1"
      })
    ).toBe(false);
    expect(
      hasOptimisticSubmissionForCurrentPlayer({
        isSinglePlayer: true,
        optimisticSubmittedPlayerId: "player-1",
        playerId: "player-1"
      })
    ).toBe(false);
  });

  it("keeps submitted input state only when the current room state still expects it", () => {
    expect(
      isInputSubmittedForCurrentRoomState({
        isInputSubmitted: true,
        hasOptimisticSubmission: false,
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false
      })
    ).toBe(true);
    expect(
      isInputSubmittedForCurrentRoomState({
        isInputSubmitted: false,
        hasOptimisticSubmission: true,
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false
      })
    ).toBe(true);
    expect(
      isInputSubmittedForCurrentRoomState({
        isInputSubmitted: true,
        hasOptimisticSubmission: false,
        pendingRollRequests: [rollRequest("other", "Bran")],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: false
      })
    ).toBe(false);
    expect(
      isInputSubmittedForCurrentRoomState({
        isInputSubmitted: true,
        hasOptimisticSubmission: false,
        pendingRollRequests: [rollRequest("current", "Nyx")],
        currentPendingRollRequest: rollRequest("current", "Nyx"),
        isWaitingOnTargetedInput: false
      })
    ).toBe(true);
    expect(
      isInputSubmittedForCurrentRoomState({
        isInputSubmitted: true,
        hasOptimisticSubmission: false,
        pendingRollRequests: [],
        currentPendingRollRequest: null,
        isWaitingOnTargetedInput: true
      })
    ).toBe(false);
  });
});
