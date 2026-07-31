export type GameMessageRole = "player" | "dm" | "system";
export type GameMessageKind = "turn" | "ask_dm_question" | "ask_dm_answer";

export type AiDebugMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiDebugProviderTiming = {
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
  responseFormat: "json_contract_prompt";
};

export type AiDebugInfo = {
  requestMessages: AiDebugMessage[];
  rawResponse: string;
  providerResponseId?: string;
  model?: string;
  temperature?: number;
  combatState?: unknown;
  combatAdjudication?: unknown;
  inventoryState?: {
    proposedPatches?: unknown[];
    acceptedPatches?: unknown[];
    appliedPatches?: unknown[];
    discardedPatches?: unknown[];
  };
  contextStorageState?: unknown;
  livingWorldPressureEngine?: {
    traceId?: string;
    coveredMessageCount?: number;
    failed?: boolean;
    error?: unknown;
    requestMessages?: AiDebugMessage[];
    rawResponse?: string;
    parsedOutput?: unknown;
    proposedPatches?: unknown[];
    acceptedPatches?: unknown[];
    discardedPatches?: unknown[];
    durationMs?: number;
    model?: string;
    temperature?: number;
    providerResponseId?: string;
    providerTimings?: AiDebugProviderTiming[];
  };
  eldermereOpeningPlanner?: {
    requestMessages: AiDebugMessage[];
    rawResponse: string;
    parsedOutput?: unknown;
    model?: string;
    temperature?: number;
    providerResponseId?: string;
    providerTimings?: AiDebugProviderTiming[];
  };
  router?: {
    requestMessages: AiDebugMessage[];
    rawResponse: string;
    parsedOutput?: unknown;
    model?: string;
    temperature?: number;
    providerResponseId?: string;
  };
  askDmContextSelector?: {
    requestMessages: AiDebugMessage[];
    rawResponse: string;
    parsedOutput?: unknown;
    model?: string;
    temperature?: number;
    providerResponseId?: string;
    providerTimings?: AiDebugProviderTiming[];
  };
  providerTimings?: AiDebugProviderTiming[];
};

export type GameMessage = {
  id: string;
  role: GameMessageRole;
  kind?: GameMessageKind;
  playerName?: string;
  characterName?: string;
  setting?: {
    displayLocation?: string;
    worldName?: string;
    regionName?: string;
    settlementName?: string;
    sceneLocation?: string;
    startingLocation?: string;
  };
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
  reason?: string;
  targetDc?: number;
  advantageState?: "normal" | "advantage" | "disadvantage";
};

export type InputPolicy = "all_players" | "only_targeted_players";
export type NextInputNeeded =
  | "player_actions"
  | "dice_results"
  | "clarification";

export type DiceRollResult = {
  rolls: number[];
  total: number;
};

export type DiceRollSubmission = {
  rollRequestId: string;
  rollResult: DiceRollResult;
  clientMessageId?: string;
};

export type DmProviderTurnRequest = {
  message: string;
  history: GameMessage[];
  sessionId?: string;
};

export type DmProviderTurnResponse = {
  message: GameMessage;
  pendingRollRequest?: DiceRollRequest | null;
  pendingRollRequests?: DiceRollRequest[];
  nextInputNeeded?: NextInputNeeded;
  inputTargets?: string[];
  inputPolicy?: InputPolicy;
};
