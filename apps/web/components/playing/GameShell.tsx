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
  PanelRightClose,
  PanelRightOpen,
  Send,
  X
} from "lucide-react";
import type {
  DiceRollRequest,
  DiceRollResult,
  GameMessage
} from "@/lib/game-types";
import {
  ChatHistorySidebar,
  type ChatSummary
} from "./ChatHistorySidebar";
import { MessageLog } from "./MessageLog";
import {
  defaultCharacterSheet,
  emptyPlayerProfile,
  PlayerPanel,
  type PlayerProfile
} from "./PlayerPanel";
import { PlayerInput } from "./PlayerInput";

const openingMessages: GameMessage[] = [];
const playerIdStorageKey = "ai-dnd.playerId";
const maxPlayers = 4;

type CampaignMode = "single_player" | "multiplayer";

type CampaignSummary = ChatSummary & {
  hermesSessionId: string;
  mode: CampaignMode;
};

type CampaignsApiResponse = {
  campaigns?: CampaignSummary[];
  campaign?: CampaignSummary;
  error?: string;
};

type HermesMessagesApiResponse = {
  messages?: GameMessage[];
};

type ApiErrorResponse = {
  error?: string;
};

type RoomPlayer = {
  id: string;
  slot: number;
  username: string;
  characterName: string;
  status: "waiting" | "submitted";
};

type PlayerStatusSlot = {
  id: string;
  status: string;
  name: string;
  detail: string;
  canKick: boolean;
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
};

type GameShellProps = {
  initialCampaignId?: string;
  userEmail?: string;
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
    throw new Error("Hermes requested an unsupported dice roll.");
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
    throw new Error("Hermes requested an unsupported dice roll.");
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
  return campaigns.map((campaign) =>
    campaign.id === campaignId
      ? {
          ...campaign,
          preview,
          time: "Now"
        }
      : campaign
  );
}

