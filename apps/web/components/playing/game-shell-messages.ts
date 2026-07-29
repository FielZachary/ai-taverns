import type { GameMessage } from "@/lib/game-types";
import { eldermereMapImageSrc } from "./eldermere-map";

export type StreamingDmMessage = GameMessage & {
  turnId: string;
};

type OrderedGameMessage = {
  message: GameMessage;
  sourceRank: number;
  sourceIndex: number;
};

type PlayerMessageAvatarSource = {
  characterName?: string | null;
  portraitUrl?: string | null;
  username?: string | null;
};

export const playerResourcesIntroText =
  "All of your character and campaign information is found in the Player Resources on the bottom left, check it out if you need any help with your character.";

function streamingMessageId(turnId: string) {
  return `dm-stream-${turnId}`;
}

function messageTime(message: GameMessage) {
  const parsedTime = Date.parse(message.createdAt);

  return Number.isNaN(parsedTime) ? Number.POSITIVE_INFINITY : parsedTime;
}

function compareMessageTime(firstMessage: GameMessage, secondMessage: GameMessage) {
  const firstTime = messageTime(firstMessage);
  const secondTime = messageTime(secondMessage);

  if (firstTime < secondTime) {
    return -1;
  }

  if (firstTime > secondTime) {
    return 1;
  }

  return 0;
}

function messageRoleRank(message: GameMessage) {
  if (message.role === "player") {
    return 0;
  }

  if (message.role === "dm") {
    return 1;
  }

  return 2;
}

function offsetMessageTime(message: GameMessage, offsetMs: number) {
  const parsedTime = Date.parse(message.createdAt);

  if (Number.isNaN(parsedTime)) {
    return message.createdAt;
  }

  return new Date(parsedTime + offsetMs).toISOString();
}

function portraitKey(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

export function withOpeningResourceMessages(messages: GameMessage[]) {
  const firstDmMessage = messages.find(
    (message) => message.role === "dm" && message.kind !== "ask_dm_answer"
  );

  if (!firstDmMessage) {
    return messages;
  }

  const mapMessageId = `${firstDmMessage.id}-eldermere-map`;
  const resourcesMessageId = `${firstDmMessage.id}-player-resources-guide`;

  if (
    messages.some(
      (message) => message.id === mapMessageId || message.id === resourcesMessageId
    )
  ) {
    return messages;
  }

  const firstDmIndex = messages.findIndex(
    (message) => message.id === firstDmMessage.id
  );
  const introMessages: GameMessage[] = [
    {
      id: mapMessageId,
      role: "dm",
      content: "",
      createdAt: offsetMessageTime(firstDmMessage, -2),
      isSyntheticIntro: true,
      resourceCard: {
        type: "eldermere_map",
        imageUrl: eldermereMapImageSrc,
        imageAlt: "Map of Eldermere",
        actions: ["inspect_map", "view_eldermere_lore"]
      }
    },
    {
      id: resourcesMessageId,
      role: "dm",
      content: playerResourcesIntroText,
      createdAt: offsetMessageTime(firstDmMessage, -1),
      isSyntheticIntro: true
    }
  ];

  return [
    ...messages.slice(0, firstDmIndex),
    ...introMessages,
    ...messages.slice(firstDmIndex)
  ];
}

export function withPlayerMessageAvatars(
  messages: GameMessage[],
  players: PlayerMessageAvatarSource[]
) {
  const portraitUrlsByName = new Map<string, string>();

  players.forEach((player) => {
    const portraitUrl = player.portraitUrl?.trim();

    if (!portraitUrl) {
      return;
    }

    [player.characterName, player.username].forEach((name) => {
      const key = portraitKey(name);

      if (key) {
        portraitUrlsByName.set(key, portraitUrl);
      }
    });
  });

  if (portraitUrlsByName.size === 0) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== "player") {
      return message;
    }

    const portraitUrl =
      portraitUrlsByName.get(portraitKey(message.characterName)) ??
      portraitUrlsByName.get(portraitKey(message.playerName));

    return portraitUrl ? { ...message, avatarUrl: portraitUrl } : message;
  });
}

export function startStreamingDmMessage(
  currentMessages: StreamingDmMessage[],
  turnId: string,
  createdAt: string
) {
  return [
    ...currentMessages.filter((message) => message.turnId !== turnId),
    {
      id: streamingMessageId(turnId),
      turnId,
      role: "dm" as const,
      content: "",
      createdAt
    }
  ];
}

export function appendStreamingDmDelta(
  currentMessages: StreamingDmMessage[],
  turnId: string,
  text: string,
  createdAt: string
) {
  const existingMessage = currentMessages.find(
    (message) => message.turnId === turnId
  );

  if (!existingMessage) {
    return [
      ...currentMessages,
      {
        id: streamingMessageId(turnId),
        turnId,
        role: "dm" as const,
        content: text,
        createdAt
      }
    ];
  }

  return currentMessages.map((message) =>
    message.turnId === turnId
      ? {
          ...message,
          content: `${message.content}${text}`
        }
      : message
  );
}

export function removeStreamingDmMessage(
  currentMessages: StreamingDmMessage[],
  turnId: string
) {
  return currentMessages.filter((message) => message.turnId !== turnId);
}

export function completeStreamingDmMessage(
  currentMessages: StreamingDmMessage[],
  turnId: string,
  messageId: string
) {
  return currentMessages.map((message) =>
    message.turnId === turnId ? { ...message, id: messageId } : message
  );
}

export function removePersistedStreamingDmMessages(
  currentMessages: StreamingDmMessage[],
  roomMessages: GameMessage[]
) {
  const roomMessageIds = new Set(
    roomMessages.map((roomMessage) => roomMessage.id)
  );

  return currentMessages.filter((message) => !roomMessageIds.has(message.id));
}

export function mergeVisibleGameMessages({
  localMessages,
  roomMessages,
  streamingDmMessages
}: {
  localMessages: GameMessage[];
  roomMessages: GameMessage[];
  streamingDmMessages: StreamingDmMessage[];
}) {
  const mergedMessages = new Map<string, OrderedGameMessage>();
  const roomMessageIds = new Set(
    roomMessages.map((roomMessage) => roomMessage.id)
  );

  localMessages.forEach((message, sourceIndex) => {
    mergedMessages.set(message.id, { message, sourceRank: 0, sourceIndex });
  });
  roomMessages.forEach((message, sourceIndex) => {
    mergedMessages.set(message.id, { message, sourceRank: 1, sourceIndex });
  });
  streamingDmMessages.forEach((message, sourceIndex) => {
    if (!roomMessageIds.has(message.id)) {
      mergedMessages.set(message.id, { message, sourceRank: 2, sourceIndex });
    }
  });

  return Array.from(mergedMessages.values())
    .sort((firstEntry, secondEntry) => {
      const firstMessage = firstEntry.message;
      const secondMessage = secondEntry.message;
      const timeDifference = compareMessageTime(firstMessage, secondMessage);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      const roleDifference =
        messageRoleRank(firstMessage) - messageRoleRank(secondMessage);

      if (roleDifference !== 0) {
        return roleDifference;
      }

      const sourceDifference = firstEntry.sourceRank - secondEntry.sourceRank;

      if (sourceDifference !== 0) {
        return sourceDifference;
      }

      return firstEntry.sourceIndex - secondEntry.sourceIndex;
    })
    .map((entry) => entry.message);
}
