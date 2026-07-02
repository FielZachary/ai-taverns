"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Dice5,
  Flame,
  LogOut,
  Play,
  Send,
  X
} from "lucide-react";
import type {
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission,
  GameMessage,
  InputPolicy
} from "@/lib/game-types";
import {
  ChatHistorySidebar,
  type ChatSummary
} from "./ChatHistorySidebar";
import { MessageLog, type ChatPlayerStatus } from "./MessageLog";
import {
  defaultCharacterSheet,
  emptyPlayerProfile,
  type PlayerProfile
} from "./PlayerPanel";
import { DiceRollReveal3D } from "./DiceRollReveal3D";
import { PlayerInput, type DiceFace, type QueuedDice } from "./PlayerInput";

const openingMessages: GameMessage[] = [];
const playerIdStorageKey = "ai-dnd.playerId";
const roomRequestTimeoutMs = 8_000;

type CampaignMode = "single_player" | "multiplayer";

type CampaignSummary = ChatSummary & {
  hermesSessionId: string;
  mode: CampaignMode;
  joinCode?: string;
};

type CampaignsApiResponse = {
  campaigns?: CampaignSummary[];
  campaign?: CampaignSummary;
  error?: string;
};

type ApiErrorResponse = {
  error?: string;
};

type RoomPlayer = {
  id: string;
  slot: number;
  username: string;
  characterName: string;
  characterSheet: string;
  status: "waiting" | "submitted";
};

type RoomSnapshot = {
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
};

type GameShellProps = {
  initialCampaignId?: string;
  userEmail?: string;
};

type ActiveDiceReveal = {
  id: string;
  notation: string;
  expression: string;
  total: number;
  onComplete: () => void;
};

type PendingRollBatch = {
  requests: DiceRollRequest[];
  expression: string;
  notation: string;
  entries: {
    request: DiceRollRequest;
    count: number;
    sides: number;
  }[];
};

function getMissingPlayerProfileFields(profile: PlayerProfile) {
  const hasCharacterSheetContent =
    profile.characterSheet.trim().length > 0 &&
    profile.characterSheet.trim() !== defaultCharacterSheet.trim();

  return [
    profile.username.trim() ? null : "username",
    profile.characterName.trim() ? null : "character name",
    hasCharacterSheetContent ? null : "character sheet"
  ].filter((field): field is string => field !== null);
}

