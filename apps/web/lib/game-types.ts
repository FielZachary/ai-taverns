export type GameMessageRole = "player" | "dm" | "system";

export type GameMessage = {
  id: string;
  role: GameMessageRole;
  content: string;
  createdAt: string;
};

export type DiceRollRequest = {
  id: string;
  dice: string;
  label: string;
  player?: string;
  modifier?: number;
  advantageState?: string;
};

export type HermesTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type HermesTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
};
