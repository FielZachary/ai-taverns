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
  HeartPulse,
  Link,
  Menu,
  Plus,
  Play,
  Send,
  X
} from "lucide-react";
import type { CampaignInvite, HookMetric } from "@ai-dnd/contracts";
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
  generateCampaignRestartBackstory,
  listCampaignNpcCards,
  listCampaignInvites,
  listCampaigns,
  restartCampaign,
  updateCampaignNpcCard,
  type CampaignNpcCard,
  type CampaignSummary as ApiCampaignSummary
} from "@/lib/campaign-api";
import {
  ChatHistorySidebar,
  type ChatSummary
} from "./ChatHistorySidebar";
import { BackstoryIntroModal } from "./BackstoryIntroModal";
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
  activeResourcePlayerForRoom,
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
import { extractPlayerBackstory } from "./backstory-intro";
import {
  analyticsGuestId,
  identifyAnalyticsUser,
  trackAnalytics,
  trackCampaignReturn
} from "@/lib/analytics";

const openingMessages: GameMessage[] = [];
const aiModelStorageKey = "ai-dnd.aiModel";
const defaultAiModel: AiModelId = "deepseek-v4-flash";
const playerIdStorageKey = "ai-dnd.playerId";
const backstoryIntroSeenStoragePrefix = "ai-dnd.backstoryIntroSeen";
const roomRequestTimeoutMs = 8_000;
const turnSubmissionRequestTimeoutMs = 30_000;
const fallbackRoomPollMs = 25_000;
const dungeonMasterTurnTimeoutMessage =
  "The dungeon master wasn't able to respond to that, please press the retry button on the right to re-send your message";
const backstoryIntroDelaySeconds = 10;
const defaultCampaignPreparationMessage = "Preparing your campaign";
const narrationVisualLeadMs = 750;

