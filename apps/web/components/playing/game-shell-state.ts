import type {
  DiceRollRequest,
  GameMessage,
  InputPolicy,
  NextInputNeeded
} from "@/lib/game-types";
import {
  defaultCharacterSheet,
  type PlayerProfile
} from "./PlayerPanel";

export type CampaignMode = "single_player" | "multiplayer";

export type RoomPlayer = {
  id: string;
  actorKey?: string;
  slot: number;
  username: string;
  characterName: string;
  characterSheet: string;
  combatCheatSheet?: string | null;
  combatCheatSheetUpdatedAt?: string | null;
  combatCheatSheetSourceHash?: string | null;
  portraitAssetId?: string;
  portraitUrl?: string;
  portraitStatus?: "pending" | "ready" | "failed";
  status: "waiting" | "submitted";
};

export type RoomSnapshot = {
  roomId: string;
  mode: CampaignMode;
  sessionId: string;
  currentPlayerId?: string;
  players: RoomPlayer[];
  messages: GameMessage[];
  isResolving: boolean;
  hasBegun: boolean;
  pendingRollRequest: DiceRollRequest | null;
  pendingRollRequests?: DiceRollRequest[];
  nextInputNeeded?: NextInputNeeded;
  inputTargets?: string[];
  inputPolicy?: InputPolicy;
  combat?: {
    active: boolean;
    round: number;
    turnOwner: string | null;
    turnOwnerPlayerId: string | null;
    turnOwnerCharacterName: string | null;
    initiativeOrder: string[];
  };
  death?: {
    state: "dying" | "stable" | "dead" | null;
    actorKey: string | null;
    characterName: string | null;
    successes: number;
    failures: number;
    canRevive: boolean;
    canCreateNewCampaign: boolean;
  };
  updatedAt?: string;
};

export type PendingSubmission = {
  messageId: string;
  createdAt: string;
};

export type WaitingPlayerStatus = {
  id: string;
  name: string;
  detail?: string;
  status: "waiting" | "submitted";
};

export type RoomSnapshotSubmissionUpdate = {
  inputSubmitted: boolean;
  stopSending: boolean;
  clearPendingSubmission: boolean;
  clearOptimisticSubmittedPlayerId: boolean;
};

export function turnSubmissionValidationMessage({
  pendingRollRequests,
  currentPendingRollRequest,
  isWaitingOnTargetedInput,
  isWaitingOnCombatTurn,
  combatTurnOwnerName,
  isSinglePlayer,
  hasAdventureBegun,
  playerProfile
}: {
  pendingRollRequests: DiceRollRequest[];
  currentPendingRollRequest: DiceRollRequest | null;
  isWaitingOnTargetedInput: boolean;
  isWaitingOnCombatTurn: boolean;
  combatTurnOwnerName?: string | undefined;
  isSinglePlayer: boolean;
  hasAdventureBegun: boolean;
  playerProfile: PlayerProfile;
}) {
  if (pendingRollRequests.length > 0) {
    return currentPendingRollRequest
      ? "The DM is waiting for the required roll."
      : "The DM is waiting on another player's roll.";
  }

  if (isWaitingOnTargetedInput) {
    return "The DM is waiting on another player.";
  }

  if (isWaitingOnCombatTurn) {
    return combatTurnOwnerName
      ? `Waiting on ${combatTurnOwnerName}'s combat turn.`
      : "Waiting on another combat turn.";
  }

  if (!isSinglePlayer && !hasAdventureBegun) {
    return "Begin the adventure before sending turns.";
  }

  if (!isSinglePlayer) {
    const missingProfileFields = getMissingPlayerProfileFields(playerProfile);

    if (missingProfileFields.length > 0) {
      return `Finish your ${missingProfileFields.join(", ")} before sending.`;
    }
  }

  return null;
}

export function displayedRoomPlayersWithOptimisticSubmission(
  roomPlayers: RoomPlayer[],
  optimisticSubmittedPlayerId: string | null
) {
  if (!optimisticSubmittedPlayerId) {
    return roomPlayers;
  }

  return roomPlayers.map((roomPlayer) =>
    roomPlayer.id === optimisticSubmittedPlayerId
      ? { ...roomPlayer, status: "submitted" as const }
      : roomPlayer
  );
}

