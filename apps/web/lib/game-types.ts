export type GameMessageRole = "player" | "dm" | "system";
export type GameMessageKind = "turn" | "ask_dm_question" | "ask_dm_answer";

export type AiDebugMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiDebugInfo = {
  requestMessages: AiDebugMessage[];
  rawResponse: string;
  providerResponseId?: string;
  model?: string;
  providerTimings?: {
    attempt: number;
    requestStartedAt: string;
    headersReceivedAt?: string;
    bodyReceivedAt?: string;
    completedAt: string;
    totalMs: number;
    headersMs?: number;
    bodyReadMs?: number;
    jsonParseMs?: number;
    status?: number;
    ok?: boolean;
    requestBytes: number;
    responseBytes?: number;
    requestMessageCount: number;
    requestContentChars: number;
    responseFormat: "json_object";
  }[];
};

export type GameMessage = {
  id: string;
  role: GameMessageRole;
  kind?: GameMessageKind;
  content: string;
  createdAt: string;
  debug?: AiDebugInfo;
};

export type DiceRollRequest = {
  id: string;
  dice: string;
  label: string;
  player?: string;
  modifier?: number;
  advantageState?: string;
};

export type InputPolicy = "all_players" | "only_targeted_players";

export type DiceRollResult = {
  rolls: number[];
  total: number;
};

export type DiceRollSubmission = {
  rollRequestId: string;
  rollResult: DiceRollResult;
  clientMessageId?: string;
};

export type HermesTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type HermesTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
  pendingRollRequests?: DiceRollRequest[];
  inputTargets?: string[];
  inputPolicy?: InputPolicy;
};
