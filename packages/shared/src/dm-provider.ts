import type { DiceRollRequest, GameMessage } from "./game";

export type NextInputNeeded =
  | "player_actions"
  | "dice_results"
  | "clarification";

export type DmProviderTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type DmProviderTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
  nextInputNeeded?: NextInputNeeded;
};