function rollRequestsFromRoom(room: RoomSnapshot) {
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

function rollRequestTargetsCurrentPlayer(
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

function inputTargetsCurrentPlayer(
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

function currentPlayerRollRequests(
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

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function modifierText(modifier: number | undefined) {
  if (!modifier) {
    return "";
  }

  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

function rollDiceExpression(dice: string, modifier: number | undefined) {
  const match = dice.trim().match(/^(\d*)d(\d+)$/i);

  if (!match) {
    throw new Error("The DM requested an unsupported dice roll.");
  }

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);

  if (
    !Number.isInteger(count) ||
    !Number.isInteger(sides) ||
    count < 1 ||
    count > 20 ||
    sides < 2 ||
    sides > 1000
  ) {
    throw new Error("The DM requested an unsupported dice roll.");
  }

  const rolls = Array.from(
    { length: count },
    () => Math.floor(Math.random() * sides) + 1
  );
  const total = rolls.reduce((sum, roll) => sum + roll, modifier ?? 0);

  return {
    rolls,
    total
  };
}

function parseSimpleDiceExpression(dice: string) {
  const match = dice.trim().match(/^(\d*)d(4|6|8|10|12|20)$/i);

  if (!match) {
    return null;
  }

  return {
    count: Number(match[1] || "1"),
    sides: Number(match[2])
  };
}

function diceExpression(count: number, sides: number) {
  return `${count}d${sides}`;
}

function normalizedAdvantageState(request: DiceRollRequest) {
  const state = request.advantageState?.trim().toLowerCase();

  return state === "advantage" || state === "disadvantage" ? state : "normal";
}

function physicalRollCountForRequest(request: DiceRollRequest, count: number, sides: number) {
  return count === 1 &&
    sides === 20 &&
    normalizedAdvantageState(request) !== "normal"
    ? 2
    : count;
}

function scoredRollsForRequest(request: DiceRollRequest, rolls: number[]) {
  const advantageState = normalizedAdvantageState(request);

  if (rolls.length === 2 && advantageState === "advantage") {
    return [Math.max(...rolls)];
  }

  if (rolls.length === 2 && advantageState === "disadvantage") {
    return [Math.min(...rolls)];
  }

  return rolls;
}

function queuedDiceEntries(queuedDice: QueuedDice) {
  const faceOrder: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

  return faceOrder
    .map((face) => ({
      face,
      count: queuedDice[face] ?? 0
    }))
    .filter((entry) => entry.count > 0);
}

function diceExpressionFromQueue(queuedDice: QueuedDice) {
  return queuedDiceEntries(queuedDice)
    .map(({ face, count }) => `${count}${face}`)
    .join(" + ");
}

function diceNotationFromQueue(queuedDice: QueuedDice) {
  return queuedDiceEntries(queuedDice)
    .map(({ face, count }) => `${count}${face}`)
    .join("+");
}

function diceFaceFromSides(sides: number): DiceFace | null {
  const face = `d${sides}` as DiceFace;

  return ["d4", "d6", "d8", "d10", "d12", "d20"].includes(face)
    ? face
    : null;
}

function diceExpressionFromBatchEntries(
  entries: PendingRollBatch["entries"],
  separator = " + "
) {
  const groups: { count: number; sides: number }[] = [];

  entries.forEach((entry) => {
    const previousGroup = groups[groups.length - 1];

    if (previousGroup?.sides === entry.sides) {
      previousGroup.count += entry.count;
      return;
    }

    groups.push({
      count: entry.count,
      sides: entry.sides
    });
  });

  return groups
    .map((group) => diceExpression(group.count, group.sides))
    .join(separator);
}

function requiredDiceQueueFromRequests(pendingRequests: DiceRollRequest[]) {
  const queuedDice: QueuedDice = {};
  const entries: PendingRollBatch["entries"] = [];

  for (const request of pendingRequests) {
    const parsed = parseSimpleDiceExpression(request.dice);
    const face = parsed ? diceFaceFromSides(parsed.sides) : null;

    if (!parsed || !face) {
      return null;
    }

    const physicalCount = physicalRollCountForRequest(
      request,
      parsed.count,
      parsed.sides
    );

    queuedDice[face] = (queuedDice[face] ?? 0) + physicalCount;
    entries.push({
      request,
      count: physicalCount,
      sides: parsed.sides
    });
  }

  return {
    queuedDice,
    entries,
    expression: diceExpressionFromBatchEntries(entries),
    notation: diceExpressionFromBatchEntries(entries, "+")
  };
}

function diceQueuesMatch(left: QueuedDice, right: QueuedDice) {
  const faces: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

  return faces.every((face) => (left[face] ?? 0) === (right[face] ?? 0));
}

function predeterminedDiceNotation(dice: string, rolls: number[]) {
  return `${dice.replace(/\s+/g, "")}@${rolls.join(",")}`;
}

function rollQueuedDice(queuedDice: QueuedDice) {
  const entries = queuedDiceEntries(queuedDice);
  const rollsByFace = entries.map(({ face, count }) => {
    const sides = Number(face.slice(1));
    const rolls = Array.from(
      { length: count },
      () => Math.floor(Math.random() * sides) + 1
    );

    return {
      face,
      rolls
    };
  });
  const total = rollsByFace.reduce(
    (sum, group) => sum + group.rolls.reduce((groupSum, roll) => groupSum + roll, 0),
    0
  );
  const details = rollsByFace
    .map(({ face, rolls }) => `${face}: ${rolls.join(", ")}`)
    .join("; ");
  const rolls = rollsByFace.flatMap((group) => group.rolls);
  const notation = predeterminedDiceNotation(
    diceNotationFromQueue(queuedDice),
    rolls
  );

  return {
    expression: diceExpressionFromQueue(queuedDice),
    notation,
    rolls,
    total,
    content: `I rolled ${diceExpressionFromQueue(queuedDice)}: ${total} (${details}).`
  };
}

function pendingRollBatchFromQueue(
  queuedDice: QueuedDice,
  pendingRequests: DiceRollRequest[]
): PendingRollBatch | null {
  const requiredDice = requiredDiceQueueFromRequests(pendingRequests);

  if (!requiredDice || !diceQueuesMatch(queuedDice, requiredDice.queuedDice)) {
    return null;
  }

  return {
    requests: pendingRequests,
    expression: requiredDice.expression,
    notation: requiredDice.notation,
    entries: requiredDice.entries
  };
}

function expectedPendingRollExpression(pendingRequests: DiceRollRequest[]) {
  const requiredDice = requiredDiceQueueFromRequests(pendingRequests);

  return requiredDice?.expression ?? pendingRequests[0]?.dice ?? "the required dice";
}

function rollPendingBatch(batch: PendingRollBatch, clientMessageId: string) {
  const rolls: number[] = [];
  const rollSubmissions: DiceRollSubmission[] = batch.entries.map((entry) => {
    const requestRolls = Array.from(
      { length: entry.count },
      () => Math.floor(Math.random() * entry.sides) + 1
    );

    rolls.push(...requestRolls);

    return {
      rollRequestId: entry.request.id,
      rollResult: {
        rolls: requestRolls,
        total: scoredRollsForRequest(entry.request, requestRolls).reduce(
          (sum, roll) => sum + roll,
          entry.request.modifier ?? 0
        )
      },
      clientMessageId
    };
  });
  const total = rollSubmissions.reduce(
    (sum, submission) => sum + submission.rollResult.total,
    0
  );
  const content = rollSubmissions
    .map((submission, index) =>
      formatRollSubmission(batch.requests[index], submission.rollResult)
    )
    .join("\n");

  return {
    rolls,
    total,
    content,
    rollSubmissions
  };
}

function formatRollSubmission(
  request: DiceRollRequest,
  result: DiceRollResult
) {
  const rollText =
    result.rolls.length === 1
      ? String(result.rolls[0])
      : result.rolls.join(", ");

  return `I rolled ${request.dice}${modifierText(request.modifier)}: ${
    result.total
  } (${rollText}) for ${request.label}.`;
}

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    return data.error?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function updateCampaignPreview(
  campaigns: CampaignSummary[],
  campaignId: string,
  preview: string
) {
  void preview;

  return campaigns.map((campaign) =>
    campaign.id === campaignId
      ? {
          ...campaign
        }
      : campaign
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = roomRequestTimeoutMs
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function GameShell({ initialCampaignId, userEmail }: GameShellProps) {
  const [messages, setMessages] = useState<GameMessage[]>(openingMessages);
  const [availableCampaigns, setAvailableCampaigns] = useState<CampaignSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<
    string | null
  >(null);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingChat] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaignId ?? "");
  const [playerProfile, setPlayerProfile] =
    useState<PlayerProfile>(emptyPlayerProfile);
  const [inputValidationMessage, setInputValidationMessage] = useState("");
  const [inputValidationPulse, setInputValidationPulse] = useState(0);
  const [isInputSubmitted, setIsInputSubmitted] = useState(false);
  const [tableAlert, setTableAlert] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [roomMessages, setRoomMessages] = useState<GameMessage[]>([]);
  const [isRoomResolving, setIsRoomResolving] = useState(false);
  const [hasAdventureBegun, setHasAdventureBegun] = useState(false);
  const [pendingRollRequests, setPendingRollRequests] = useState<
    DiceRollRequest[]
  >([]);
  const [inputTargets, setInputTargets] = useState<string[]>([]);
  const [inputPolicy, setInputPolicy] = useState<InputPolicy>("all_players");
  const [activeDiceReveal, setActiveDiceReveal] =
    useState<ActiveDiceReveal | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const roomPollInFlightRef = useRef(false);
  const playerRegistrationInFlightRef = useRef(false);

  const activeCampaign = useMemo(
    () =>
      availableCampaigns.find((campaign) => campaign.id === activeCampaignId) ??
      availableCampaigns[0],
    [activeCampaignId, availableCampaigns]
  );
  const isSinglePlayer = activeCampaign?.mode === "single_player";
  const currentRoomPlayer = useMemo(
    () => roomPlayers.find((roomPlayer) => roomPlayer.id === playerId),
    [playerId, roomPlayers]
  );
  const currentPendingRollRequests = useMemo(
    () =>
      currentPlayerRollRequests(
        pendingRollRequests,
        playerProfile,
        currentRoomPlayer,
        isSinglePlayer
      ),
    [currentRoomPlayer, isSinglePlayer, pendingRollRequests, playerProfile]
  );
  const currentPendingRollRequest = currentPendingRollRequests[0] ?? null;
  const currentRequiredRollDice = useMemo(
    () => requiredDiceQueueFromRequests(currentPendingRollRequests),
    [currentPendingRollRequests]
  );
  const isWaitingOnAnotherPlayerRoll =
    !isSinglePlayer &&
    pendingRollRequests.length > 0 &&
    !currentPendingRollRequest;
  const isWaitingOnTargetedInput =
    !isSinglePlayer &&
    inputPolicy === "only_targeted_players" &&
    inputTargets.length > 0 &&
    !inputTargetsCurrentPlayer(inputTargets, playerProfile, currentRoomPlayer);
  const isInputSubmittedForCurrentState =
    isInputSubmitted &&
    (pendingRollRequests.length === 0 || Boolean(currentPendingRollRequest)) &&
    !isWaitingOnTargetedInput;

  const visibleMessages = useMemo(() => {
    const mergedMessages = new Map<string, GameMessage>();

    messages.forEach((message) => {
      mergedMessages.set(message.id, message);
    });
    roomMessages.forEach((message) => {
      mergedMessages.set(message.id, message);
    });

    return Array.from(mergedMessages.values()).sort(
      (firstMessage, secondMessage) =>
        Date.parse(firstMessage.createdAt) - Date.parse(secondMessage.createdAt)
    );
  }, [messages, roomMessages]);
  const waitingPlayers = useMemo<ChatPlayerStatus[]>(() => {
    if (isSinglePlayer || !hasAdventureBegun) {
      return [];
    }

    return roomPlayers
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
  }, [hasAdventureBegun, isSinglePlayer, roomPlayers]);
  const regeneratableMessageId = useMemo(() => {
    const latestDmMessage = [...visibleMessages]
      .reverse()
      .find((message) => message.role === "dm");

    return latestDmMessage?.id ?? null;
  }, [visibleMessages]);

  const canBeginAdventure =
    Boolean(activeCampaign) &&
    !isSinglePlayer &&
    roomPlayers.length >= 2 &&
    !hasAdventureBegun;

  const applyRoomSnapshot = useCallback(
    (room: RoomSnapshot) => {
      setRoomPlayers(room.players);
      setRoomMessages(room.messages);
      setIsRoomResolving(room.isResolving);
      setHasAdventureBegun(room.hasBegun);
      setPendingRollRequests(rollRequestsFromRoom(room));
      setInputTargets(room.inputTargets ?? []);
      setInputPolicy(room.inputPolicy ?? "all_players");

      const currentPlayer = room.players.find(
        (roomPlayer) => roomPlayer.id === playerId
      );

      if (
        currentPlayer?.username ||
        currentPlayer?.characterName ||
        currentPlayer?.characterSheet
      ) {
        const snapshotProfile = {
          username: currentPlayer.username,
          characterName: currentPlayer.characterName,
          characterSheet: currentPlayer.characterSheet
        };

        setPlayerProfile((currentProfile) =>
          getMissingPlayerProfileFields(currentProfile).length === 0
            ? currentProfile
            : snapshotProfile
        );
      }

      if (currentPlayer?.status === "submitted" || room.isResolving) {
        setIsInputSubmitted(true);
        if (currentPlayer?.status === "submitted") {
          setIsSending(false);
        }
      } else if (currentPlayer?.status === "waiting") {
        setIsInputSubmitted(false);
        setIsSending(false);
      }
    },
    [playerId]
  );

  const loadCampaignMessages = useCallback(async (campaign: CampaignSummary) => {
    setIsLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/room?roomId=${encodeURIComponent(
          campaign.id
        )}&sessionId=${encodeURIComponent(campaign.hermesSessionId)}`
      );

      if (!response.ok) {
        throw new Error("Campaign messages could not be loaded.");
      }

      const room = (await response.json()) as RoomSnapshot;
      setMessages(
        campaign.mode === "single_player" && room.messages.length > 0
          ? room.messages
          : openingMessages
      );

      if (campaign.mode === "single_player") {
        setRoomMessages([]);
        setRoomPlayers(room.players);
        setIsRoomResolving(room.isResolving);
        setHasAdventureBegun(true);
        setPendingRollRequests(rollRequestsFromRoom(room));
        setInputTargets(room.inputTargets ?? []);
        setInputPolicy(room.inputPolicy ?? "all_players");
      } else {
        applyRoomSnapshot(room);
      }
    } catch {
      setMessages(openingMessages);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [applyRoomSnapshot]);

  const fetchCampaigns = useCallback(async () => {
    const response = await fetch("/api/campaigns");

    if (!response.ok) {
      throw new Error("Campaigns could not be loaded.");
    }

    const data = (await response.json()) as CampaignsApiResponse;

    return data.campaigns ?? [];
  }, []);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem(playerIdStorageKey);

    if (savedPlayerId) {
      setPlayerId(savedPlayerId);
      return;
    }

    const newPlayerId = createClientId();
    localStorage.setItem(playerIdStorageKey, newPlayerId);
    setPlayerId(newPlayerId);
  }, []);

  useEffect(() => {
    if (!playerId) {
      return;
    }

    void fetch("/api/auth/claim-guest-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientId: playerId
      })
    }).catch(() => undefined);
  }, [playerId]);

  useEffect(() => {
    if (
      inputValidationMessage &&
      getMissingPlayerProfileFields(playerProfile).length === 0
    ) {
      setInputValidationMessage("");
    }
  }, [inputValidationMessage, playerProfile]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadCampaigns() {
      setIsLoadingCampaigns(true);

      try {
        const campaigns = await fetchCampaigns();

        if (shouldIgnore) {
          return;
        }

        setAvailableCampaigns(campaigns);

        const selectedCampaign =
          campaigns.find((campaign) => campaign.id === initialCampaignId) ??
          campaigns[0];

        if (!selectedCampaign) {
          window.location.assign("/new-adventure");
          return;
        }

        setActiveCampaignId(selectedCampaign.id);
        await loadCampaignMessages(selectedCampaign);
      } catch {
        if (!shouldIgnore) {
          setAvailableCampaigns([]);
          setMessages(openingMessages);
        }
      } finally {
        if (!shouldIgnore) {
          setIsLoadingCampaigns(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      shouldIgnore = true;
    };
  }, [fetchCampaigns, initialCampaignId, loadCampaignMessages]);

  useEffect(() => {
    let shouldIgnore = false;

    async function refreshCampaigns() {
      try {
        const campaigns = await fetchCampaigns();

        if (!shouldIgnore) {
          setAvailableCampaigns(campaigns);
        }
      } catch {
        // Keep the last good sidebar list if the server is briefly unavailable.
      }
    }

    const interval = window.setInterval(() => {
      void refreshCampaigns();
    }, 3000);

    return () => {
      shouldIgnore = true;
      window.clearInterval(interval);
    };
  }, [fetchCampaigns]);

  const registerPlayerProfile = useCallback(
    async (profile: PlayerProfile) => {
      if (!playerId || !activeCampaign || isSinglePlayer) {
        return;
      }

      const missingProfileFields = getMissingPlayerProfileFields(profile);

      if (missingProfileFields.length > 0) {
        setInputValidationMessage(
          `Finish your ${missingProfileFields.join(", ")} before updating.`
        );
        setInputValidationPulse((currentPulse) => currentPulse + 1);
        return;
      }

      if (playerRegistrationInFlightRef.current) {
        return;
      }

      playerRegistrationInFlightRef.current = true;

      try {
        const response = await fetchWithTimeout("/api/room/player", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            roomId: activeCampaign.id,
            sessionId: activeCampaign.hermesSessionId,
            playerId,
            username: profile.username,
            characterName: profile.characterName,
            characterSheet: profile.characterSheet
          })
        });

        if (!response.ok) {
          throw new Error("Room registration failed.");
        }

        const room = (await response.json()) as RoomSnapshot;
        applyRoomSnapshot(room);
      } finally {
        playerRegistrationInFlightRef.current = false;
      }
    },
    [activeCampaign, applyRoomSnapshot, isSinglePlayer, playerId]
  );

  useEffect(() => {
    if (
      !activeCampaign ||
      isSinglePlayer ||
      !playerId ||
      getMissingPlayerProfileFields(playerProfile).length > 0
    ) {
      return;
    }

    function registerPlayer() {
      void registerPlayerProfile(playerProfile).catch(() => undefined);
    }

    const timeout = window.setTimeout(registerPlayer, 350);
    const interval = window.setInterval(registerPlayer, 10_000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [
    activeCampaign,
    isSinglePlayer,
    playerId,
    playerProfile,
    registerPlayerProfile
  ]);

  useEffect(() => {
    if (!activeCampaign) {
      setRoomPlayers([]);
      setRoomMessages([]);
      setHasAdventureBegun(false);
      setIsRoomResolving(false);
      setIsInputSubmitted(false);
      setPendingRollRequests([]);
      setInputTargets([]);
      setInputPolicy("all_players");
      return;
    }

    let shouldIgnore = false;

    async function pollRoom() {
      if (roomPollInFlightRef.current) {
        return;
      }

      roomPollInFlightRef.current = true;

      try {
        const response = await fetchWithTimeout(
          `/api/room?roomId=${encodeURIComponent(
            activeCampaign.id
          )}&sessionId=${encodeURIComponent(activeCampaign.hermesSessionId)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Room state could not be loaded.");
        }

        const room = (await response.json()) as RoomSnapshot;

        if (!shouldIgnore) {
          if (isSinglePlayer) {
            setIsRoomResolving(room.isResolving);
            setHasAdventureBegun(true);
            setPendingRollRequests(rollRequestsFromRoom(room));
            setInputTargets(room.inputTargets ?? []);
            setInputPolicy(room.inputPolicy ?? "all_players");
          } else {
            applyRoomSnapshot(room);
          }
        }
      } catch {
        if (!shouldIgnore) {
          setIsRoomResolving(false);
        }
      } finally {
        roomPollInFlightRef.current = false;
      }
    }

    void pollRoom();
    const interval = window.setInterval(() => {
      void pollRoom();
    }, 1500);

    return () => {
      shouldIgnore = true;
      window.clearInterval(interval);
    };
  }, [activeCampaign, applyRoomSnapshot, isSinglePlayer]);

  function handleStartNewChat() {
    window.location.assign("/new-adventure");
  }

  async function handleSelectChat(campaignId: string) {
    const campaign = availableCampaigns.find(
      (availableCampaign) => availableCampaign.id === campaignId
    );

    if (!campaign) {
      return;
    }

    window.history.replaceState(null, "", `/play?campaignId=${campaign.id}`);
    setActiveCampaignId(campaign.id);
    setDraft("");
    setRoomMessages([]);
    setRoomPlayers([]);
    setHasAdventureBegun(campaign.mode === "single_player");
    setPendingRollRequests([]);
    setInputTargets([]);
    setInputPolicy("all_players");
    setInputValidationMessage("");
    setTableAlert("");
    setIsInputSubmitted(false);
    await loadCampaignMessages(campaign);
    inputRef.current?.focus();
  }

  async function handleDeleteChat(campaignId: string) {
    const campaignToDelete = availableCampaigns.find(
      (campaign) => campaign.id === campaignId
    );

    if (
      !window.confirm(
        `Archive "${campaignToDelete?.title ?? "this adventure"}"?`
      )
    ) {
      return;
    }

    const previousCampaigns = availableCampaigns;
    const nextCampaigns = availableCampaigns.filter(
      (campaign) => campaign.id !== campaignId
    );
    const nextActiveCampaign =
      campaignId === activeCampaignId ? nextCampaigns[0] : activeCampaign;

    setAvailableCampaigns(nextCampaigns);
    setActiveCampaignId(nextActiveCampaign?.id ?? "");
    setDraft("");

    if (campaignId === activeCampaignId) {
      setMessages(openingMessages);
      if (nextActiveCampaign) {
        void loadCampaignMessages(nextActiveCampaign);
      }
    }

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Campaign could not be archived.");
      }
    } catch {
      setAvailableCampaigns(previousCampaigns);
      setActiveCampaignId(activeCampaignId);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            "That adventure could not be archived. The campaign is still saved.",
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  async function handleRenameChat(campaignId: string) {
    const campaignToRename = availableCampaigns.find(
      (campaign) => campaign.id === campaignId
    );
    const nextTitle = window
      .prompt("Rename adventure", campaignToRename?.title ?? "")
      ?.trim();

    if (!nextTitle) {
      return;
    }

    setAvailableCampaigns((currentCampaigns) =>
      currentCampaigns.map((campaign) =>
        campaign.id === campaignId
          ? {
              ...campaign,
              title: nextTitle
            }
          : campaign
      )
    );

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: nextTitle
          })
        }
      );

      if (!response.ok) {
        throw new Error("Adventure could not be renamed.");
      }
    } catch {
      setAvailableCampaigns((currentCampaigns) =>
        currentCampaigns.map((campaign) =>
          campaign.id === campaignId
            ? {
                ...campaign,
                title: campaignToRename?.title ?? campaign.title
              }
            : campaign
        )
      );
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content: "That adventure could not be renamed.",
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  async function handleBeginAdventure() {
    if (!activeCampaign || !canBeginAdventure || isRoomResolving) {
      return;
    }

    setIsRoomResolving(true);
    let failureMessage =
      "The DM could not begin the adventure. Make sure at least two players have joined.";

    try {
      const response = await fetch("/api/room/begin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: activeCampaign.id,
          sessionId: activeCampaign.hermesSessionId
        })
      });

      if (!response.ok) {
        try {
          const body = (await response.json()) as { error?: string };

          if (body.error?.trim()) {
            failureMessage = body.error;
          }
        } catch {
          // Keep the default begin-adventure guidance when the server sends no JSON.
        }

        throw new Error(failureMessage);
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
      const campaigns = await fetchCampaigns();

      setAvailableCampaigns(campaigns);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content: failureMessage,
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsRoomResolving(false);
      inputRef.current?.focus();
    }
  }

  async function sendTurn(messageText: string) {
    const content = messageText.trim();

    if (!content || isSending || !activeCampaign) {
      return;
    }

    if (pendingRollRequests.length > 0) {
      setInputValidationMessage(
        currentPendingRollRequest
          ? "The DM is waiting for the required roll."
          : "The DM is waiting on another player's roll."
      );
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      return;
    }

    if (isWaitingOnTargetedInput) {
      setInputValidationMessage("The DM is waiting on another player.");
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      return;
    }

    if (!isSinglePlayer && !hasAdventureBegun) {
      setInputValidationMessage("Begin the adventure before sending turns.");
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      return;
    }

    if (!isSinglePlayer) {
      const missingProfileFields = getMissingPlayerProfileFields(playerProfile);

      if (missingProfileFields.length > 0) {
        setInputValidationMessage(
          `Finish your ${missingProfileFields.join(", ")} before sending.`
        );
        setInputValidationPulse((currentPulse) => currentPulse + 1);
        inputRef.current?.focus();
        return;
      }
    }

    setInputValidationMessage("");
    const playerMessage: GameMessage = {
      id: createClientId(),
      role: "player",
      content,
      createdAt: new Date().toISOString()
    };

    setMessages((currentMessages) => [...currentMessages, playerMessage]);
    setDraft("");
    setIsSending(true);
    setIsInputSubmitted(!isSinglePlayer);
    if (!isSinglePlayer) {
      setRoomPlayers((currentPlayers) =>
        currentPlayers.map((roomPlayer) =>
          roomPlayer.id === playerId
            ? { ...roomPlayer, status: "submitted" }
            : roomPlayer
        )
      );
    }
    setAvailableCampaigns((currentCampaigns) =>
      updateCampaignPreview(currentCampaigns, activeCampaign.id, content)
    );

    try {
      const response = await fetch(
        isSinglePlayer
          ? `/api/campaigns/${encodeURIComponent(activeCampaign.id)}/solo-turn`
          : "/api/room/submit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            isSinglePlayer
              ? {
                  message: content,
                  clientMessageId: playerMessage.id
                }
              : {
                  roomId: activeCampaign.id,
                  sessionId: activeCampaign.hermesSessionId,
                  playerId,
                  message: content,
                  clientMessageId: playerMessage.id
                }
          )
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "The dungeon master did not answer."
        );
        throw new Error(message);
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
      const latestMessage = room.messages[room.messages.length - 1];

      if (isSinglePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          activeCampaign.id,
          latestMessage?.content ?? content
        )
      );
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "The room connection flickered. Your turn may need to be sent again.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsSending(false);
      if (isSinglePlayer) {
        setIsInputSubmitted(false);
      }
      inputRef.current?.focus();
    }
  }

  async function handleRegenerateResponse(messageId: string) {
    if (!activeCampaign || isSending || regeneratingMessageId) {
      return;
    }

    setRegeneratingMessageId(messageId);
    setIsSending(true);
    setInputValidationMessage("");

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(activeCampaign.id)}/regenerate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ messageId })
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "The dungeon master could not regenerate that response."
        );
        throw new Error(message);
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);

      if (isSinglePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

      const latestMessage = room.messages[room.messages.length - 1];
      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          activeCampaign.id,
          latestMessage?.content ?? ""
        )
      );
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "The dungeon master could not regenerate that response.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setRegeneratingMessageId(null);
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendTurn(draft);
  }

  async function completePendingRollBatch(
    rollSubmissions: DiceRollSubmission[],
    rollMessage: GameMessage,
    campaign: CampaignSummary,
    singlePlayer: boolean
  ) {
    if (isSending) {
      return;
    }

    setActiveDiceReveal(null);
    setIsSending(true);
    setDraft("");
    setAvailableCampaigns((currentCampaigns) =>
      updateCampaignPreview(
        currentCampaigns,
        campaign.id,
        rollMessage.content
      )
    );

    try {
      const response = await fetch(
        singlePlayer
          ? `/api/campaigns/${encodeURIComponent(campaign.id)}/solo-turn`
          : "/api/room/submit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            singlePlayer
              ? {
                  rollSubmissions,
                  clientMessageId: rollMessage.id
                }
              : {
                  roomId: campaign.id,
                  sessionId: campaign.hermesSessionId,
                  playerId,
                  rollSubmissions,
                  clientMessageId: rollMessage.id
                }
          )
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "The roll could not be sent."
        );
        throw new Error(message);
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);

      if (singlePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

      const latestMessage = room.messages[room.messages.length - 1];
      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          campaign.id,
          latestMessage?.content ?? "Roll sent"
        )
      );
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "The roll could not be sent.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsSending(false);
      if (isSinglePlayer) {
        setIsInputSubmitted(false);
      }
      inputRef.current?.focus();
    }
  }

  async function sendPendingRoll(queuedDice: QueuedDice) {
    if (
      !currentPendingRollRequest ||
      isSending ||
      activeDiceReveal ||
      !activeCampaign
    ) {
      return;
    }

    setInputValidationMessage("");
    const rollBatch = pendingRollBatchFromQueue(
      queuedDice,
      currentPendingRollRequests
    );

    if (!rollBatch) {
      setInputValidationMessage(
        `Queue ${expectedPendingRollExpression(currentPendingRollRequests)} to continue.`
      );
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      return;
    }

    const clientMessageId = createClientId();
    const batchResult = rollPendingBatch(rollBatch, clientMessageId);
    const rollMessage: GameMessage = {
      id: clientMessageId,
      role: "player",
      content: batchResult.content,
      createdAt: new Date().toISOString()
    };
    const campaign = activeCampaign;
    const singlePlayer = isSinglePlayer;

    setMessages((currentMessages) => [...currentMessages, rollMessage]);
    setActiveDiceReveal({
      id: rollMessage.id,
      notation: predeterminedDiceNotation(rollBatch.notation, batchResult.rolls),
      expression: rollBatch.expression,
      total: batchResult.total,
      onComplete: () => {
        void completePendingRollBatch(
          batchResult.rollSubmissions,
          rollMessage,
          campaign,
          singlePlayer
        );
      }
    });
  }

  function handleRollDice(queuedDice: QueuedDice) {
    if (currentPendingRollRequest) {
      void sendPendingRoll(queuedDice);
      return;
    }

    const queuedRoll = rollQueuedDice(queuedDice);

    setInputValidationMessage("");
    setActiveDiceReveal({
      id: createClientId(),
      notation: queuedRoll.notation,
      expression: queuedRoll.expression,
      total: queuedRoll.total,
      onComplete: () => {
        setActiveDiceReveal(null);
        setDraft((currentDraft) =>
          currentDraft.trim()
            ? `${currentDraft.trim()}\n${queuedRoll.content}`
            : queuedRoll.content
        );
        inputRef.current?.focus();
      }
    });
  }

  async function handleSignOut() {
    await fetch("/auth/sign-out", {
      method: "POST"
    });
    window.location.assign("/login");
  }

  if (!activeCampaign && isLoadingCampaigns) {
    return (
      <main className="table-page">
        <section className="play-table loading-table" aria-label="Loading table">
          <p className="rune-loader">
            Loading adventures
            <span className="rune-loader-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="table-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="play-table" aria-label="AI Dungeons and Dragons table">
        <header className="table-header">
          <div className="brand-mark" aria-hidden="true">
            <Dice5 size={30} />
          </div>
          <div>
            <p className="eyebrow">
              {isSinglePlayer ? "Solo Adventure" : "Party Table"}
            </p>
            <h1>{activeCampaign?.title ?? "New Adventure"}</h1>
          </div>
          <div className="status-pill">
            <Flame size={16} />
            {isSinglePlayer ? "Singleplayer" : "Multiplayer"}
          </div>
          <div className="account-pill">
            <span>{userEmail ?? "Signed in"}</span>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => void handleSignOut()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="table-grid session-panel-collapsed">
          <ChatHistorySidebar
            chats={availableCampaigns}
            activeChatId={activeCampaignId}
            isLoading={isLoadingCampaigns}
            isCreatingChat={isCreatingChat}
            onStartNewChat={handleStartNewChat}
            onDeleteChat={(campaignId) => void handleDeleteChat(campaignId)}
            onRenameChat={(campaignId) => void handleRenameChat(campaignId)}
            onSelectChat={(campaignId) => void handleSelectChat(campaignId)}
          />
          <div className="story-column">
            {tableAlert ? (
              <div className="table-alert" role="alert">
                <span>{tableAlert}</span>
                <button
                  type="button"
                  aria-label="Dismiss alert"
                  onClick={() => setTableAlert("")}
                >
                  <X size={15} />
                </button>
              </div>
            ) : null}

            <MessageLog
              messages={visibleMessages}
              isSending={
                isLoadingMessages ||
                isRoomResolving ||
                (isSinglePlayer && isSending)
              }
              regeneratingMessageId={regeneratingMessageId}
              regeneratableMessageId={regeneratableMessageId}
              waitingPlayers={waitingPlayers}
              onRegenerateResponse={(messageId) =>
                void handleRegenerateResponse(messageId)
              }
            />

            {!isSinglePlayer && !hasAdventureBegun ? (
              <section className="begin-adventure-panel">
                {activeCampaign?.joinCode ? (
                  <div className="game-code-callout">
                    <span>Game Code</span>
                    <strong>{activeCampaign.joinCode}</strong>
                  </div>
                ) : null}
                <p>
                  {roomPlayers.length >= 2
                    ? "The party is gathered. Let the DM open the campaign."
                    : "Gather at least two players to begin the adventure."}
                </p>
                <button
                  type="button"
                  disabled={!canBeginAdventure || isRoomResolving}
                  onClick={() => void handleBeginAdventure()}
                >
                  <Play size={17} />
                  Begin Adventure
                </button>
              </section>
            ) : null}

            <PlayerInput
              ref={inputRef}
              draft={draft}
              isSending={isSending || Boolean(activeDiceReveal)}
              isSubmitted={
                (isSinglePlayer && isSending) ||
                Boolean(activeDiceReveal) ||
                isInputSubmittedForCurrentState
              }
              lockMessage={
                currentPendingRollRequest
                  ? `Roll required: ${
                      currentRequiredRollDice?.expression ??
                      currentPendingRollRequest.label
                    }`
                  : isWaitingOnAnotherPlayerRoll
                    ? "Waiting on another player's roll"
                    : isWaitingOnTargetedInput
                      ? "Waiting on another player"
                  : !isSinglePlayer && !hasAdventureBegun
                  ? "You can only start once the adventure has begun"
                  : undefined
              }
              requiredRoll={currentPendingRollRequest}
              requiredRollExpression={currentRequiredRollDice?.expression}
              requiredQueuedDice={currentRequiredRollDice?.queuedDice}
              validationMessage={inputValidationMessage}
              validationPulse={inputValidationPulse}
              onDraftChange={setDraft}
              onRollDice={handleRollDice}
              onSubmit={handleSubmit}
            />
          </div>

        </div>
      </section>

      {activeDiceReveal ? (
        <DiceRollReveal3D
          key={activeDiceReveal.id}
          notation={activeDiceReveal.notation}
          expression={activeDiceReveal.expression}
          total={activeDiceReveal.total}
          onComplete={activeDiceReveal.onComplete}
        />
      ) : null}

      <button
        className="floating-send"
        type="button"
        aria-label="Send turn"
        disabled={
          pendingRollRequests.length > 0 ||
          isWaitingOnTargetedInput ||
          Boolean(activeDiceReveal) ||
          isSending ||
          !draft.trim()
        }
        onClick={() => void sendTurn(draft)}
      >
        <Send size={22} />
      </button>
    </main>
  );
}
