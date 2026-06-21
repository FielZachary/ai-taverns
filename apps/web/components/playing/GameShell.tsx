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
  Play,
  PanelRightClose,
  PanelRightOpen,
  Send,
  X
} from "lucide-react";
import type { GameMessage, HermesTurnResponse } from "@/lib/game-types";
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

const chats: ChatSummary[] = [
  {
    id: "new-adventure",
    title: "New Adventure"
  }
];

const playerIdStorageKey = "ai-dnd.playerId";
const maxPlayers = 4;

type HermesSessionsApiResponse = {
  sessions?: ChatSummary[];
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
  players: RoomPlayer[];
  messages: GameMessage[];
  isResolving: boolean;
  hasBegun: boolean;
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
    return data.error?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function mergeChats(localChats: ChatSummary[], remoteChats: ChatSummary[]) {
  const remoteChatIds = new Set(remoteChats.map((chat) => chat.id));
  const localOnlyChats = localChats.filter(
    (chat) => !remoteChatIds.has(chat.id) && chat.id.startsWith("ai-dnd-")
  );

  return [...localOnlyChats, ...remoteChats];
}

function upsertChat(chatsToUpdate: ChatSummary[], updatedChat: ChatSummary) {
  if (chatsToUpdate.some((chat) => chat.id === updatedChat.id)) {
    return chatsToUpdate.map((chat) =>
      chat.id === updatedChat.id ? updatedChat : chat
    );
  }

  return [updatedChat, ...chatsToUpdate];
}

export function GameShell() {
  const [messages, setMessages] = useState<GameMessage[]>(openingMessages);
  const [availableChats, setAvailableChats] = useState<ChatSummary[]>(chats);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [activeChatId, setActiveChatId] = useState(chats[0].id);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = useMemo(
    () =>
      availableChats.find((chat) => chat.id === activeChatId) ??
      availableChats[0] ??
      chats[0],
    [activeChatId, availableChats]
  );

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
          player.characterName && player.username
            ? player.username
            : "",
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

  const canBeginAdventure = roomPlayers.length >= 2 && !hasAdventureBegun;

  const applyRoomSnapshot = useCallback(
    (room: RoomSnapshot) => {
      setRoomPlayers(room.players);
      setRoomMessages(room.messages);
      setIsRoomResolving(room.isResolving);
      setHasAdventureBegun(room.hasBegun);

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
    if (
      inputValidationMessage &&
      getMissingPlayerProfileFields(playerProfile).length === 0
    ) {
      setInputValidationMessage("");
    }
  }, [inputValidationMessage, playerProfile]);

  const registerPlayerProfile = useCallback(
    async (profile: PlayerProfile) => {
      if (!playerId) {
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
          roomId: activeChat.id,
          sessionId: activeChat.id,
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
    [activeChat.id, applyRoomSnapshot, playerId]
  );

  useEffect(() => {
    if (!playerId || getMissingPlayerProfileFields(playerProfile).length > 0) {
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
  }, [playerId, playerProfile, registerPlayerProfile]);

  useEffect(() => {
    let shouldIgnore = false;

    async function pollRoom() {
      try {
        const response = await fetch(
          `/api/room?roomId=${encodeURIComponent(
            activeChat.id
          )}&sessionId=${encodeURIComponent(activeChat.id)}`
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
  }, [activeChat.id, applyRoomSnapshot]);

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

  const fetchHermesSessions = useCallback(async () => {
    const response = await fetch("/api/hermes/sessions");

    if (!response.ok) {
      throw new Error("Sessions could not be loaded.");
    }

    const data = (await response.json()) as HermesSessionsApiResponse;

    return data.sessions && data.sessions.length > 0 ? data.sessions : chats;
  }, []);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadChats() {
      setIsLoadingChats(true);

      try {
        const sessions = await fetchHermesSessions();
        const firstSession = sessions[0];

        if (shouldIgnore) {
          return;
        }

        setAvailableChats(sessions);
        setActiveChatId(firstSession.id);
        await loadSessionMessages(firstSession.id);
      } catch {
        if (!shouldIgnore) {
          setAvailableChats(chats);
          setActiveChatId(chats[0].id);
          setMessages(openingMessages);
        }
      } finally {
        if (!shouldIgnore) {
          setIsLoadingChats(false);
        }
      }
    }

    void loadChats();

    return () => {
      shouldIgnore = true;
    };
  }, [fetchHermesSessions, loadSessionMessages]);

  useEffect(() => {
    let shouldIgnore = false;

    async function refreshChats() {
      try {
        const sessions = await fetchHermesSessions();

        if (!shouldIgnore) {
          setAvailableChats((currentChats) => mergeChats(currentChats, sessions));
        }
      } catch {
        // Keep the last good sidebar list if Hermes is briefly unavailable.
      }
    }

    const interval = window.setInterval(() => {
      void refreshChats();
    }, 3000);

    return () => {
      shouldIgnore = true;
      window.clearInterval(interval);
    };
  }, [fetchHermesSessions]);

  async function handleStartNewChat() {
    if (isCreatingChat) {
      return;
    }

    const newChat: ChatSummary = {
      id: `ai-dnd-${Date.now()}`,
      title: "New Adventure"
    };

    setInputValidationMessage("");
    setTableAlert("");
    setIsInputSubmitted(false);
    setIsCreatingChat(true);
    setIsLoadingMessages(true);

    try {
      const response = await fetch("/api/hermes/prep", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: newChat.id
        })
      });

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          "Hermes could not prepare the campaign room."
        );
        throw new Error(message);
      }

      const data = (await response.json()) as HermesTurnResponse;
      setActiveChatId(newChat.id);
      setMessages([data.message]);
      setRoomMessages([]);
      setRoomPlayers([]);
      setHasAdventureBegun(false);
      setDraft("");
      setAvailableChats((currentChats) =>
        upsertChat(currentChats, {
          ...newChat,
          preview: data.message.content,
          time: "Now"
        })
      );
    } catch (error) {
      setTableAlert(
        error instanceof Error
          ? error.message
          : "Hermes could not create the campaign yet."
      );
    } finally {
      setIsCreatingChat(false);
      setIsLoadingMessages(false);
      inputRef.current?.focus();
    }
  }

  async function handleSelectChat(chatId: string) {
    setActiveChatId(chatId);
    setDraft("");
    setRoomMessages([]);
    setRoomPlayers([]);
    setHasAdventureBegun(false);
    setInputValidationMessage("");
    setTableAlert("");
    setIsInputSubmitted(false);
    await loadSessionMessages(chatId);
    inputRef.current?.focus();
  }

  async function handleDeleteChat(chatId: string) {
    const chatToDelete = availableChats.find((chat) => chat.id === chatId);

    if (
      !window.confirm(
        `Archive "${chatToDelete?.title ?? "this adventure"}"?`
      )
    ) {
      return;
    }

    const nextChats =
      availableChats.filter((chat) => chat.id !== chatId).length > 0
        ? availableChats.filter((chat) => chat.id !== chatId)
        : chats;
    const nextActiveChat =
      chatId === activeChatId ? nextChats[0] : activeChat;

    setAvailableChats(nextChats);
    setActiveChatId(nextActiveChat.id);
    setDraft("");

    if (chatId === activeChatId) {
      setMessages(openingMessages);
      void loadSessionMessages(nextActiveChat.id);
    }

    try {
      const response = await fetch(
        `/api/hermes/sessions/${encodeURIComponent(chatId)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Hermes could not delete that adventure.");
      }
    } catch {
      setAvailableChats(availableChats);
      setActiveChatId(activeChatId);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            "That adventure could not be archived. The session is still saved.",
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  async function handleRenameChat(chatId: string) {
    const chatToRename = availableChats.find((chat) => chat.id === chatId);
    const nextTitle = window
      .prompt("Rename adventure", chatToRename?.title ?? "")
      ?.trim();

    if (!nextTitle) {
      return;
    }

    setAvailableChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: nextTitle
            }
          : chat
      )
    );

    try {
      const response = await fetch(
        `/api/hermes/sessions/${encodeURIComponent(chatId)}`,
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
      setAvailableChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                title: chatToRename?.title ?? chat.title
              }
            : chat
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
    if (!canBeginAdventure || isRoomResolving) {
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
          roomId: activeChat.id,
          sessionId: activeChat.id
        })
      });

      if (!response.ok) {
        throw new Error("The adventure could not begin.");
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
      const latestMessage = room.messages[room.messages.length - 1];

      setAvailableChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === activeChat.id
            ? {
                ...chat,
                preview: latestMessage?.content ?? "Adventure begun",
                time: "Now"
              }
            : chat
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
    try {
      const response = await fetch("/api/room/kick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: activeChat.id,
          sessionId: activeChat.id,
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

    if (!content || isSending) {
      return;
    }

    if (!hasAdventureBegun) {
      setInputValidationMessage("Begin the adventure before sending turns.");
      setInputValidationPulse((currentPulse) => currentPulse + 1);
      return;
    }

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

    setInputValidationMessage("");
    const playerMessage: GameMessage = {
      id: createClientId(),
      role: "player",
      content,
      createdAt: new Date().toISOString()
    };

    const nextMessages = [...messages, playerMessage];
    setDraft("");
    setIsSending(true);
    setIsInputSubmitted(true);
    setAvailableChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              preview: content,
              time: "Now"
            }
          : chat
      )
    );

    try {
      const response = await fetch("/api/room/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: activeChat.id,
          sessionId: activeChat.id,
          playerId,
          message: content,
          history: nextMessages
        })
      });

      if (!response.ok) {
        throw new Error("The dungeon master did not answer.");
      }

      const room = (await response.json()) as RoomSnapshot;
      applyRoomSnapshot(room);
      const latestMessage = room.messages[room.messages.length - 1];
      setAvailableChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === activeChat.id
            ? {
                ...chat,
                preview: latestMessage?.content ?? content,
                time: "Now"
              }
            : chat
        )
      );
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createClientId(),
          role: "system",
          content:
            "The room connection flickered. Your turn may need to be sent again.",
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
    void sendTurn(draft);
  }

  function handleRollD20() {
    const roll = Math.floor(Math.random() * 20) + 1;
    const rollText = `I rolled a d20: ${roll}`;

    setInputValidationMessage("");
    setDraft((currentDraft) =>
      currentDraft.trim() ? `${currentDraft.trim()}\n${rollText}` : rollText
    );
    inputRef.current?.focus();
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
            <p className="eyebrow">Hermes Table</p>
            <h1>{activeChat.title}</h1>
          </div>
          <div className="status-pill">
            <Flame size={16} />
            Live Session
          </div>
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
        </header>

        <div
          className={`table-grid ${
            isSessionPanelOpen ? "" : "session-panel-collapsed"
          }`}
        >
          <ChatHistorySidebar
            chats={availableChats}
            activeChatId={activeChatId}
            isLoading={isLoadingChats}
            isCreatingChat={isCreatingChat}
            onStartNewChat={() => void handleStartNewChat()}
            onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
            onRenameChat={handleRenameChat}
            onSelectChat={(chatId) => void handleSelectChat(chatId)}
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

            <section className="player-status-board" aria-label="Player action status">
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

            <PlayerInput
              ref={inputRef}
              draft={draft}
              isSending={isSending}
              isSubmitted={isSending || isInputSubmitted}
              lockMessage={
                hasAdventureBegun
                  ? undefined
                  : "You can only start once the adventure has begun"
              }
              validationMessage={inputValidationMessage}
              validationPulse={inputValidationPulse}
              onDraftChange={setDraft}
              onRollD20={handleRollD20}
              onSubmit={handleSubmit}
            />
          </div>

          {isSessionPanelOpen ? (
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
        onClick={() => void sendTurn(draft)}
      >
        <Send size={22} />
      </button>
    </main>
  );
}
