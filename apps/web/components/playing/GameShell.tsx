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
  Copy,
  Link,
  Play,
  Send,
  X
} from "lucide-react";
import type { CampaignInvite } from "@ai-dnd/contracts";
import type {
  AiModelId,
  DiceRollRequest,
  DiceRollSubmission,
  GameMessage,
  InputPolicy,
  NextInputNeeded
} from "@/lib/game-types";
import {
  createCampaignInvite,
  disableCampaignInvite,
  listCampaignNpcCards,
  listCampaignInvites,
  listCampaigns,
  updateCampaignNpcCard,
  type CampaignNpcCard,
  type CampaignSummary as ApiCampaignSummary
} from "@/lib/campaign-api";
import {
  ChatHistorySidebar,
  type ChatSummary
} from "./ChatHistorySidebar";
import {
  CharacterSheetOverlay,
  type PlayerResourcesTab
} from "./CharacterSheetOverlay";
import { EldermereMapModal } from "./EldermereMapModal";
import { MessageLog } from "./MessageLog";
import {
  emptyPlayerProfile,
  type PlayerProfile
} from "./PlayerPanel";
import { DiceRollReveal3D } from "./DiceRollReveal3D";
import {
  PlayerInput,
  type PlayerInputMode,
  type QueuedDice
} from "./PlayerInput";
import {
  activeCharacterSheetForRoom,
  currentPlayerRollRequests,
  displayedRoomPlayersWithOptimisticSubmission,
  getMissingPlayerProfileFields,
  hasOptimisticSubmissionForCurrentPlayer,
  combatTurnOwnerName,
  isInputSubmittedForCurrentRoomState,
  isWaitingOnAnotherPlayerRoll,
  isWaitingOnCombatTurn,
  isWaitingOnTargetedInput,
  rollRequestsFromRoom,
  roomSnapshotSubmissionUpdate,
  turnSubmissionValidationMessage,
  waitingPlayerStatuses,
  type PendingSubmission,
  type RoomPlayer,
  type RoomSnapshot
} from "./game-shell-state";
import {
  buildRollSubmissionRequest,
  buildTurnSubmissionRequest
} from "./game-shell-requests";
import {
  expectedPendingRollExpression,
  pendingRollBatchFromQueue,
  predeterminedDiceNotation,
  requiredDiceQueueFromRequests,
  rollPendingBatch,
  rollQueuedDice
} from "./game-shell-dice";
import {
  appendStreamingDmDelta,
  completeStreamingDmMessage,
  mergeVisibleGameMessages,
  removePersistedStreamingDmMessages,
  removeStreamingDmMessage,
  startStreamingDmMessage,
  withOpeningResourceMessages,
  withPlayerMessageAvatars,
  type StreamingDmMessage
} from "./game-shell-messages";

const openingMessages: GameMessage[] = [];
const aiModelStorageKey = "ai-dnd.aiModel";
const defaultAiModel: AiModelId = "deepseek-v4-flash";
const playerIdStorageKey = "ai-dnd.playerId";
const roomRequestTimeoutMs = 8_000;
const fallbackRoomPollMs = 25_000;

function isAiModelId(value: FormDataEntryValue | string | null): value is AiModelId {
  return value === "deepseek-v4-flash" || value === "qwen-3-7-flash";
}

function selectedAiModelFromStorage(): AiModelId {
  const savedAiModel = window.localStorage.getItem(aiModelStorageKey);

  return isAiModelId(savedAiModel) ? savedAiModel : defaultAiModel;
}

function selectedAiModelFromForm(form: HTMLFormElement): AiModelId {
  const submittedModel = new FormData(form).get("aiModel");

  return isAiModelId(submittedModel) ? submittedModel : selectedAiModelFromStorage();
}

type CampaignSummary = ApiCampaignSummary & ChatSummary;

type ApiErrorResponse = {
  error?: string | {
    message?: string;
  };
};

type RoomRealtimeEvent =
  | { type: "room_updated"; roomId: string; updatedAt: string; eventId?: string }
  | { type: "room_snapshot"; roomId: string; snapshot: RoomSnapshot }
  | { type: "heartbeat"; sentAt: string }
  | { type: "error"; message: string }
  | { type: "dm_stream_started"; roomId: string; turnId: string }
  | { type: "dm_stream_delta"; roomId: string; turnId: string; text: string }
  | { type: "dm_stream_done"; roomId: string; turnId: string; messageId: string }
  | { type: "dm_stream_failed"; roomId: string; turnId: string; message: string };

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

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ApiErrorResponse;

    if (typeof data.error === "string") {
      return data.error.trim() || fallback;
    }

    return data.error?.message?.trim() || fallback;
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