export function GameShell({ initialCampaignId, userEmail }: GameShellProps) {
  const [messages, setMessages] = useState<GameMessage[]>(openingMessages);
  const [availableCampaigns, setAvailableCampaigns] = useState<CampaignSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingChat] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(initialCampaignId ?? "");
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(true);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeCampaign = useMemo(
    () =>
      availableCampaigns.find((campaign) => campaign.id === activeCampaignId) ??
      availableCampaigns[0],
    [activeCampaignId, availableCampaigns]
  );
  const isSinglePlayer = activeCampaign?.mode === "single_player";
  const activeHermesSessionId = activeCampaign?.hermesSessionId ?? "";
  const pendingRollRequest = pendingRollRequests[0] ?? null;

  const playerStatusSlots = useMemo<PlayerStatusSlot[]>(() => {
    return Array.from({ length: maxPlayers }, (_, slot) => {
      const player = roomPlayers.find((roomPlayer) => roomPlayer.slot === slot);

      if (!player) {
        return {
          id: `slot-${slot}`,
          status: "No Player",
          name: "Open Slot",
          detail: "",
          canKick: false
        };
      }

      return {
        id: player.id,
        status: player.status === "submitted" ? "Submitted." : "Waiting",
        name: player.characterName || player.username,
        detail:
          player.characterName && player.username ? player.username : "",
        canKick: true
      };
    });
  }, [roomPlayers]);

  const visibleMessages = useMemo(() => {
    const seenMessageIds = new Set(messages.map((message) => message.id));
    const newRoomMessages = roomMessages.filter(
      (message) => !seenMessageIds.has(message.id)
    );

    return [...messages, ...newRoomMessages];
  }, [messages, roomMessages]);

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

      const currentPlayer = room.players.find(
        (roomPlayer) => roomPlayer.id === playerId
      );

      if (currentPlayer?.status === "submitted" || room.isResolving) {
        setIsInputSubmitted(true);
      } else if (currentPlayer?.status === "waiting") {
        setIsInputSubmitted(false);
      }
    },
    [playerId]
  );

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    setIsLoadingMessages(true);

    try {
      const response = await fetch(
        `/api/hermes/sessions/${encodeURIComponent(sessionId)}/messages`
      );

      if (!response.ok) {
        throw new Error("Session messages could not be loaded.");
      }

      const data = (await response.json()) as HermesMessagesApiResponse;
      setMessages(
        data.messages && data.messages.length > 0
          ? data.messages
          : openingMessages
      );
    } catch {
      setMessages(openingMessages);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

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
        await loadSessionMessages(selectedCampaign.hermesSessionId);
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
  }, [fetchCampaigns, initialCampaignId, loadSessionMessages]);

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
        setIsSessionPanelOpen(true);
        setInputValidationMessage(
          `Finish your ${missingProfileFields.join(", ")} before updating.`
        );
        setInputValidationPulse((currentPulse) => currentPulse + 1);
        return;
      }

      const response = await fetch("/api/room/player", {
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
      return;
    }

    let shouldIgnore = false;

    async function pollRoom() {
      try {
        const response = await fetch(
          `/api/room?roomId=${encodeURIComponent(
            activeCampaign.id
          )}&sessionId=${encodeURIComponent(activeCampaign.hermesSessionId)}`
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
          } else {
            applyRoomSnapshot(room);
          }
        }
      } catch {
        if (!shouldIgnore) {
          setIsRoomResolving(false);
        }
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
    setInputValidationMessage("");
    setTableAlert("");
    setIsInputSubmitted(false);
    await loadSessionMessages(campaign.hermesSessionId);
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
        void loadSessionMessages(nextActiveCampaign.hermesSessionId);
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
        throw new Error("The adventure could not begin.");
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
      const latestMessage = room.messages[room.messages.length - 1];

      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          activeCampaign.id,
          latestMessage?.content ?? "Adventure begun"
        )
      );
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            "Hermes could not begin the adventure. Make sure at least two players have joined.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsRoomResolving(false);
      inputRef.current?.focus();
    }
  }

  async function handleKickPlayer(kickedPlayerId: string) {
    if (!activeCampaign) {
      return;
    }

    try {
      const response = await fetch("/api/room/kick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: activeCampaign.id,
          sessionId: activeCampaign.hermesSessionId,
          playerId: kickedPlayerId
        })
      });

      if (!response.ok) {
        throw new Error("Player could not be removed.");
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content: "That player could not be removed from the room.",
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  async function sendTurn(messageText: string) {
    const content = messageText.trim();

    if (!content || isSending || !activeCampaign) {
      return;
    }

    if (pendingRollRequest) {
      setInputValidationMessage("Hermes is waiting for the required roll.");
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
        setIsSessionPanelOpen(true);
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
                  message: content
                }
              : {
                  roomId: activeCampaign.id,
                  sessionId: activeCampaign.hermesSessionId,
                  playerId,
                  message: content
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendTurn(draft);
  }

  async function sendPendingRoll() {
    if (!pendingRollRequest || isSending || !activeCampaign) {
      return;
    }

    setInputValidationMessage("");
    const rollResult = rollDiceExpression(
      pendingRollRequest.dice,
      pendingRollRequest.modifier
    );
    const rollMessage: GameMessage = {
      id: createClientId(),
      role: "player",
      content: formatRollSubmission(pendingRollRequest, rollResult),
      createdAt: new Date().toISOString()
    };

    setMessages((currentMessages) => [...currentMessages, rollMessage]);
    setIsSending(true);
    setDraft("");
    setAvailableCampaigns((currentCampaigns) =>
      updateCampaignPreview(
        currentCampaigns,
        activeCampaign.id,
        rollMessage.content
      )
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
                  rollRequestId: pendingRollRequest.id,
                  rollResult,
                  clientMessageId: rollMessage.id
                }
              : {
                  roomId: activeCampaign.id,
                  sessionId: activeCampaign.hermesSessionId,
                  playerId,
                  rollRequestId: pendingRollRequest.id,
                  rollResult,
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

      if (isSinglePlayer) {
        setMessages(room.messages.length > 0 ? room.messages : openingMessages);
      }

      const latestMessage = room.messages[room.messages.length - 1];
      setAvailableCampaigns((currentCampaigns) =>
        updateCampaignPreview(
          currentCampaigns,
          activeCampaign.id,
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

  function handleRollD20() {
    if (pendingRollRequest) {
      void sendPendingRoll();
      return;
    }

    const roll = Math.floor(Math.random() * 20) + 1;
    const rollText = `I rolled a d20: ${roll}`;

    setInputValidationMessage("");
    setDraft((currentDraft) =>
      currentDraft.trim() ? `${currentDraft.trim()}\n${rollText}` : rollText
    );
    inputRef.current?.focus();
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
              {isSinglePlayer ? "Hermes Solo" : "Hermes Table"}
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
          {!isSinglePlayer ? (
            <button
              className="panel-toggle"
              type="button"
              aria-label={
                isSessionPanelOpen
                  ? "Collapse session panel"
                  : "Expand session panel"
              }
              aria-pressed={isSessionPanelOpen}
              onClick={() => setIsSessionPanelOpen((isOpen) => !isOpen)}
            >
              {isSessionPanelOpen ? (
                <PanelRightClose size={20} />
              ) : (
                <PanelRightOpen size={20} />
              )}
            </button>
          ) : null}
        </header>

        <div
          className={`table-grid ${
            isSessionPanelOpen && !isSinglePlayer ? "" : "session-panel-collapsed"
          }`}
        >
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
              isSending={isSending || isLoadingMessages || isRoomResolving}
            />

            {!isSinglePlayer ? (
              <>
                <section
                  className="player-status-board"
                  aria-label="Player action status"
                >
                  {playerStatusSlots.map((player) => (
                    <div className="player-status-item" key={player.id}>
                      <div className="player-avatar" aria-hidden="true" />
                      <div className="player-status-content">
                        <div className="player-status-name">
                          <strong>
                            {player.name}
                            {player.canKick ? (
                              <button
                                className="player-kick-button"
                                type="button"
                                aria-label={`Kick ${player.name}`}
                                onClick={() => void handleKickPlayer(player.id)}
                              >
                                <X size={13} />
                              </button>
                            ) : null}
                          </strong>
                          {player.detail ? <span>{player.detail}</span> : null}
                        </div>
                        <div
                          className={`player-status-pill ${
                            player.status === "Submitted."
                              ? "status-submitted"
                              : player.status === "Waiting"
                                ? "status-waiting"
                                : "status-empty"
                          }`}
                        >
                          {player.status === "Waiting" ? (
                            <>
                              Waiting
                              <span className="waiting-dots" aria-hidden="true">
                                <span>.</span>
                                <span>.</span>
                                <span>.</span>
                              </span>
                            </>
                          ) : (
                            player.status
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </section>

                {!hasAdventureBegun ? (
                  <section className="begin-adventure-panel">
                    <p>
                      {roomPlayers.length >= 2
                        ? "The party is gathered. Let Hermes open the campaign."
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
              </>
            ) : null}

            <PlayerInput
              ref={inputRef}
              draft={draft}
              isSending={isSending}
              isSubmitted={isSending || isInputSubmitted}
              lockMessage={
                pendingRollRequest
                  ? `Roll required: ${pendingRollRequest.label}`
                  : !isSinglePlayer && !hasAdventureBegun
                  ? "You can only start once the adventure has begun"
                  : undefined
              }
              requiredRoll={pendingRollRequest}
              validationMessage={inputValidationMessage}
              validationPulse={inputValidationPulse}
              onDraftChange={setDraft}
              onRollD20={handleRollD20}
              onSubmit={handleSubmit}
            />
          </div>

          {isSessionPanelOpen && !isSinglePlayer ? (
            <PlayerPanel
              onProfileChange={setPlayerProfile}
              onProfileUpdate={(profile) => {
                void registerPlayerProfile(profile);
              }}
            />
          ) : null}
        </div>
      </section>

      <button
        className="floating-send"
        type="button"
        aria-label="Send turn"
        disabled={Boolean(pendingRollRequest) || isSending || !draft.trim()}
        onClick={() => void sendTurn(draft)}
      >
        <Send size={22} />
      </button>
    </main>
  );
}
