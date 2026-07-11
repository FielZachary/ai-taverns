import type {
  DiceRollRequest,
  GameMessage,
  InputPolicy
} from "@/lib/game-types";
import {
  defaultCharacterSheet,
  type PlayerProfile
} from "./PlayerPanel";

export type CampaignMode = "single_player" | "multiplayer";

export type RoomPlayer = {
  id: string;
  slot: number;
  username: string;
  characterName: string;
  characterSheet: string;
  status: "waiting" | "submitted";
};

export type RoomSnapshot = {
  roomId: string;
  mode: CampaignMode;
  sessionId: string;
  players: RoomPlayer[];
  messages: GameMessage[];
  isResolving: boolean;
  hasBegun: boolean;
  pendingRollRequest: DiceRollRequest | null;
  pendingRollRequests?: DiceRollRequest[];
  inputTargets?: string[];
  inputPolicy?: InputPolicy;
  updatedAt?: string;
};

export type PendingSubmission = {
  messageId: string;
  createdAt: string;
};

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
