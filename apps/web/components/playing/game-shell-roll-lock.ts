import type { DiceRollRequest, GameMessage } from "@/lib/game-types";

const clientRollExpression = /\b(\d{1,3}d(?:4|6|8|10|12|20))\b/i;

export function clientRollRequestFromLatestDmMessage(
  messages: GameMessage[]
): DiceRollRequest | null {
  const latestMessage = messages.at(-1);

  if (
    !latestMessage ||
    latestMessage.role !== "dm" ||
    latestMessage.kind === "ask_dm_answer" ||
    latestMessage.isSyntheticIntro
  ) {
    return null;
  }

  const dice = latestMessage.content.match(clientRollExpression)?.[1];

  if (!dice) {
    return null;
  }

  return {
    id: `client-roll-${latestMessage.id}`,
    dice: dice.toLowerCase(),
    label: `Roll ${dice.toLowerCase()}`
  };
}