export function waitingPlayerStatuses({
  roomPlayers,
  hasAdventureBegun,
  isSinglePlayer,
  inputPolicy = "all_players",
  inputTargets = []
}: {
  roomPlayers: RoomPlayer[];
  hasAdventureBegun: boolean;
  isSinglePlayer: boolean;
  inputPolicy?: InputPolicy;
  inputTargets?: string[];
}): WaitingPlayerStatus[] {
  if (isSinglePlayer || !hasAdventureBegun) {
    return [];
  }

  const visibleRoomPlayers =
    inputPolicy === "only_targeted_players" && inputTargets.length > 0
      ? roomPlayers.filter((roomPlayer) =>
          inputTargetsCurrentPlayer(
            inputTargets,
            {
              username: roomPlayer.username,
              characterName: roomPlayer.characterName,
              characterSheet: roomPlayer.characterSheet
            },
            roomPlayer
          )
        )
      : roomPlayers;

  return visibleRoomPlayers
    .filter((roomPlayer) => roomPlayer.status === "waiting")
    .map((roomPlayer) => ({
      id: roomPlayer.id,
      status: roomPlayer.status,
      name: roomPlayer.characterName || roomPlayer.username || "Player",
      detail:
        roomPlayer.characterName && roomPlayer.username
          ? roomPlayer.username
          : undefined
    }));
}

export function activeCharacterSheetForRoom({
  currentRoomPlayer,
  roomPlayers,
  playerProfile
}: {
  currentRoomPlayer?: RoomPlayer;
  roomPlayers: RoomPlayer[];
  playerProfile: PlayerProfile;
}) {
  return (
    currentRoomPlayer?.characterSheet ||
    roomPlayers.find((roomPlayer) => roomPlayer.characterSheet.trim())
      ?.characterSheet ||
    playerProfile.characterSheet
  );
}

export function activeResourcePlayerForRoom({
  currentRoomPlayer,
  roomPlayers
}: {
  currentRoomPlayer?: RoomPlayer;
  roomPlayers: RoomPlayer[];
}) {
  return (
    currentRoomPlayer ??
    roomPlayers.find((roomPlayer) => roomPlayer.characterSheet.trim())
  );
}

export function isWaitingOnAnotherPlayerRoll({
  isSinglePlayer,
  pendingRollRequests,
  currentPendingRollRequest
}: {
  isSinglePlayer: boolean;
  pendingRollRequests: DiceRollRequest[];
  currentPendingRollRequest: DiceRollRequest | null;
}) {
  return (
    !isSinglePlayer &&
    pendingRollRequests.length > 0 &&
    !currentPendingRollRequest
  );
}

export function isWaitingOnTargetedInput({
  isSinglePlayer,
  inputPolicy,
  inputTargets,
  playerProfile,
  currentRoomPlayer
}: {
  isSinglePlayer: boolean;
  inputPolicy: InputPolicy;
  inputTargets: string[];
  playerProfile: PlayerProfile;
  currentRoomPlayer?: RoomPlayer;
}) {
  return (
    !isSinglePlayer &&
    inputPolicy === "only_targeted_players" &&
    inputTargets.length > 0 &&
    !inputTargetsCurrentPlayer(inputTargets, playerProfile, currentRoomPlayer)
  );
}

export function combatTurnOwnerName(
  combat: RoomSnapshot["combat"] | undefined
) {
  return combat?.turnOwnerCharacterName?.trim() || undefined;
}

export function isWaitingOnCombatTurn({
  isSinglePlayer,
  combat,
  currentRoomPlayer
}: {
  isSinglePlayer: boolean;
  combat: RoomSnapshot["combat"] | undefined;
  currentRoomPlayer?: RoomPlayer;
}) {
  if (isSinglePlayer || !combat?.active || !combat.turnOwner) {
    return false;
  }

  if (!combat.turnOwnerPlayerId) {
    return true;
  }

  return currentRoomPlayer?.id !== combat.turnOwnerPlayerId;
}

export function hasOptimisticSubmissionForCurrentPlayer({
  isSinglePlayer,
  optimisticSubmittedPlayerId,
  playerId
}: {
  isSinglePlayer: boolean;
  optimisticSubmittedPlayerId: string | null;
  playerId: string;
}) {
  return !isSinglePlayer && optimisticSubmittedPlayerId === playerId;
}

export function isInputSubmittedForCurrentRoomState({
  isInputSubmitted,
  hasOptimisticSubmission,
  pendingRollRequests,
  currentPendingRollRequest,
  isWaitingOnTargetedInput
}: {
  isInputSubmitted: boolean;
  hasOptimisticSubmission: boolean;
  pendingRollRequests: DiceRollRequest[];
  currentPendingRollRequest: DiceRollRequest | null;
  isWaitingOnTargetedInput: boolean;
}) {
  return (
    (isInputSubmitted || hasOptimisticSubmission) &&
    (pendingRollRequests.length === 0 || Boolean(currentPendingRollRequest)) &&
    !isWaitingOnTargetedInput
  );
}

