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

export type SessionState = {
  campaignTitle: string;
  location: string;
  partyLevel: number;
  messages: GameMessage[];
};
