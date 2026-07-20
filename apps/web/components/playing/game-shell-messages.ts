import type { GameMessage } from "@/lib/game-types";

export type StreamingDmMessage = GameMessage & {
  turnId: string;
};

type OrderedGameMessage = {
  message: GameMessage;
  sourceRank: number;
  sourceIndex: number;
};

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
