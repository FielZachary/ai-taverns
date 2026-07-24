import type { DiceRollRequest, GameMessage } from "./game";

export type DmProviderTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type DmProviderTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
};
