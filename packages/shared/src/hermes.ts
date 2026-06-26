import type { DiceRollRequest, GameMessage } from "./game";

export type HermesTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type HermesTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
};
