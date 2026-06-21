export type GameMessageRole = "player" | "dm" | "system";

export type GameMessage = {
  id: string;
  role: GameMessageRole;
  content: string;
  createdAt: string;
};

export type HermesTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type HermesTurnResponse = {
  message: GameMessage;
};
