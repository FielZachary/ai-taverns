import type { GameMessage } from "@/lib/game-types";

export type StreamingDmMessage = GameMessage & {
  turnId: string;
};

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