export function snapshotHasResponseAfterMessage(
  room: RoomSnapshot,
  pendingSubmission: PendingSubmission
) {
  const messageIndex = room.messages.findIndex(
    (message) => message.id === pendingSubmission.messageId
  );

  if (messageIndex >= 0) {
    return room.messages
      .slice(messageIndex + 1)
      .some((message) => message.role === "dm" || message.role === "system");
  }

  const pendingSubmittedAt = Date.parse(pendingSubmission.createdAt);

  return room.messages.some((message) => {
    if (message.role !== "dm" && message.role !== "system") {
      return false;
    }

    return Date.parse(message.createdAt) >= pendingSubmittedAt;
  });
}

export function roomSnapshotSubmissionUpdate({
  room,
  currentPlayer,
  pendingSubmission,
  optimisticSubmittedPlayerId,
  playerId
}: {
  room: RoomSnapshot;
  currentPlayer?: RoomPlayer;
  pendingSubmission: PendingSubmission | null;
  optimisticSubmittedPlayerId: string | null;
  playerId: string;
}): RoomSnapshotSubmissionUpdate | null {
  if (currentPlayer?.status === "submitted" || room.isResolving) {
    return {
      inputSubmitted: true,
      stopSending: currentPlayer?.status === "submitted",
      clearPendingSubmission: false,
      clearOptimisticSubmittedPlayerId: false
    };
  }

  if (currentPlayer?.status !== "waiting") {
    return null;
  }

  if (
    pendingSubmission &&
    optimisticSubmittedPlayerId === playerId &&
    !snapshotHasResponseAfterMessage(room, pendingSubmission)
  ) {
    return {
      inputSubmitted: true,
      stopSending: false,
      clearPendingSubmission: false,
      clearOptimisticSubmittedPlayerId: false
    };
  }

  return {
    inputSubmitted: false,
    stopSending: true,
    clearPendingSubmission: true,
    clearOptimisticSubmittedPlayerId: true
  };
}

export function getMissingPlayerProfileFields(profile: PlayerProfile) {
  const hasCharacterSheetContent =
    profile.characterSheet.trim().length > 0 &&
    profile.characterSheet.trim() !== defaultCharacterSheet.trim();

  return [
    profile.username.trim() ? null : "username",
    profile.characterName.trim() ? null : "character name",
    hasCharacterSheetContent ? null : "character sheet"
  ].filter((field): field is string => field !== null);
}

export function rollRequestsFromRoom(room: RoomSnapshot) {
  return (
    room.pendingRollRequests ??
    (room.pendingRollRequest ? [room.pendingRollRequest] : [])
  );
}

function normalizePlayerTarget(value: string | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rollRequestTargetsCurrentPlayer(
  request: DiceRollRequest,
  profile: PlayerProfile,
  roomPlayer?: RoomPlayer
) {
  const target = normalizePlayerTarget(request.player);

  if (!target) {
    return true;
  }

  const playerNames = [
    roomPlayer?.actorKey,
    roomPlayer?.id,
    roomPlayer?.id ? `player:${roomPlayer.id}` : undefined,
    profile.username,
    profile.characterName,
    roomPlayer?.username,
    roomPlayer?.characterName
  ]
    .map(normalizePlayerTarget)
    .filter((name): name is string => Boolean(name));

  return playerNames.some(
    (name) =>
      target === name ||
      target.includes(name) ||
      name.includes(target)
  );
}

export function inputTargetsCurrentPlayer(
  inputTargets: string[],
  profile: PlayerProfile,
  roomPlayer?: RoomPlayer
) {
  if (inputTargets.length === 0) {
    return true;
  }

  return inputTargets.some((target) =>
    rollRequestTargetsCurrentPlayer(
      {
        id: "input-target",
        dice: "1d20",
        label: "Input target",
        player: target
      },
      profile,
      roomPlayer
    )
  );
}

export function currentPlayerRollRequests(
  pendingRequests: DiceRollRequest[],
  profile: PlayerProfile,
  roomPlayer: RoomPlayer | undefined,
  isSinglePlayer: boolean
) {
  if (isSinglePlayer) {
    return pendingRequests;
  }

  if (
    pendingRequests.length === 0 ||
    !rollRequestTargetsCurrentPlayer(pendingRequests[0], profile, roomPlayer)
  ) {
    return [];
  }

  const targetedRequests: DiceRollRequest[] = [];

  for (const request of pendingRequests) {
    if (!rollRequestTargetsCurrentPlayer(request, profile, roomPlayer)) {
      break;
    }

    targetedRequests.push(request);
  }

  return targetedRequests;
}