function roomSocketUrl(campaign: CampaignSummary) {
  const apiOrigin =
    process.env.NEXT_PUBLIC_FASTIFY_API_ORIGIN?.replace(/\/$/, "") ||
    window.location.origin;
  const url = new URL("/api/room/live", apiOrigin);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("roomId", campaign.id);
  url.searchParams.set("sessionId", campaign.sessionId);

  return url.toString();
}

function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
}

function parseRoomRealtimeEvent(value: string): RoomRealtimeEvent | null {
  try {
    const event = JSON.parse(value) as Partial<RoomRealtimeEvent>;

    return typeof event.type === "string" ? (event as RoomRealtimeEvent) : null;
  } catch {
    return null;
  }
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

export function GameShell({ initialCampaignId }: GameShellProps) {
  const [messages, setMessages] = useState<GameMessage[]>(openingMessages);
  const [availableCampaigns, setAvailableCampaigns] = useState<CampaignSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<PlayerInputMode>("turn");
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
  const [optimisticSubmittedPlayerId, setOptimisticSubmittedPlayerId] =
    useState<string | null>(null);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const [roomMessages, setRoomMessages] = useState<GameMessage[]>([]);
  const [streamingDmMessages, setStreamingDmMessages] = useState<
    StreamingDmMessage[]
  >([]);
  const [isRoomResolving, setIsRoomResolving] = useState(false);
  const [hasAdventureBegun, setHasAdventureBegun] = useState(false);
  const [pendingRollRequests, setPendingRollRequests] = useState<
    DiceRollRequest[]
  >([]);
  const [nextInputNeeded, setNextInputNeeded] =
    useState<NextInputNeeded>("player_actions");
  const [inputTargets, setInputTargets] = useState<string[]>([]);
  const [inputPolicy, setInputPolicy] = useState<InputPolicy>("all_players");
  const [roomCombat, setRoomCombat] = useState<RoomSnapshot["combat"]>();
  const [campaignInvites, setCampaignInvites] = useState<CampaignInvite[]>([]);
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [isDisablingInvites, setIsDisablingInvites] = useState(false);
  const [activeDiceReveal, setActiveDiceReveal] =
    useState<ActiveDiceReveal | null>(null);
  const [isCharacterSheetOpen, setIsCharacterSheetOpen] = useState(false);
  const [playerResourcesInitialTab, setPlayerResourcesInitialTab] =
    useState<PlayerResourcesTab>("character_sheet");
  const [isMessageMapOpen, setIsMessageMapOpen] = useState(false);
  const [npcCards, setNpcCards] = useState<CampaignNpcCard[]>([]);
  const [isLoadingNpcCards, setIsLoadingNpcCards] = useState(false);
  const [npcCardsError, setNpcCardsError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const roomPollInFlightRef = useRef(false);

  const activeCampaign = useMemo(
    () =>
      availableCampaigns.find((campaign) => campaign.id === activeCampaignId) ??
      availableCampaigns[0],
    [activeCampaignId, availableCampaigns]
  );
  const isSinglePlayer = activeCampaign?.mode === "single_player";
  const canManageInvites = Boolean(
    activeCampaign?.mode === "multiplayer" &&
      activeCampaign.joinCode &&
      !hasAdventureBegun
  );
  const activeInviteCount = campaignInvites.filter(
    (invite) => invite.enabled && !invite.disabledAt
  ).length;
  const displayedRoomPlayers = useMemo(
    () =>
      displayedRoomPlayersWithOptimisticSubmission(
        roomPlayers,
        optimisticSubmittedPlayerId
      ),
    [optimisticSubmittedPlayerId, roomPlayers]
  );
  const currentRoomPlayer = useMemo(
    () => displayedRoomPlayers.find((roomPlayer) => roomPlayer.id === playerId),
    [displayedRoomPlayers, playerId]
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
  const hasPendingDiceInput =
    nextInputNeeded === "dice_results" || pendingRollRequests.length > 0;
  const currentRequiredRollDice = useMemo(
    () => requiredDiceQueueFromRequests(currentPendingRollRequests),
    [currentPendingRollRequests]
  );
  const isWaitingOnAnotherPlayerRollState = isWaitingOnAnotherPlayerRoll({
    isSinglePlayer,
    pendingRollRequests,
    currentPendingRollRequest
  });
  const isWaitingOnTargetedInputState = isWaitingOnTargetedInput({
    isSinglePlayer,
    inputPolicy,
    inputTargets,
    playerProfile,
    currentRoomPlayer
  });
  const isWaitingOnCombatTurnState = isWaitingOnCombatTurn({
    isSinglePlayer,
    combat: roomCombat,
    currentRoomPlayer
  });
  const currentCombatTurnOwnerName = combatTurnOwnerName(roomCombat);
  const hasOptimisticSubmission = hasOptimisticSubmissionForCurrentPlayer({
    isSinglePlayer,
    optimisticSubmittedPlayerId,
    playerId
  });
  const isInputSubmittedForCurrentState = isInputSubmittedForCurrentRoomState({
    isInputSubmitted,
    hasOptimisticSubmission,
    pendingRollRequests,
    currentPendingRollRequest,
    isWaitingOnTargetedInput: isWaitingOnTargetedInputState
  });

  const visibleMessages = useMemo(
    () => {
      const mergedMessages = mergeVisibleGameMessages({
        localMessages: messages,
        roomMessages,
        streamingDmMessages
      });
      const preparedMessages =
        hasAdventureBegun && mergedMessages.length > 0
          ? withOpeningResourceMessages(mergedMessages)
          : mergedMessages;

      return withPlayerMessageAvatars(preparedMessages, displayedRoomPlayers);
    },
    [
      displayedRoomPlayers,
      hasAdventureBegun,
      messages,
      roomMessages,
      streamingDmMessages
    ]
  );
  const isShowingStreamingDmMessage = useMemo(
    () => streamingDmMessages.length > 0,
    [streamingDmMessages]
  );
  const waitingPlayers = useMemo(
    () =>
      waitingPlayerStatuses({
        roomPlayers: displayedRoomPlayers,
        hasAdventureBegun,
        isSinglePlayer,
        inputPolicy,
        inputTargets
      }),
    [displayedRoomPlayers, hasAdventureBegun, inputPolicy, inputTargets, isSinglePlayer]
  );
  const activeCharacterSheet = useMemo(
    () =>
      activeCharacterSheetForRoom({
        currentRoomPlayer,
        roomPlayers: displayedRoomPlayers,
        playerProfile
      }),
    [currentRoomPlayer, displayedRoomPlayers, playerProfile]
  );
  const regeneratableMessageId = useMemo(() => {
    const latestDmMessage = [...visibleMessages]
      .reverse()
      .find(
        (message) =>
          message.role === "dm" &&
          message.kind !== "ask_dm_answer" &&
          !message.isSyntheticIntro
      );

    return latestDmMessage?.id ?? null;
  }, [visibleMessages]);

  const canBeginAdventure =
    Boolean(activeCampaign) &&
    !isSinglePlayer &&
    roomPlayers.length >= 2 &&
    !hasAdventureBegun;
  const canSelectAiModel =
    isSinglePlayer || Boolean(activeCampaign?.ownerClientId === playerId);
  const playerInputLockMessage = currentPendingRollRequest
    ? `Roll required: ${
        currentRequiredRollDice?.expression ?? currentPendingRollRequest.label
      }`
    : isWaitingOnAnotherPlayerRollState
      ? "Waiting on another player's roll"
    : isWaitingOnTargetedInputState
      ? "Waiting on another player"
    : isWaitingOnCombatTurnState
      ? currentCombatTurnOwnerName
        ? `Waiting on ${currentCombatTurnOwnerName}'s combat turn`
        : "Waiting on another combat turn"
    : !isSinglePlayer && !hasAdventureBegun
      ? "You can only start once the adventure has begun"
    : undefined;

  const applyRoomSnapshot = useCallback(
    (room: RoomSnapshot) => {
      setRoomPlayers(room.players);
      setRoomMessages(room.messages);
      setStreamingDmMessages((currentMessages) =>
        removePersistedStreamingDmMessages(currentMessages, room.messages)
      );
      setIsRoomResolving(room.isResolving);
      setHasAdventureBegun(room.hasBegun);
      setPendingRollRequests(rollRequestsFromRoom(room));
      setNextInputNeeded(room.nextInputNeeded ?? "player_actions");
      setInputTargets(room.inputTargets ?? []);
      setInputPolicy(room.inputPolicy ?? "all_players");
      setRoomCombat(room.combat);

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

        setPlayerProfile(snapshotProfile);
      }

      const submissionUpdate = roomSnapshotSubmissionUpdate({
        room,
        currentPlayer,
        pendingSubmission: pendingSubmissionRef.current,
        optimisticSubmittedPlayerId,
        playerId
      });

      if (submissionUpdate) {
        setIsInputSubmitted(submissionUpdate.inputSubmitted);

        if (submissionUpdate.stopSending) {
          setIsSending(false);
        }

        if (submissionUpdate.clearPendingSubmission) {
          pendingSubmissionRef.current = null;
        }

        if (submissionUpdate.clearOptimisticSubmittedPlayerId) {
          setOptimisticSubmittedPlayerId(null);
        }
      }
    },
    [optimisticSubmittedPlayerId, playerId]
  );

  const loadCampaignMessages = useCallback(async (campaign: CampaignSummary) => {
    setIsLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/room?roomId=${encodeURIComponent(
          campaign.id
        )}&sessionId=${encodeURIComponent(campaign.sessionId)}`
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
        setNextInputNeeded(room.nextInputNeeded ?? "player_actions");
        setInputTargets(room.inputTargets ?? []);
        setInputPolicy(room.inputPolicy ?? "all_players");
        setRoomCombat(room.combat);
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
    return listCampaigns();
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
    if (!isCharacterSheetOpen || !activeCampaign?.id) {
      return;
    }

    let isCurrent = true;

    setIsLoadingNpcCards(true);
    setNpcCardsError("");

    listCampaignNpcCards(activeCampaign.id)
      .then((cards) => {
        if (isCurrent) {
          setNpcCards(cards);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setNpcCardsError(
            error instanceof Error
              ? error.message
              : "NPC cards could not be loaded."
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingNpcCards(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeCampaign?.id, isCharacterSheetOpen]);

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

    async function loadInvites() {
      if (!activeCampaign || !canManageInvites) {
        setCampaignInvites([]);
        setInviteStatus("");
        setInviteError("");
        return;
      }

      try {
        const invites = await listCampaignInvites(activeCampaign.id);

        if (!shouldIgnore) {
          setCampaignInvites(invites);
        }
      } catch (caught) {
        if (!shouldIgnore) {
          setInviteError(
            caught instanceof Error
              ? caught.message
              : "Invite links could not be loaded."
          );
        }
      }
    }

    void loadInvites();

    return () => {
      shouldIgnore = true;
    };
  }, [activeCampaign, canManageInvites]);

  useEffect(() => {
    if (!activeCampaign) {
      setRoomPlayers([]);
      setRoomMessages([]);
      setStreamingDmMessages([]);
      setHasAdventureBegun(false);
      setIsRoomResolving(false);
      setIsInputSubmitted(false);
      pendingSubmissionRef.current = null;
      setOptimisticSubmittedPlayerId(null);
      setPendingRollRequests([]);
      setNextInputNeeded("player_actions");
      setInputTargets([]);
      setInputPolicy("all_players");
      setRoomCombat(undefined);
      return;
    }

    let shouldIgnore = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | undefined;
    let reconnectAttempts = 0;

    async function refreshRoom() {
      if (roomPollInFlightRef.current) {
        return;
      }

      roomPollInFlightRef.current = true;

      try {
        const response = await fetchWithTimeout(
          `/api/room?roomId=${encodeURIComponent(
            activeCampaign.id
          )}&sessionId=${encodeURIComponent(activeCampaign.sessionId)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Room state could not be loaded.");
        }

        const room = (await response.json()) as RoomSnapshot;

        if (!shouldIgnore) {
          if (isSinglePlayer) {
            setRoomPlayers(room.players);
            setIsRoomResolving(room.isResolving);
            setHasAdventureBegun(true);
            setPendingRollRequests(rollRequestsFromRoom(room));
            setNextInputNeeded(room.nextInputNeeded ?? "player_actions");
            setInputTargets(room.inputTargets ?? []);
            setInputPolicy(room.inputPolicy ?? "all_players");
            setRoomCombat(room.combat);
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

    function scheduleReconnect() {
      if (shouldIgnore) {
        return;
      }

      const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimeout = window.setTimeout(connectSocket, delay);
    }

    function connectSocket() {
      if (shouldIgnore) {
        return;
      }

      try {
        socket = new WebSocket(roomSocketUrl(activeCampaign));
      } catch {
        scheduleReconnect();
        return;
      }

      socket.addEventListener("open", () => {
        reconnectAttempts = 0;
        void refreshRoom();
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const realtimeEvent = parseRoomRealtimeEvent(event.data);

        if (!realtimeEvent) {
          return;
        }

        if (
          realtimeEvent.type === "room_updated" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          void refreshRoom();
        }

        if (
          realtimeEvent.type === "room_snapshot" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          applyRoomSnapshot(realtimeEvent.snapshot);
        }

        if (
          realtimeEvent.type === "dm_stream_started" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          setIsRoomResolving(true);
          setStreamingDmMessages((currentMessages) =>
            startStreamingDmMessage(
              currentMessages,
              realtimeEvent.turnId,
              new Date().toISOString()
            )
          );
        }

        if (
          realtimeEvent.type === "dm_stream_delta" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          setStreamingDmMessages((currentMessages) =>
            appendStreamingDmDelta(
              currentMessages,
              realtimeEvent.turnId,
              realtimeEvent.text,
              new Date().toISOString()
            )
          );
        }

        if (
          realtimeEvent.type === "dm_stream_done" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          setStreamingDmMessages((currentMessages) =>
            completeStreamingDmMessage(
              currentMessages,
              realtimeEvent.turnId,
              realtimeEvent.messageId
            )
          );
          void refreshRoom();
        }

        if (
          realtimeEvent.type === "dm_stream_failed" &&
          realtimeEvent.roomId === activeCampaign.id
        ) {
          setStreamingDmMessages((currentMessages) =>
            removeStreamingDmMessage(currentMessages, realtimeEvent.turnId)
          );
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: createClientId(),
              role: "system",
              content: realtimeEvent.message,
              createdAt: new Date().toISOString()
            }
          ]);
          void refreshRoom();
        }
      });
      socket.addEventListener("close", scheduleReconnect);
      socket.addEventListener("error", () => {
        socket?.close();
      });
    }

    void refreshRoom();
    connectSocket();
    const interval = window.setInterval(() => {
      void refreshRoom();
    }, fallbackRoomPollMs);

    return () => {
      shouldIgnore = true;
      if (reconnectTimeout !== undefined) {
        window.clearTimeout(reconnectTimeout);
      }
      socket?.close();
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
    setStreamingDmMessages([]);
    setHasAdventureBegun(campaign.mode === "single_player");
    setPendingRollRequests([]);
    setNextInputNeeded("player_actions");
    setInputTargets([]);
    setInputPolicy("all_players");
    setRoomCombat(undefined);
    setInputValidationMessage("");
    setTableAlert("");
    setIsInputSubmitted(false);
    pendingSubmissionRef.current = null;
    setOptimisticSubmittedPlayerId(null);
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

  async function handleCopyInviteLink() {
    if (!activeCampaign || isCreatingInvite) {
      return;
    }

    setIsCreatingInvite(true);
    setInviteError("");
    setInviteStatus("");

    try {
      const invite = await createCampaignInvite(activeCampaign.id);
      const url = inviteUrl(invite.token);

      await navigator.clipboard.writeText(url);
      setCampaignInvites((currentInvites) => [invite, ...currentInvites]);
      setInviteStatus("Invite link copied.");
    } catch (caught) {
      setInviteError(
        caught instanceof Error
          ? caught.message
          : "The invite link could not be copied."
      );
    } finally {
      setIsCreatingInvite(false);
    }
  }

  async function handleDisableInviteLinks() {
    if (!activeCampaign || isDisablingInvites) {
      return;
    }

    const activeInvites = campaignInvites.filter(
      (invite) => invite.enabled && !invite.disabledAt
    );

    if (activeInvites.length === 0) {
      return;
    }

    setIsDisablingInvites(true);
    setInviteError("");
    setInviteStatus("");

    try {
      const disabledInvites = await Promise.all(
        activeInvites.map((invite) =>
          disableCampaignInvite(activeCampaign.id, invite.id)
        )
      );
      const disabledById = new Map(
        disabledInvites.map((invite) => [invite.id, invite])
      );

      setCampaignInvites((currentInvites) =>
        currentInvites.map((invite) => disabledById.get(invite.id) ?? invite)
      );
      setInviteStatus("Invite links disabled.");
    } catch (caught) {
      setInviteError(
        caught instanceof Error
          ? caught.message
          : "Invite links could not be disabled."
      );
    } finally {
      setIsDisablingInvites(false);
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
          sessionId: activeCampaign.sessionId
        })
      });

      if (!response.ok) {
        failureMessage = await getApiErrorMessage(response, failureMessage);
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

  async function sendTurn(
    messageText: string,
    options: { skipTurn?: boolean; model?: AiModelId } = {}
  ) {
    const skipTurn = Boolean(options.skipTurn);
    const currentPlayerName =
      currentRoomPlayer?.username || playerProfile.username || undefined;
    const currentCharacterName =
      currentRoomPlayer?.characterName || playerProfile.characterName || undefined;
    const content = skipTurn
      ? `${currentCharacterName || "Player"} skips their turn.`
      : messageText.trim();

    if (!content || isSending || !activeCampaign || (skipTurn && isSinglePlayer)) {
      return;
    }

    const validationMessage = turnSubmissionValidationMessage({
      pendingRollRequests,
      currentPendingRollRequest,
      isWaitingOnTargetedInput: isWaitingOnTargetedInputState,
      isWaitingOnCombatTurn: isWaitingOnCombatTurnState,
      combatTurnOwnerName: currentCombatTurnOwnerName,
      isSinglePlayer,
      hasAdventureBegun,
      playerProfile
    });

    if (validationMessage) {
      setInputValidationMessage(validationMessage);
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      if (!isSinglePlayer && validationMessage.startsWith("Finish your ")) {
        inputRef.current?.focus();
      }
      return;
    }

    setInputValidationMessage("");
    const playerMessage: GameMessage = {
      id: createClientId(),
      role: "player",
      playerName: currentPlayerName,
      characterName: currentCharacterName,
      content,
      createdAt: new Date().toISOString()
    };

    setMessages((currentMessages) => [...currentMessages, playerMessage]);
    setDraft("");
    setIsSending(true);
    setIsInputSubmitted(!isSinglePlayer);
    if (!isSinglePlayer) {
      pendingSubmissionRef.current = {
        messageId: playerMessage.id,
        createdAt: playerMessage.createdAt
      };
      setOptimisticSubmittedPlayerId(playerId);
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
      const request = buildTurnSubmissionRequest({
        campaign: activeCampaign,
        singlePlayer: isSinglePlayer,
        playerId,
        message: content,
        skipTurn,
        clientMessageId: playerMessage.id,
        model: options.model ?? selectedAiModelFromStorage()
      });
      const response = await fetch(
        request.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request.body)
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
      if (!isSinglePlayer) {
        pendingSubmissionRef.current = null;
        setOptimisticSubmittedPlayerId(null);
        setIsInputSubmitted(false);
      }
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

  async function askDungeonMaster(messageText: string, model: AiModelId) {
    const question = messageText.trim();

    if (!question || isSending || !activeCampaign) {
      return;
    }

    setInputValidationMessage("");
    const playerMessage: GameMessage = {
      id: createClientId(),
      role: "player",
      kind: "ask_dm_question",
      playerName: currentRoomPlayer?.username || playerProfile.username || undefined,
      characterName:
        currentRoomPlayer?.characterName || playerProfile.characterName || undefined,
      content: question,
      createdAt: new Date().toISOString()
    };

    setMessages((currentMessages) => [...currentMessages, playerMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(activeCampaign.id)}/ask-dm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question,
            clientMessageId: playerMessage.id,
            model
          })
        }
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "The DM could not answer that question."
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
          latestMessage?.content ?? question
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
              : "The DM could not answer that question.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const model = canSelectAiModel
      ? selectedAiModelFromForm(event.currentTarget)
      : defaultAiModel;

    if (inputMode === "ask_dm") {
      void askDungeonMaster(draft, model);
      return;
    }

    void sendTurn(draft, { model });
  }

  function handleSkipTurn() {
    void sendTurn("", {
      skipTurn: true,
      model: canSelectAiModel ? selectedAiModelFromStorage() : defaultAiModel
    });
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
      const request = buildRollSubmissionRequest({
        campaign,
        singlePlayer,
        playerId,
        rollSubmissions,
        clientMessageId: rollMessage.id,
        model: selectedAiModelFromStorage()
      });
      const response = await fetch(
        request.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request.body)
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
      playerName: currentRoomPlayer?.username || playerProfile.username || undefined,
      characterName:
        currentRoomPlayer?.characterName || playerProfile.characterName || undefined,
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

  async function handleUpdateNpcCard(input: {
    npcCardId: string;
    markdown: string;
  }) {
    if (!activeCampaign?.id) {
      throw new Error("Campaign could not be loaded.");
    }

    const updatedCard = await updateCampaignNpcCard(
      activeCampaign.id,
      input.npcCardId,
      { markdown: input.markdown }
    );

    setNpcCards((cards) =>
      cards.map((card) => (card.id === updatedCard.id ? updatedCard : card))
    );

    return updatedCard;
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
            playerPortraitAlt={`${
              currentRoomPlayer?.characterName ||
              playerProfile.characterName ||
              "Player character"
            } portrait`}
            playerPortraitStatus={currentRoomPlayer?.portraitStatus}
            playerPortraitUrl={currentRoomPlayer?.portraitUrl}
            onViewCharacterSheet={() => {
              setPlayerResourcesInitialTab("character_sheet");
              setIsCharacterSheetOpen(true);
            }}
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
              hideSendingIndicator={isShowingStreamingDmMessage}
              regeneratingMessageId={regeneratingMessageId}
              regeneratableMessageId={regeneratableMessageId}
              waitingPlayers={waitingPlayers}
              onInspectMap={() => setIsMessageMapOpen(true)}
              onRegenerateResponse={(messageId) =>
                void handleRegenerateResponse(messageId)
              }
              onViewEldermereLore={() => {
                setPlayerResourcesInitialTab("eldermere_lore");
                setIsCharacterSheetOpen(true);
              }}
            />

            {!isSinglePlayer && !hasAdventureBegun ? (
              <section className="begin-adventure-panel">
                {activeCampaign?.joinCode ? (
                  <div className="game-code-callout">
                    <span>Game Code</span>
                    <strong>{activeCampaign.joinCode}</strong>
                  </div>
                ) : null}
                {canManageInvites ? (
                  <div className="invite-link-controls">
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={isCreatingInvite}
                      onClick={() => void handleCopyInviteLink()}
                    >
                      <Copy size={16} />
                      {isCreatingInvite ? "Copying..." : "Copy Invite Link"}
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={activeInviteCount === 0 || isDisablingInvites}
                      onClick={() => void handleDisableInviteLinks()}
                    >
                      <Link size={16} />
                      {isDisablingInvites
                        ? "Disabling..."
                        : `Disable Links${
                            activeInviteCount > 0 ? ` (${activeInviteCount})` : ""
                          }`}
                    </button>
                    {inviteStatus ? (
                      <span className="invite-status">{inviteStatus}</span>
                    ) : null}
                    {inviteError ? (
                      <span className="invite-error-inline">{inviteError}</span>
                    ) : null}
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
              mode={inputMode}
              isSending={isSending || Boolean(activeDiceReveal)}
              isSubmitted={
                (isSinglePlayer && isSending) ||
                Boolean(activeDiceReveal) ||
                isInputSubmittedForCurrentState
              }
              canSelectAiModel={canSelectAiModel}
              lockMessage={playerInputLockMessage}
              requiredRoll={currentPendingRollRequest}
              requiredRollExpression={currentRequiredRollDice?.expression}
              requiredQueuedDice={currentRequiredRollDice?.queuedDice}
              validationMessage={inputValidationMessage}
              validationPulse={inputValidationPulse}
              onDraftChange={setDraft}
              onModeChange={setInputMode}
              onRollDice={handleRollDice}
              onSkipTurn={!isSinglePlayer ? handleSkipTurn : undefined}
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

      {isCharacterSheetOpen ? (
        <CharacterSheetOverlay
          characterSheet={activeCharacterSheet}
          initialTab={playerResourcesInitialTab}
          portraitUrl={currentRoomPlayer?.portraitUrl}
          isLoadingNpcCards={isLoadingNpcCards}
          npcCards={npcCards}
          npcCardsError={npcCardsError}
          onClose={() => setIsCharacterSheetOpen(false)}
          onNpcCardUpdate={handleUpdateNpcCard}
        />
      ) : null}

      {isMessageMapOpen ? (
        <EldermereMapModal onClose={() => setIsMessageMapOpen(false)} />
      ) : null}

      <button
        className="floating-send"
        type="button"
        aria-label="Send turn"
        disabled={
          hasPendingDiceInput ||
          isWaitingOnTargetedInputState ||
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