function narrationBeatWordEnds(content: string) {
  const visibleText = content.replace(
    /<\/?(?:npc|place|clue|danger|faction|object|em)>/g,
    ""
  );
  const explicitBeats = visibleText
    .split(/\n\s*\n/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const sentenceParts =
    explicitBeats.length > 1
      ? explicitBeats
      : visibleText
          .split(/\n{2,}/)
          .flatMap((paragraph) => paragraph.split(/(?<=[.!?…:])\s+/))
          .map((sentence) => sentence.trim())
          .filter(Boolean);
  let wordCount = 0;

  return sentenceParts.map((sentence) => {
    wordCount += sentence.match(/\S+/g)?.length ?? 0;
    return wordCount;
  });
}
const campaignPreparationMessages = [
  defaultCampaignPreparationMessage,
  "Integrating your backstory",
  "Creating story direction",
  "Determining NPCs",
  "Crafting first scene",
  "Writing",
  "Final touches"
];
const campaignPreparationMessageIntervalMs = 10_000;
const campaignPreparationTransitionMs = 650;

function isAiModelId(value: FormDataEntryValue | string | null): value is AiModelId {
  return value === "deepseek-v4-flash" || value === "qwen-3-5-plus";
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

function dmResponseType(message: GameMessage | undefined) {
  if (message?.kind) {
    return message.kind;
  }

  return message?.role === "dm" ? "turn" : undefined;
}

function hasStateChange(room: RoomSnapshot) {
  return (
    rollRequestsFromRoom(room).length > 0 ||
    Boolean(room.combat?.active) ||
    room.nextInputNeeded !== "player_actions" ||
    (room.inputTargets?.length ?? 0) > 0
  );
}

function analyticsMessageCounts(room: RoomSnapshot) {
  return {
    playerMessageCount: room.messages.filter((message) => message.role === "player")
      .length,
    dmMessageCount: room.messages.filter((message) => message.role === "dm").length,
    totalMessageCount: room.messages.length
  };
}

type ApiErrorResponse = {
  error?: string | {
    message?: string;
  };
};

type RetryableTurn = {
  message: string;
  model: AiModelId;
  errorMessageId: string;
};

type RoomRealtimeEvent =
  | { type: "room_updated"; roomId: string; updatedAt: string; eventId?: string }
  | { type: "room_snapshot"; roomId: string; snapshot: RoomSnapshot }
  | { type: "heartbeat"; sentAt: string }
  | { type: "error"; message: string }
  | { type: "dm_stream_started"; roomId: string; turnId: string }
  | { type: "dm_stream_delta"; roomId: string; turnId: string; text: string }
  | { type: "dm_stream_done"; roomId: string; turnId: string; messageId: string }
  | { type: "dm_stream_failed"; roomId: string; turnId: string; message: string }
  | { type: "tts_started"; roomId: string; narrationId: string; messageId: string; text: string }
  | { type: "tts_audio"; roomId: string; narrationId: string; audio: string; sampleRate: number }
  | { type: "tts_timestamps"; roomId: string; narrationId: string; wordTimings: Array<{ word: string; start: number; end: number }> }
  | { type: "tts_done"; roomId: string; narrationId: string }
  | { type: "tts_failed"; roomId: string; narrationId: string; message: string };

type GameShellProps = {
  initialCampaignId?: string;
  userEmail?: string;
  userId?: string;
  routePath?: "/play" | "/debug";
  allowUnlistedInitialCampaign?: boolean;
  includeAllMessages?: boolean;
};

type ActiveDiceReveal = {
  id: string;
  notation: string;
  expression: string;
  total: number;
  onComplete: () => void;
};

function CampaignPreparationLoader() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [exitingMessage, setExitingMessage] = useState("");
  const currentMessage =
    campaignPreparationMessages[messageIndex] ??
    defaultCampaignPreparationMessage;

  useEffect(() => {
    let timeoutId: number | undefined;

    const intervalId = window.setInterval(() => {
      setMessageIndex((currentIndex) => {
        const nextIndex =
          (currentIndex + 1) % campaignPreparationMessages.length;

        setExitingMessage(
          campaignPreparationMessages[currentIndex] ??
            defaultCampaignPreparationMessage
        );

        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        timeoutId = window.setTimeout(() => {
          setExitingMessage("");
        }, campaignPreparationTransitionMs);

        return nextIndex;
      });
    }, campaignPreparationMessageIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <div className="campaign-prep-loader">
      <div className="campaign-prep-loader-window">
        {exitingMessage ? (
          <p
            key={`exiting-${exitingMessage}`}
            className="rune-loader campaign-prep-loader-message exiting"
            aria-hidden="true"
          >
            {exitingMessage}
            <span className="rune-loader-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        ) : null}
        <p
          key={currentMessage}
          className="rune-loader campaign-prep-loader-message entering"
        >
          {currentMessage}
          <span className="rune-loader-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>
      <p className="campaign-prep-loader-note">
        this&apos;ll take about a minute and a half, sit tight ;)
      </p>
    </div>
  );
}

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

function isAbortError(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
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

export function GameShell({
  initialCampaignId,
  userEmail,
  userId,
  routePath = "/play",
  allowUnlistedInitialCampaign = false,
  includeAllMessages = false
}: GameShellProps) {
  const [messages, setMessages] = useState<GameMessage[]>(openingMessages);
  const [availableCampaigns, setAvailableCampaigns] = useState<CampaignSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [inputMode, setInputMode] = useState<PlayerInputMode>("turn");
  const [isSending, setIsSending] = useState(false);
  const [isRestartingCampaign, setIsRestartingCampaign] = useState(false);
  const [restartPreparingCampaignId, setRestartPreparingCampaignId] =
    useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<
    string | null
  >(null);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingChat] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaignId ?? "");
  const [playerProfile, setPlayerProfile] =
    useState<PlayerProfile>(emptyPlayerProfile);
  const [inputValidationMessage, setInputValidationMessage] = useState("");
  const [inputValidationPulse, setInputValidationPulse] = useState(0);
  const [isInputSubmitted, setIsInputSubmitted] = useState(false);
  const [retryableTurn, setRetryableTurn] = useState<RetryableTurn | null>(null);
  const [tableAlert, setTableAlert] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [optimisticSubmittedPlayerId, setOptimisticSubmittedPlayerId] =
    useState<string | null>(null);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const roomSocketRef = useRef<WebSocket | null>(null);
  const narrationAudioContextRef = useRef<AudioContext | null>(null);
  const narrationAudioStartRef = useRef(0);
  const narrationAudioBufferRef = useRef<Array<{ audio: string; sampleRate: number }>>([]);
  const narrationHasTimingRef = useRef(false);
  const narrationNextStartRef = useRef(0);
  const narrationWordCursorRef = useRef(0);
  const narrationSentenceEndsRef = useRef<number[]>([]);
  const narrationNextSentenceRef = useRef(0);
  const narrationTimersRef = useRef<number[]>([]);
  const narrationPlaybackEndRef = useRef(0);
  const retryableTurnRef = useRef<RetryableTurn | null>(null);
  const [roomMessages, setRoomMessages] = useState<GameMessage[]>([]);
  const [streamingDmMessages, setStreamingDmMessages] = useState<
    StreamingDmMessage[]
  >([]);
  const [narrationReveal, setNarrationReveal] = useState<{
    messageId: string;
    revealedWordCount: number;
  } | null>(null);

  const playNarrationAudio = useCallback((audio: string, sampleRate: number) => {
    const context =
      narrationAudioContextRef.current ?? new AudioContext({ sampleRate });
    narrationAudioContextRef.current = context;
    const bytes = Uint8Array.from(atob(audio), (character) =>
      character.charCodeAt(0)
    );
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2)
    );
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.03, narrationNextStartRef.current);
    source.start(start);
    narrationNextStartRef.current = start + buffer.duration;
    return { context, start, duration: buffer.duration };
  }, []);

  const startNarrationAudio = useCallback((audio: string, sampleRate: number) => {
    const playback = playNarrationAudio(audio, sampleRate);
    narrationPlaybackEndRef.current = Math.max(
      narrationPlaybackEndRef.current,
      playback.start + playback.duration
    );
    if (narrationAudioStartRef.current === 0) {
      narrationAudioStartRef.current = playback.start;
    }
  }, [playNarrationAudio]);

  const narrateMessage = useCallback((messageId: string) => {
    const socket = roomSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "tts_start", messageId }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "m" || event.metaKey || event.ctrlKey || event.altKey || target?.matches("input, textarea, [contenteditable='true']")) return;
      const latestDmMessage = [...roomMessages].reverse().find((message) => message.role === "dm");
      if (!latestDmMessage) return;
      event.preventDefault();
      narrateMessage(latestDmMessage.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [narrateMessage, roomMessages]);
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
  const [roomDeath, setRoomDeath] = useState<RoomSnapshot["death"]>();
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
  const [backstoryIntro, setBackstoryIntro] = useState<{
    backstory: string;
    storageKey: string;
  } | null>(null);
  const [backstoryIntroCountdown, setBackstoryIntroCountdown] = useState(
    backstoryIntroDelaySeconds
  );
  const [npcCards, setNpcCards] = useState<CampaignNpcCard[]>([]);
  const [isLoadingNpcCards, setIsLoadingNpcCards] = useState(false);
  const [npcCardsError, setNpcCardsError] = useState("");
  const [isGeneratingCombatCheatSheet, setIsGeneratingCombatCheatSheet] =
    useState(false);
  const [combatCheatSheetError, setCombatCheatSheetError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const roomPollInFlightRef = useRef(false);
  const initialDebugCampaign = useMemo<CampaignSummary | null>(() => {
    if (!allowUnlistedInitialCampaign || !initialCampaignId) {
      return null;
    }

    return {
      id: initialCampaignId,
      sessionId: initialCampaignId,
      mode: "single_player",
      title: `Debug ${initialCampaignId.slice(0, 8)}`,
      preview: "Loaded from pasted campaign id"
    };
  }, [allowUnlistedInitialCampaign, initialCampaignId]);
  const roomReadDebugParam = includeAllMessages ? "&debugAllMessages=true" : "";

  const setRetryableTurnState = useCallback((nextRetryableTurn: RetryableTurn | null) => {
    retryableTurnRef.current = nextRetryableTurn;
    setRetryableTurn(nextRetryableTurn);
  }, []);

  const setRoomResolvingState = useCallback((isResolving: boolean) => {
    setIsRoomResolving(isResolving && !retryableTurnRef.current);
  }, []);

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
  const isCharacterDead = roomDeath?.state === "dead";
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
  const activeResourcePlayer = useMemo(
    () =>
      activeResourcePlayerForRoom({
        currentRoomPlayer,
        roomPlayers: displayedRoomPlayers
      }),
    [currentRoomPlayer, displayedRoomPlayers]
  );
  const activeBackstory = useMemo(
    () => extractPlayerBackstory(activeCharacterSheet),
    [activeCharacterSheet]
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
  const hasVisibleDmOpener = useMemo(
    () =>
      visibleMessages.some(
        (message) =>
          message.role === "dm" &&
          message.kind !== "ask_dm_answer" &&
          !message.isSyntheticIntro
      ),
    [visibleMessages]
  );
  const isRestartPreparing =
    Boolean(restartPreparingCampaignId) &&
    activeCampaign?.id === restartPreparingCampaignId &&
    !hasVisibleDmOpener &&
    (isRoomResolving || isLoadingMessages || visibleMessages.length === 0);

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
    : isCharacterDead
      ? "Choose what happens after death."
    : !isSinglePlayer && !hasAdventureBegun
      ? "You can only start once the adventure has begun"
    : undefined;

  function analyticsBaseProperties(campaign: CampaignSummary | undefined = activeCampaign) {
    return {
      userId,
      guestId: analyticsGuestId(),
      playerId: playerId || undefined,
      campaignId: campaign?.id,
      campaignMode: campaign?.mode,
      playerMessageCount: roomMessages.filter((message) => message.role === "player")
        .length,
      dmMessageCount: roomMessages.filter((message) => message.role === "dm")
        .length,
      totalMessageCount: roomMessages.length,
      hasDiceRequest: pendingRollRequests.length > 0,
      combatActive: Boolean(roomCombat?.active)
    } as const;
  }

  const applyRoomSnapshot = useCallback(
    (room: RoomSnapshot) => {
      const resolvedPlayerId = room.currentPlayerId?.trim() || playerId;

      if (room.currentPlayerId && room.currentPlayerId !== playerId) {
        localStorage.setItem(playerIdStorageKey, room.currentPlayerId);
        setPlayerId(room.currentPlayerId);
      }

      setRoomPlayers(room.players);
      setRoomMessages(room.messages);
      setStreamingDmMessages((currentMessages) =>
        removePersistedStreamingDmMessages(currentMessages, room.messages)
      );
      setRoomResolvingState(room.isResolving);
      setHasAdventureBegun(room.hasBegun);
      setPendingRollRequests(rollRequestsFromRoom(room));
      setNextInputNeeded(room.nextInputNeeded ?? "player_actions");
      setInputTargets(room.inputTargets ?? []);
      setInputPolicy(room.inputPolicy ?? "all_players");
      setRoomCombat(room.combat);
      setRoomDeath(room.death);

      const currentPlayer = room.players.find(
        (roomPlayer) => roomPlayer.id === resolvedPlayerId
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
        playerId: resolvedPlayerId
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
    [optimisticSubmittedPlayerId, playerId, setRoomResolvingState]
  );

  const saveNarrationScript = useCallback(
    async (messageId: string, narrationContent: string) => {
      if (!activeCampaign) {
        throw new Error("Choose a campaign before editing narration.");
      }

      const response = await fetch("/api/room/message/narration", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: activeCampaign.id,
          sessionId: activeCampaign.sessionId,
          messageId,
          narrationContent
        })
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Narration script could not be saved.")
        );
      }

      applyRoomSnapshot((await response.json()) as RoomSnapshot);
    },
    [activeCampaign, applyRoomSnapshot]
  );

  const loadCampaignMessages = useCallback(async (campaign: CampaignSummary) => {
    setIsLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/room?roomId=${encodeURIComponent(
          campaign.id
        )}&sessionId=${encodeURIComponent(campaign.sessionId)}${roomReadDebugParam}`
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Campaign messages could not be loaded.")
        );
      }

      const room = (await response.json()) as RoomSnapshot;
      const playerMessageCount = room.messages.filter(
        (message) => message.role === "player"
      ).length;
      const dmMessageCount = room.messages.filter((message) => message.role === "dm")
        .length;

      trackAnalytics({
        name: "Campaign Loaded",
        properties: {
          userId,
          guestId: analyticsGuestId(),
          playerId: playerId || undefined,
          campaignId: campaign.id,
          campaignMode: campaign.mode,
          playerMessageCount,
          dmMessageCount,
          totalMessageCount: room.messages.length,
          hasDiceRequest: rollRequestsFromRoom(room).length > 0,
          combatActive: Boolean(room.combat?.active)
        }
      });
      trackCampaignReturn({
        campaignId: campaign.id,
        campaignMode: campaign.mode
      });
      setAvailableCampaigns((currentCampaigns) =>
        currentCampaigns.map((currentCampaign) =>
          currentCampaign.id === campaign.id
            ? {
                ...currentCampaign,
                mode: room.mode,
                sessionId: room.sessionId || currentCampaign.sessionId
              }
            : currentCampaign
        )
      );
      setMessages(openingMessages);

      applyRoomSnapshot(room);
    } catch (error) {
      setMessages([
        ...openingMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "Campaign messages could not be loaded.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [
    applyRoomSnapshot,
    playerId,
    roomReadDebugParam,
    userId
  ]);

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
    const currentUserPlayerId = activeCampaign?.currentUserPlayerId?.trim();

    if (!currentUserPlayerId || currentUserPlayerId === playerId) {
      return;
    }

    localStorage.setItem(playerIdStorageKey, currentUserPlayerId);
    setPlayerId(currentUserPlayerId);
  }, [activeCampaign?.currentUserPlayerId, playerId]);

  useEffect(() => {
    if (!playerId) {
      return;
    }

    identifyAnalyticsUser({
      userId,
      email: userEmail,
      guestId: playerId
    });

    void fetch("/api/auth/claim-guest-state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        clientId: playerId
      })
    }).catch(() => undefined);
  }, [playerId, userEmail, userId]);

  useEffect(() => {
    if (
      inputValidationMessage &&
      getMissingPlayerProfileFields(playerProfile).length === 0
    ) {
      setInputValidationMessage("");
    }
  }, [inputValidationMessage, playerProfile]);

  useEffect(() => {
    if (
      restartPreparingCampaignId &&
      activeCampaign?.id === restartPreparingCampaignId &&
      hasVisibleDmOpener
    ) {
      setRestartPreparingCampaignId(null);
    }
  }, [activeCampaign?.id, hasVisibleDmOpener, restartPreparingCampaignId]);

  useEffect(() => {
    if (!activeCampaign?.id || !hasAdventureBegun || !activeBackstory) {
      return;
    }

    const storageKey = [
      backstoryIntroSeenStoragePrefix,
      activeCampaign.id,
      playerId || "player"
    ].join(".");

    if (
      backstoryIntro?.storageKey === storageKey ||
      window.localStorage.getItem(storageKey) === "true"
    ) {
      return;
    }

    setBackstoryIntro({
      backstory: activeBackstory,
      storageKey
    });
    setBackstoryIntroCountdown(backstoryIntroDelaySeconds);
  }, [
    activeBackstory,
    activeCampaign?.id,
    backstoryIntro?.storageKey,
    hasAdventureBegun,
    playerId
  ]);

  useEffect(() => {
    if (!backstoryIntro || backstoryIntroCountdown <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setBackstoryIntroCountdown((currentCountdown) =>
        Math.max(0, currentCountdown - 1)
      );
    }, 1_000);

    return () => window.clearTimeout(timeout);
  }, [backstoryIntro, backstoryIntroCountdown]);

  function closeBackstoryIntro() {
    if (backstoryIntro) {
      window.localStorage.setItem(backstoryIntro.storageKey, "true");
    }

    setBackstoryIntro(null);
    setBackstoryIntroCountdown(backstoryIntroDelaySeconds);
  }

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

        const selectedCampaign =
          campaigns.find((campaign) => campaign.id === initialCampaignId) ??
          initialDebugCampaign ??
          campaigns[0];

        if (!selectedCampaign) {
          window.location.assign("/new-adventure");
          return;
        }

        setAvailableCampaigns(
          initialDebugCampaign &&
            !campaigns.some((campaign) => campaign.id === initialDebugCampaign.id)
            ? [initialDebugCampaign, ...campaigns]
            : campaigns
        );
        setActiveCampaignId(selectedCampaign.id);
        setRetryableTurnState(null);
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
  }, [
    fetchCampaigns,
    initialCampaignId,
    initialDebugCampaign,
    loadCampaignMessages,
    setRetryableTurnState
  ]);

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
      setRetryableTurnState(null);
      pendingSubmissionRef.current = null;
      setOptimisticSubmittedPlayerId(null);
      setPendingRollRequests([]);
      setNextInputNeeded("player_actions");
      setInputTargets([]);
      setInputPolicy("all_players");
      setRoomCombat(undefined);
      setRoomDeath(undefined);
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
          )}&sessionId=${encodeURIComponent(
            activeCampaign.sessionId
          )}${roomReadDebugParam}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Room state could not be loaded.");
        }

        const room = (await response.json()) as RoomSnapshot;

        if (!shouldIgnore) {
          applyRoomSnapshot(room);
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
        roomSocketRef.current = socket;
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
          setRoomResolvingState(true);
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
          const shouldSuppressMessage = Boolean(retryableTurnRef.current);

          setStreamingDmMessages((currentMessages) =>
            removeStreamingDmMessage(currentMessages, realtimeEvent.turnId)
          );
          if (!shouldSuppressMessage) {
            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: createClientId(),
                role: "system",
                content: realtimeEvent.message,
                createdAt: new Date().toISOString()
              }
            ]);
          }
          void refreshRoom();
        }

        if (realtimeEvent.type === "tts_started") {
          narrationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
          narrationTimersRef.current = [];
          narrationWordCursorRef.current = 0;
          narrationSentenceEndsRef.current = narrationBeatWordEnds(realtimeEvent.text);
          narrationNextSentenceRef.current = 0;
          setNarrationReveal({
            messageId: realtimeEvent.messageId,
            revealedWordCount: 0
          });
          narrationNextStartRef.current = 0;
          narrationAudioStartRef.current = 0;
          narrationPlaybackEndRef.current = 0;
          narrationAudioBufferRef.current = [];
          narrationHasTimingRef.current = false;
          void narrationAudioContextRef.current?.resume();
        }

        if (realtimeEvent.type === "tts_audio") {
          if (!narrationHasTimingRef.current) {
            narrationAudioBufferRef.current.push({
              audio: realtimeEvent.audio,
              sampleRate: realtimeEvent.sampleRate
            });
          } else {
            startNarrationAudio(realtimeEvent.audio, realtimeEvent.sampleRate);
          }
        }

        if (realtimeEvent.type === "tts_timestamps") {
          if (!narrationHasTimingRef.current) {
            narrationHasTimingRef.current = true;
            const bufferedAudio = narrationAudioBufferRef.current;
            narrationAudioBufferRef.current = [];
            bufferedAudio.forEach(({ audio, sampleRate }) => {
              startNarrationAudio(audio, sampleRate);
            });
          }
          const context = narrationAudioContextRef.current;
          const wordStart = narrationWordCursorRef.current;
          narrationWordCursorRef.current += realtimeEvent.wordTimings.length;
          realtimeEvent.wordTimings.forEach((timing, index) => {
            const spokenWordNumber = wordStart + index + 1;
            const sentenceIndex = narrationNextSentenceRef.current;
            const previousSentenceEnd =
              narrationSentenceEndsRef.current[sentenceIndex - 1] ?? 0;

            if (spokenWordNumber < previousSentenceEnd + 1) {
              return;
            }

            const sentenceEnd = narrationSentenceEndsRef.current[sentenceIndex];

            if (sentenceEnd === undefined) {
              return;
            }

            narrationNextSentenceRef.current += 1;
            const delay = Math.max(
              0,
              (narrationAudioStartRef.current + timing.start -
                (context?.currentTime ?? 0)) *
                1000 -
                narrationVisualLeadMs
            );
            narrationTimersRef.current.push(window.setTimeout(() => {
              setNarrationReveal((current) =>
                current
                  ? {
                      ...current,
                      revealedWordCount: Math.max(
                        current.revealedWordCount,
                        sentenceEnd
                      )
                    }
                  : current
              );
            }, delay));
          });
        }

        if (realtimeEvent.type === "tts_done") {
          const context = narrationAudioContextRef.current;
          const delay = context
            ? Math.max(0, (narrationPlaybackEndRef.current - context.currentTime) * 1000)
            : 0;
          narrationTimersRef.current.push(window.setTimeout(() => {
            setNarrationReveal(null);
          }, delay));
        }

        if (realtimeEvent.type === "tts_failed") {
          setNarrationReveal(null);
          setTableAlert(realtimeEvent.message);
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
      if (roomSocketRef.current === socket) roomSocketRef.current = null;
      window.clearInterval(interval);
    };
  }, [
    activeCampaign,
    applyRoomSnapshot,
    isSinglePlayer,
    playNarrationAudio,
    startNarrationAudio,
    roomReadDebugParam,
    setRetryableTurnState,
    setRoomResolvingState
  ]);

  function handleStartNewChat() {
    window.location.assign(routePath === "/debug" ? "/debug" : "/new-adventure");
  }

  function handleCreateNewCampaignAfterDeath() {
    window.location.assign("/new-adventure");
  }

  async function handleReviveCharacter() {
    if (!activeCampaign || isSending || isRoomResolving || isRestartingCampaign) {
      return;
    }

    setIsSending(true);
    setInputValidationMessage("");
    setTableAlert("");

    try {
      const response = await fetchWithTimeout(
        "/api/room/revive",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            roomId: activeCampaign.id,
            sessionId: activeCampaign.sessionId
          })
        },
        turnSubmissionRequestTimeoutMs
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Your character could not be revived.")
        );
      }

      const room = (await response.json()) as RoomSnapshot;

      applyRoomSnapshot(room);
      setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      setTableAlert("Your character has returned.");
      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          activeCampaign.id,
          room.messages.at(-1)?.content ?? "Your character has returned."
        )
      );
      trackAnalytics({
        name: "Character Revived",
        properties: analyticsBaseProperties()
      });
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "Your character could not be revived.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleSelectChat(campaignId: string) {
    const campaign = availableCampaigns.find(
      (availableCampaign) => availableCampaign.id === campaignId
    );

    if (!campaign) {
      return;
    }

    window.history.replaceState(
      null,
      "",
      `${routePath}?campaignId=${encodeURIComponent(campaign.id)}`
    );
    trackAnalytics({
      name: "Campaign Switched",
      properties: analyticsBaseProperties(campaign)
    });
    setActiveCampaignId(campaign.id);
    setDraft("");
    setRetryableTurnState(null);
    setRoomMessages([]);
    setRoomPlayers([]);
    setStreamingDmMessages([]);
    setHasAdventureBegun(campaign.mode === "single_player");
    setPendingRollRequests([]);
    setNextInputNeeded("player_actions");
    setInputTargets([]);
    setInputPolicy("all_players");
    setRoomCombat(undefined);
    setRoomDeath(undefined);
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
    setRetryableTurnState(null);

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
      trackAnalytics({
        name: "Campaign Invite Created",
        properties: analyticsBaseProperties(),
        milestones: ["multiplayer_invite_created"]
      });
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
      trackAnalytics({
        name: "Campaign Invite Disabled",
        properties: analyticsBaseProperties()
      });
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
      trackAnalytics({
        name: "Multiplayer Adventure Begun",
        properties: analyticsBaseProperties(),
        milestones: ["multiplayer_adventure_begun"]
      });
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

  async function handleGenerateRestartBackstory(
    mode: "generate" | "add_details",
    currentBackstory: string
  ) {
    if (!activeCampaign || isRestartingCampaign) {
      throw new Error("Campaign could not be loaded.");
    }

    const generated = await generateCampaignRestartBackstory(activeCampaign.id, {
      mode,
      currentBackstory
    });

    return generated.backstory;
  }

  async function handleRestartCampaign(backstory: string) {
    if (!activeCampaign || isRestartingCampaign) {
      return;
    }

    setIsRestartingCampaign(true);
    setInputValidationMessage("");
    setTableAlert("");

    try {
      const restarted = await restartCampaign(activeCampaign.id, { backstory });
      const campaigns = await fetchCampaigns();
      const restartedCampaign =
        campaigns.find((campaign) => campaign.id === restarted.id) ??
        (restarted as CampaignSummary);

      setAvailableCampaigns(campaigns);
      window.history.replaceState(
        null,
        "",
        `/play?campaignId=${restartedCampaign.id}`
      );
      setRestartPreparingCampaignId(restartedCampaign.id);
      setActiveCampaignId(restartedCampaign.id);
      setDraft("");
      setRetryableTurnState(null);
      setMessages(openingMessages);
      setRoomMessages([]);
      setRoomPlayers([]);
      setStreamingDmMessages([]);
      setPendingRollRequests([]);
      setNextInputNeeded("player_actions");
      setInputTargets([]);
      setInputPolicy("all_players");
      setRoomCombat(undefined);
      setRoomDeath(undefined);
      setIsInputSubmitted(false);
      pendingSubmissionRef.current = null;
      setOptimisticSubmittedPlayerId(null);
      await loadCampaignMessages(restartedCampaign);
      setTableAlert("Campaign restarted.");
    } catch (error) {
      console.error("Campaign restart failed", {
        campaignId: activeCampaign.id,
        backstoryLength: backstory.trim().length,
        error
      });
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            error instanceof Error
              ? error.message
              : "The campaign could not be restarted.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsRestartingCampaign(false);
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
    setRetryableTurnState(null);
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
      const startedAt = Date.now();
      const request = buildTurnSubmissionRequest({
        campaign: activeCampaign,
        singlePlayer: isSinglePlayer,
        playerId,
        message: content,
        skipTurn,
        clientMessageId: playerMessage.id,
        model: options.model ?? selectedAiModelFromStorage()
      });
      const response = await fetchWithTimeout(
        request.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request.body)
        },
        turnSubmissionRequestTimeoutMs
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "The dungeon master did not answer."
        );
        throw new Error(message);
      }

      const room = (await response.json()) as RoomSnapshot;
      setRetryableTurnState(null);
      applyRoomSnapshot(room);
      const latestMessage = room.messages[room.messages.length - 1];
      const counts = analyticsMessageCounts(room);
      const milestones = [
        ...(counts.playerMessageCount === 1
          ? (["first_player_message"] as const)
          : []),
        ...(counts.playerMessageCount === 5
          ? (["five_player_messages"] as const)
          : [])
      ];
      const playerTurnProperties = {
        ...analyticsBaseProperties(),
        campaignId: activeCampaign.id,
        campaignMode: activeCampaign.mode,
        messageLength: content.length,
        turnNumber: counts.playerMessageCount,
        model: request.body.model,
        skipTurn,
        hasDiceRequest: rollRequestsFromRoom(room).length > 0,
        combatActive: Boolean(room.combat?.active),
        responseLatencyMs: Date.now() - startedAt,
        hasStateChange: hasStateChange(room),
        ...counts
      };

      trackAnalytics({
        name: "Player Message Sent",
        properties: playerTurnProperties,
        milestones
      });
      if (counts.playerMessageCount === 1) {
        trackAnalytics({
          name: "First Player Message Sent",
          properties: playerTurnProperties
        });
      }

      if (latestMessage?.role === "dm") {
        const dmMilestones: HookMetric[] =
          counts.dmMessageCount === 5 ? ["five_dm_responses"] : [];

        trackAnalytics({
          name: "DM Response Received",
          properties: {
            ...analyticsBaseProperties(),
            campaignId: activeCampaign.id,
            campaignMode: activeCampaign.mode,
            hasDiceRequest: rollRequestsFromRoom(room).length > 0,
            combatActive: Boolean(room.combat?.active),
            responseLatencyMs: Date.now() - startedAt,
            responseType: dmResponseType(latestMessage),
            hasStateChange: hasStateChange(room),
            ...counts
          },
          milestones: dmMilestones
        });
      }

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
      const isTurnTimeout = isAbortError(error);
      const message =
        isTurnTimeout && !skipTurn
          ? dungeonMasterTurnTimeoutMessage
          : error instanceof Error
            ? error.message
            : "The room connection flickered. Your turn may need to be sent again.";

      if (isTurnTimeout && !skipTurn) {
        const errorMessageId = createClientId();
        setRetryableTurnState({
          message: content,
          model: options.model ?? selectedAiModelFromStorage(),
          errorMessageId
        });
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: errorMessageId,
            role: "system",
            content: message,
            createdAt: new Date().toISOString()
          }
        ]);
      } else {
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createClientId(),
            role: "system",
            content: message,
            createdAt: new Date().toISOString()
          }
        ]);
      }
      pendingSubmissionRef.current = null;
      setOptimisticSubmittedPlayerId(null);
      setIsInputSubmitted(false);
      setRoomResolvingState(false);
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
      const startedAt = Date.now();
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
      const counts = analyticsMessageCounts(room);
      const latestMessage = room.messages[room.messages.length - 1];
      trackAnalytics({
        name: "Regenerate Response Submitted",
        properties: {
          ...analyticsBaseProperties(),
          campaignId: activeCampaign.id,
          campaignMode: activeCampaign.mode,
          responseLatencyMs: Date.now() - startedAt,
          responseType: "regenerated",
          hasStateChange: hasStateChange(room),
          ...counts
        },
        milestones: ["regenerated_response"]
      });

      if (isSinglePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

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
      const startedAt = Date.now();
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
      const counts = analyticsMessageCounts(room);
      const latestMessage = room.messages[room.messages.length - 1];
      trackAnalytics({
        name: "Ask DM Submitted",
        properties: {
          ...analyticsBaseProperties(),
          campaignId: activeCampaign.id,
          campaignMode: activeCampaign.mode,
          messageLength: question.length,
          model,
          responseLatencyMs: Date.now() - startedAt,
          responseType: dmResponseType(latestMessage),
          hasStateChange: hasStateChange(room),
          ...counts
        },
        milestones: ["asked_dm"]
      });

      if (isSinglePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

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

  function handleRetryLastTurn() {
    if (!retryableTurn) {
      return;
    }

    void sendTurn(retryableTurn.message, { model: retryableTurn.model });
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
      const startedAt = Date.now();
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
      const counts = analyticsMessageCounts(room);
      trackAnalytics({
        name: "Dice Roll Submitted",
        properties: {
          ...analyticsBaseProperties(campaign),
          diceSubmissionCount: rollSubmissions.length,
          rollType: rollSubmissions.length > 0 ? "dm_requested_roll" : undefined,
          requestedByDm: true,
          hasDiceRequest: rollRequestsFromRoom(room).length > 0,
          combatActive: Boolean(room.combat?.active),
          responseLatencyMs: Date.now() - startedAt,
          hasStateChange: hasStateChange(room),
          ...counts
        },
        milestones: ["dice_submitted"]
      });

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
    trackAnalytics({
      name: "Dice Roll Queued",
      properties: {
        ...analyticsBaseProperties(),
        diceSubmissionCount: 1
      }
    });

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
    trackAnalytics({
      name: "NPC Card Updated",
      properties: analyticsBaseProperties()
    });

    return updatedCard;
  }

  async function handleGenerateCombatCheatSheet() {
    if (!activeCampaign?.id) {
      setCombatCheatSheetError("Campaign could not be loaded.");
      return;
    }

    setIsGeneratingCombatCheatSheet(true);
    setCombatCheatSheetError("");

    try {
      const response = await fetch("/api/room/player/combat-cheat-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: activeCampaign.id,
          sessionId: activeCampaign.sessionId,
          playerId: activeResourcePlayer?.id
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string | { message?: string };
        } | null;
        const message =
          typeof body?.error === "string"
            ? body.error
            : body?.error?.message ||
              "Combat cheat sheet could not be generated.";

        throw new Error(message);
      }

      const room = (await response.json()) as RoomSnapshot;

      applyRoomSnapshot(room);
      trackAnalytics({
        name: "Combat Cheat Sheet Generated",
        properties: analyticsBaseProperties()
      });
    } catch (error) {
      setCombatCheatSheetError(
        error instanceof Error
          ? error.message
          : "Combat cheat sheet could not be generated."
      );
    } finally {
      setIsGeneratingCombatCheatSheet(false);
    }
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

  if (isRestartPreparing) {
    return (
      <main className="campaign-creation-screen" aria-label="Preparing campaign">
        <section className="campaign-creation-center" aria-live="polite">
          <CampaignPreparationLoader />
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
          <button
            className="mobile-sidebar-toggle"
            type="button"
            aria-label="Open adventures drawer"
            aria-expanded={isMobileSidebarOpen}
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          {isMobileSidebarOpen ? (
            <button
              className="mobile-sidebar-backdrop"
              type="button"
              aria-label="Close adventures drawer"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
          ) : null}
          <ChatHistorySidebar
            chats={availableCampaigns}
            activeChatId={activeCampaignId}
            isLoading={isLoadingCampaigns}
            isCreatingChat={isCreatingChat}
            isMobileDrawerOpen={isMobileSidebarOpen}
            onCloseMobileDrawer={() => setIsMobileSidebarOpen(false)}
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
              trackAnalytics({
                name: "Character Sheet Opened",
                properties: {
                  ...analyticsBaseProperties(),
                  resourceTab: "character_sheet"
                },
                milestones: ["used_player_resources"]
              });
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
              retryMessageId={retryableTurn?.errorMessageId}
              waitingPlayers={waitingPlayers}
              onInspectMap={() => setIsMessageMapOpen(true)}
              onRegenerateResponse={(messageId) =>
                void handleRegenerateResponse(messageId)
              }
              onRetryLastTurn={retryableTurn ? handleRetryLastTurn : undefined}
              onViewEldermereLore={() => {
                setPlayerResourcesInitialTab("eldermere_lore");
                setIsCharacterSheetOpen(true);
                trackAnalytics({
                  name: "Player Resource Tab Opened",
                  properties: {
                    ...analyticsBaseProperties(),
                    resourceTab: "eldermere_lore"
                  },
                  milestones: ["used_player_resources"]
                });
              }}
              onNarrateMessage={narrateMessage}
              onSaveNarration={saveNarrationScript}
              narrationReveal={narrationReveal}
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

            {isCharacterDead ? (
              <section className="death-choice-panel" aria-label="Character death">
                <div>
                  <strong>
                    {roomDeath?.characterName
                      ? `${roomDeath.characterName} has died.`
                      : "Your character has died."}
                  </strong>
                  <p>
                    Death is real here. Continue with a new tale, or let
                    Eldermere return this soul to a changed world.
                  </p>
                </div>
                <div className="death-choice-actions">
                  <button
                    type="button"
                    disabled={isSending || isRoomResolving}
                    onClick={() => void handleReviveCharacter()}
                  >
                    <HeartPulse size={17} />
                    Revive your character
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={handleCreateNewCampaignAfterDeath}
                  >
                    <Plus size={17} />
                    Create new Campaign
                  </button>
                </div>
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
              restartBackstory={activeBackstory}
              canRestartCampaign={Boolean(isSinglePlayer && activeCampaign)}
              isRestartingCampaign={isRestartingCampaign}
              onDraftChange={setDraft}
              onModeChange={setInputMode}
              onRollDice={handleRollDice}
              onRetryLastTurn={retryableTurn ? handleRetryLastTurn : undefined}
              onSkipTurn={!isSinglePlayer ? handleSkipTurn : undefined}
              onGenerateRestartBackstory={handleGenerateRestartBackstory}
              onRestartCampaign={handleRestartCampaign}
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
          portraitUrl={activeResourcePlayer?.portraitUrl}
          combatCheatSheet={activeResourcePlayer?.combatCheatSheet}
          combatCheatSheetUpdatedAt={activeResourcePlayer?.combatCheatSheetUpdatedAt}
          isGeneratingCombatCheatSheet={isGeneratingCombatCheatSheet}
          combatCheatSheetError={combatCheatSheetError}
          isLoadingNpcCards={isLoadingNpcCards}
          npcCards={npcCards}
          npcCardsError={npcCardsError}
          onClose={() => setIsCharacterSheetOpen(false)}
          onTabChange={(tab) =>
            trackAnalytics({
              name:
                tab === "character_sheet"
                  ? "Character Sheet Opened"
                  : "Player Resource Tab Opened",
              properties: {
                ...analyticsBaseProperties(),
                resourceTab: tab
              },
              milestones: ["used_player_resources"]
            })
          }
          onGenerateCombatCheatSheet={handleGenerateCombatCheatSheet}
          onNpcCardUpdate={handleUpdateNpcCard}
        />
      ) : null}

      {isMessageMapOpen ? (
        <EldermereMapModal onClose={() => setIsMessageMapOpen(false)} />
      ) : null}

      {backstoryIntro ? (
        <BackstoryIntroModal
          backstory={backstoryIntro.backstory}
          countdown={backstoryIntroCountdown}
          onContinue={closeBackstoryIntro}
        />
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
