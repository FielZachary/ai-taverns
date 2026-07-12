import type { GameMessage } from "@/lib/game-types";

export type StreamingDmMessage = GameMessage & {
  turnId: string;
};

function streamingMessageId(turnId: string) {
  return `dm-stream-${turnId}`;
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

export function mergeVisibleGameMessages({
  localMessages,
  roomMessages,
  streamingDmMessages
}: {
  localMessages: GameMessage[];
  roomMessages: GameMessage[];
  streamingDmMessages: StreamingDmMessage[];
}) {
  const mergedMessages = new Map<string, GameMessage>();
  const roomMessageIds = new Set(
    roomMessages.map((roomMessage) => roomMessage.id)
  );

  localMessages.forEach((message) => {
    mergedMessages.set(message.id, message);
  });
  roomMessages.forEach((message) => {
    mergedMessages.set(message.id, message);
  });
  streamingDmMessages.forEach((message) => {
    if (!roomMessageIds.has(message.id)) {
      mergedMessages.set(message.id, message);
    }
  });

  return Array.from(mergedMessages.values()).sort(
    (firstMessage, secondMessage) =>
      Date.parse(firstMessage.createdAt) - Date.parse(secondMessage.createdAt)
  );
}
