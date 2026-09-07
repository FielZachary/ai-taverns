import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiModelId } from "@ai-dnd/contracts";
import type {
  AiDebugInfo,
  AiDebugMessage,
  DmJobName,
  GameMessage
} from "@ai-dnd/dm";

const defaultAiModel: AiModelId = "deepseek-v4-flash";
const supportedDeepSeekModels = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro"
]);
const defaultProviderTemperature = 0.8;
const combatProviderTemperature = 0.2;
let localEnvCache: Record<string, string> | undefined;

type ModelProviderConfig = {
  selectedModel: AiModelId;
  providerName: "DeepSeek" | "Qwen";
  apiKeyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
};

type DeepSeekMessage = AiDebugMessage;

type DeepSeekChatResponse = {
  id?: string;
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
};

type DeepSeekStreamChunk = {
  id?: string;
  model?: string;
  choices?: {
    delta?: {
      content?: string;
    };
  }[];
};

type DeepSeekTiming = NonNullable<AiDebugInfo["providerTimings"]>[number];

export type DungeonMasterProviderResponse = {
  id?: string;
  content: string;
  debug: AiDebugInfo;
};

export type DungeonMasterProviderInput = {
  message: string;
  instructions: string;
  history?: GameMessage[];
  currentPlayerAction?: string;
  dmJob?: DmJobName;
  model?: AiModelId;
  temperature?: number;
  signal?: AbortSignal;
  onPublicNarrationDelta?: (text: string) => void;
};

class DeepSeekEmptyReplyError extends Error {
  debug: AiDebugInfo;

  constructor(message: string, debug: AiDebugInfo) {
    super(message);
    this.name = "DeepSeekEmptyReplyError";
    this.debug = debug;
  }
}

/* c8 ignore start */
function parseLocalEnvFile(text: string) {
  const values: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    values[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

function loadLocalEnvCache() {
  if (localEnvCache) {
    return localEnvCache;
  }

  const cwd = process.cwd();
  const repoRootFromApiWorkspace = join(cwd, "..", "..");
  const envPaths = Array.from(
    new Set([
      join(repoRootFromApiWorkspace, ".env.local"),
      join(repoRootFromApiWorkspace, "apps", "web", ".env.local"),
      join(repoRootFromApiWorkspace, "apps", "api", ".env.local"),
      join(cwd, ".env.local"),
      join(cwd, "apps", "web", ".env.local"),
      join(cwd, "apps", "api", ".env.local"),
      join(cwd, "..", "web", ".env.local")
    ])
  );
  localEnvCache = {};

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    localEnvCache = {
      ...localEnvCache,
      ...parseLocalEnvFile(readFileSync(envPath, "utf8"))
    };
  }

  return localEnvCache;
}

function envValue(key: string) {
  return process.env[key] ?? loadLocalEnvCache()[key];
}
/* c8 ignore stop */

function providerModelForSettings(config: ModelProviderConfig) {
  const configuredModel = envValue(config.modelEnv);

  if (config.providerName !== "DeepSeek") {
    return configuredModel || config.defaultModel;
  }

  if (configuredModel === "deepseek-chat") {
    return "deepseek-v4-flash";
  }

  if (configuredModel && supportedDeepSeekModels.has(configuredModel)) {
    return configuredModel;
  }

  return config.defaultModel;
}

function providerConfigForModel(model: AiModelId = defaultAiModel): ModelProviderConfig {
  if (model === "qwen-3-5-plus") {
    return {
      selectedModel: model,
      providerName: "Qwen",
      apiKeyEnv: "QWEN_API_KEY",
      baseUrlEnv: "QWEN_BASE_URL",
      modelEnv: "QWEN_MODEL",
      defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      defaultModel: "qwen3.5-plus"
    };
  }

  return {
    selectedModel: "deepseek-v4-flash",
    providerName: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    modelEnv: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash"
  };
}

function resolvedProviderSettings(config: ModelProviderConfig) {
  return {
    ...config,
    apiKey: envValue(config.apiKeyEnv),
    baseUrl: (envValue(config.baseUrlEnv) || config.defaultBaseUrl).replace(
      /\/+$/,
      ""
    ),
    model: providerModelForSettings(config)
  };
}

const testOpeningNarration = [
  "The sealed road charter is why you came to the Ashford Tollhouse before dawn, carrying a promise that cannot wait until the bridge fog lifts.",
  "For three wet days you followed the old coach road through sheep fields and flooded ditches, hearing every roadside inn repeat the same warning: no one crosses Ashford Bridge after the bells go silent.",
  "Lanternlight gathers around the Ashford Tollhouse as rain ticks against the shutters, dripping from iron hooks, pooling under muddy boots, and silvering the charter on the common-room table.",
  "A worried courier stands beside the hearth with one hand on the latch, watching the fogbound bridge through the warped window while the tollkeeper argues with two soaked drovers near the door.",
  "The courier can show you the broken seal, the tollkeeper can be pressed for what he saw, or you can step outside and study the fogbound bridge yourself.",
  "What do you do?"
].join("\n\n");

function testProviderDebug(
  input: DungeonMasterProviderInput,
  content: string
): AiDebugInfo {
  return {
    requestMessages: [
      {
        role: "system",
        content: input.instructions
      },
      ...(input.history ?? []).map(mapHistoryMessage),
      {
        role: "user",
        content: input.message
      }
    ],
    rawResponse: content,
    model: "ai-taverns-test-provider",
    temperature: providerTemperatureForInput(input),
    providerTimings: [
      {
        attempt: 1,
        requestStartedAt: new Date(0).toISOString(),
        completedAt: new Date(0).toISOString(),
        totalMs: 0,
        requestBytes: 0,
        requestMessageCount: 0,
        requestContentChars: 0,
        responseFormat: "json_contract_prompt",
        status: 200,
        ok: true
      }
    ],
    providerResponseId: "test-provider-response"
  };
}

function testOpeningPlanContent() {
  return JSON.stringify({
    region: "Ashford Vale",
    starting_location: "Ashford Tollhouse",
    how_the_player_got_here:
      "The player accepted work escorting a sealed road charter through the valley.",
    concept:
      "A routine escort becomes a road mystery when the bridge watch goes silent and several people want the charter before the player can deliver it. Following the charter's trail reveals that its destination, its broken seal, and the player's hiring were arranged to hide what lies beneath the road. The player eventually decides whether to expose the discovery, deliver it to the people who buried it, or use it to protect the communities along the route.",
    opening_scene:
      "Inside the Ashford Tollhouse, a frightened courier asks the player to cross the fogbound bridge before nightfall.",
    private_truth:
      "The bridge watch found evidence beneath the road, and the charter identifies who is trying to conceal it; learning this reveals that the player was hired as a disposable courier and gives them leverage over the people behind the cover-up.",
    campaign_anchors: [
      {
        name: "Marra Vale",
        description:
          "A worried courier carrying the sealed road charter. She knows the bridge is dangerous, becomes the player's first connection to the mystery, and may later choose between protecting the charter's owners or helping expose them."
      },
      {
        name: "The Sealed Road Charter",
        description:
          "An official document whose broken seal makes it both an immediate clue and a reason several parties will pursue the player. Its contents and intended destination reframe the player as more than a hired guard."
      }
    ]
  });
}

function testDmContractContent() {
  return JSON.stringify({
    public_narration: testOpeningNarration,
    roll_requests: [],
    next_input_needed: "player_actions",
    input_targets: [],
    input_policy: "all_players",
    setting: {
      display_location: "Ashford Tollhouse",
      world_name: "Playwright Test Realm",
      starting_location: "Ashford Tollhouse"
    }
  });
}

function testAskDmAnswerContent() {
  return JSON.stringify({
    answer:
      "The sealed road charter looks official enough to matter at the tollhouse, but the broken seal means someone may already have read or tampered with it. Treat it as a clue, not proof."
  });
}

function shouldUseTestProvider() {
  return process.env.AI_TAVERNS_TEST_DM_PROVIDER === "true";
}

async function askTestDungeonMasterProvider(
  input: DungeonMasterProviderInput
): Promise<DungeonMasterProviderResponse> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI Taverns test DM provider is not available in production.");
  }

  const isPlannerCall = input.instructions.includes(
    "campaign-opening planner for AI Taverns"
  );
  const isAskDmCall = input.instructions.includes(
    "out-of-turn table question"
  );
  const isCombatCheatSheetCall = input.instructions.includes(
    "player-facing combat cheat sheet"
  );
  const content = isPlannerCall
    ? testOpeningPlanContent()
    : isAskDmCall
      ? testAskDmAnswerContent()
      : isCombatCheatSheetCall
        ? JSON.stringify({
            cheatSheetMarkdown:
              "## Cheat Sheet\n\n**Longsword** is your best melee weapon. It attacks at **+6 to hit** and deals **1d8 + 3 slashing** damage."
          })
      : testDmContractContent();

  if (!isPlannerCall && !isAskDmCall) {
    input.onPublicNarrationDelta?.(testOpeningNarration);
  }

  return {
    id: "test-provider-response",
    content,
    debug: testProviderDebug(input, content)
  };
}

export function assertDungeonMasterProviderConfigured(model: AiModelId = defaultAiModel) {
  if (shouldUseTestProvider()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AI Taverns test DM provider is not available in production.");
    }

    return;
  }

  const settings = resolvedProviderSettings(providerConfigForModel(model));

  if (!settings.apiKey) {
    throw new Error(
      `${settings.providerName} is not configured. Set ${settings.apiKeyEnv}.`
    );
  }

  try {
    new URL(settings.baseUrl);
  } catch {
    throw new Error(
      `${settings.providerName} is not configured with a valid ${settings.baseUrlEnv}.`
    );
  }
}

function mapHistoryMessage(message: GameMessage): DeepSeekMessage {
  if (message.kind === "ask_dm_question") {
    return {
      role: "user",
      content: [
        "Out-of-turn Ask DM table question.",
        "This is table guidance only, not a committed character action and not scene advancement.",
        message.content
      ].join("\n")
    };
  }

  if (message.role === "dm") {
    const publicNarration =
      message.kind === "ask_dm_answer"
        ? [
            "Prior Ask DM answer in first-person DM table voice.",
            "This was clarification only; it was not in-fiction narration, a committed action, or scene advancement.",
            message.content
          ].join("\n")
        : message.content;

    return {
      role: "assistant",
      content: JSON.stringify({
        public_narration: publicNarration,
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players"
      })
    };
  }

  return {
    role: "user",
    content: message.content
  };
}

function requestContentChars(messages: DeepSeekMessage[]) {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function providerTemperatureForInput(input: DungeonMasterProviderInput) {
  if (typeof input.temperature === "number") {
    return input.temperature;
  }

  if (input.dmJob === "combat") {
    return combatProviderTemperature;
  }

  return defaultProviderTemperature;
}

function decodeJsonStringPrefix(value: string) {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char !== "\\") {
      decoded += char;
      continue;
    }

    const escaped = value[index + 1];

    if (!escaped) {
      break;
    }

    if (escaped === "n") {
      decoded += "\n";
    } else if (escaped === "r") {
      decoded += "\r";
    } else if (escaped === "t") {
      decoded += "\t";
    } else if (escaped === "b") {
      decoded += "\b";
    } else if (escaped === "f") {
      decoded += "\f";
    } else if (escaped === "u") {
      const hex = value.slice(index + 2, index + 6);

      if (!/^[0-9a-f]{4}$/i.test(hex)) {
        break;
      }

      decoded += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    } else {
      decoded += escaped;
    }

    index += 1;
  }

  return decoded;
}

function streamedDisplayTextPrefix(buffer: string) {
  const match = buffer.match(/"(?:public_narration|answer)"\s*:\s*"/);

  if (!match || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length;
  let value = "";

  for (let index = start; index < buffer.length; index += 1) {
    const char = buffer[index];

    if (char === "\\") {
      value += char;

      if (index + 1 < buffer.length) {
        value += buffer[index + 1];
        index += 1;
      }

      continue;
    }

    if (char === "\"") {
      break;
    }

    value += char;
  }

  return decodeJsonStringPrefix(value);
}

function createPublicNarrationEmitter(
  onPublicNarrationDelta: ((text: string) => void) | undefined
) {
  let streamedContent = "";
  let emittedNarration = "";

  return (contentDelta: string) => {
    streamedContent += contentDelta;

    if (!onPublicNarrationDelta) {
      return;
    }

    const narration = streamedDisplayTextPrefix(streamedContent);

    if (narration.length <= emittedNarration.length) {
      return;
    }

    onPublicNarrationDelta(narration.slice(emittedNarration.length));
    emittedNarration = narration;
  };
}

async function requestDeepSeek(
  messages: DeepSeekMessage[],
  temperature: number,
  attempt: number,
  settings: ReturnType<typeof resolvedProviderSettings>,
  onPublicNarrationDelta?: (text: string) => void,
  signal?: AbortSignal
) {
  let response: Response;
  const requestBody = JSON.stringify({
    model: settings.model,
    messages,
    ...(settings.providerName === "DeepSeek"
      ? { thinking: { type: "disabled" } }
      : {}),
    ...(settings.providerName === "Qwen" ? { enable_thinking: false } : {}),
    temperature,
    max_completion_tokens: 4096,
    ...(onPublicNarrationDelta
      ? { stream: true }
      : { response_format: { type: "json_object" } })
  });
  const requestStarted = Date.now();
  const timing: DeepSeekTiming = {
    attempt,
    requestStartedAt: new Date(requestStarted).toISOString(),
    completedAt: new Date(requestStarted).toISOString(),
    totalMs: 0,
    requestBytes: Buffer.byteLength(requestBody, "utf8"),
    requestMessageCount: messages.length,
    requestContentChars: requestContentChars(messages),
    responseFormat: "json_contract_prompt"
  };

  if (!settings.apiKey) {
    throw new Error(
      `${settings.providerName} is not configured. Set ${settings.apiKeyEnv}.`
    );
  }

  try {
    new URL(settings.baseUrl);
  } catch {
    throw new Error(
      `${settings.providerName} is not configured with a valid ${settings.baseUrlEnv}.`
    );
  }

  try {
    const timeoutSignal = AbortSignal.timeout(175_000);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: requestBody,
      signal: requestSignal
    });
  } catch (error) {
    timing.completedAt = new Date().toISOString();
    timing.totalMs = Date.now() - requestStarted;
    throw new Error(
      `${settings.providerName} could not be reached. ${
        error instanceof Error ? error.message : "Network request failed."
      }`
    );
  }

  const headersReceived = Date.now();
  timing.headersReceivedAt = new Date(headersReceived).toISOString();
  timing.headersMs = headersReceived - requestStarted;
  timing.status = response.status;
  timing.ok = response.ok;

  let responseText = "";
  let data: DeepSeekChatResponse = {};

  if (onPublicNarrationDelta && response.ok) {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error(`${settings.providerName} streaming response was empty.`);
    }

    const decoder = new TextDecoder();
    const emitContentDelta = createPublicNarrationEmitter(onPublicNarrationDelta);
    let eventBuffer = "";
    let responseId: string | undefined;
    let responseModel: string | undefined;

    const readEventData = (eventText: string) => {
      const dataLines = eventText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim());

      for (const dataLine of dataLines) {
        if (!dataLine || dataLine === "[DONE]") {
          continue;
        }

        let chunk: DeepSeekStreamChunk;

        try {
          chunk = JSON.parse(dataLine) as DeepSeekStreamChunk;
        } catch {
          continue;
        }

        responseId = responseId ?? chunk.id;
        responseModel = responseModel ?? chunk.model;

        const contentDelta = chunk.choices?.[0]?.delta?.content;

        if (contentDelta) {
          responseText += contentDelta;
          emitContentDelta(contentDelta);
        }
      }
    };

    const drainEventBuffer = () => {
      while (eventBuffer.includes("\n\n")) {
        const boundary = eventBuffer.indexOf("\n\n");
        const eventText = eventBuffer.slice(0, boundary);
        eventBuffer = eventBuffer.slice(boundary + 2);
        readEventData(eventText);
      }
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      eventBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      drainEventBuffer();
    }

    const remainingText = decoder.decode();

    if (remainingText) {
      eventBuffer += remainingText.replace(/\r\n/g, "\n");
      drainEventBuffer();
    }

    if (eventBuffer.trim()) {
      readEventData(eventBuffer);
    }

    data = {
      ...(responseId ? { id: responseId } : {}),
      model: responseModel ?? settings.model,
      choices: [
        {
          message: {
            content: responseText
          }
        }
      ]
    };
  } else {
    responseText = await response.text().catch(() => "");
  }
  const bodyReceived = Date.now();
  timing.bodyReceivedAt = new Date(bodyReceived).toISOString();
  timing.bodyReadMs = bodyReceived - headersReceived;
  timing.responseBytes = Buffer.byteLength(responseText, "utf8");

  const jsonParseStarted = Date.now();
  if (!onPublicNarrationDelta || !response.ok) {
    try {
      data = JSON.parse(responseText) as DeepSeekChatResponse;
    } catch {
      data = {};
    }
  }
  const completed = Date.now();
  timing.jsonParseMs = completed - jsonParseStarted;
  timing.completedAt = new Date(completed).toISOString();
  timing.totalMs = completed - requestStarted;

  if (!response.ok) {
    throw new Error(
      `${settings.providerName} turn failed with status ${response.status}. ${
        data.error?.message ?? ""
      }`.trim()
    );
  }

  return { data, timing };
}

function emptyReplyDiagnostic(
  data: DeepSeekChatResponse,
  settings: ReturnType<typeof resolvedProviderSettings>
) {
  const firstChoice = data.choices?.[0];
  const message = firstChoice?.message;
  const messageKeys = message ? Object.keys(message).sort().join(",") : "none";

  return [
    `finish_reason=${firstChoice?.finish_reason ?? "unknown"}`,
    `model=${data.model ?? settings.model}`,
    `choices=${data.choices?.length ?? 0}`,
    `message_keys=${messageKeys}`,
    `has_reasoning=${message?.reasoning_content ? "true" : "false"}`
  ].join("; ");
}

function fullEmptyReplyRetryMessages(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  return [
    ...messages,
    {
      role: "user",
      content:
        "Your previous response was empty. Return exactly one valid JSON object matching the requested AI Taverns DM contract now."
    }
  ];
}

export async function askDungeonMasterProvider({
  message,
  instructions,
  history = [],
  currentPlayerAction,
  dmJob,
  model,
  temperature: temperatureOverride,
  signal,
  onPublicNarrationDelta
}: DungeonMasterProviderInput): Promise<DungeonMasterProviderResponse> {
  if (shouldUseTestProvider()) {
    return askTestDungeonMasterProvider({
      message,
      instructions,
      history,
      ...(currentPlayerAction ? { currentPlayerAction } : {}),
      ...(dmJob ? { dmJob } : {}),
      ...(model ? { model } : {}),
      ...(typeof temperatureOverride === "number"
        ? { temperature: temperatureOverride }
        : {}),
      ...(onPublicNarrationDelta ? { onPublicNarrationDelta } : {})
    });
  }

  assertDungeonMasterProviderConfigured(model);
  const settings = resolvedProviderSettings(providerConfigForModel(model));

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: instructions
    },
    ...history
      .filter((historyMessage) => historyMessage.content.trim())
      .map(mapHistoryMessage),
    {
      role: "user",
      content: message
    }
  ];
  const temperature = providerTemperatureForInput({
    message,
    instructions,
    history,
    ...(currentPlayerAction ? { currentPlayerAction } : {}),
    ...(dmJob ? { dmJob } : {}),
    ...(typeof temperatureOverride === "number"
      ? { temperature: temperatureOverride }
      : {})
  });

  let requestMessages = messages;
  const timings: DeepSeekTiming[] = [];
  let fallbackBufferedAfterEmptyStream = false;
  let { data, timing } = await requestDeepSeek(
    requestMessages,
    temperature,
    1,
    settings,
    onPublicNarrationDelta,
    signal
  );
  timings.push(timing);
  let content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    requestMessages = fullEmptyReplyRetryMessages(messages);
    ({ data, timing } = await requestDeepSeek(
      requestMessages,
      temperature,
      2,
      settings,
      undefined,
      signal
    ));
    fallbackBufferedAfterEmptyStream = Boolean(onPublicNarrationDelta);
    timings.push(timing);
    content = data.choices?.[0]?.message?.content?.trim();
  }

  if (!content) {
    throw new DeepSeekEmptyReplyError(
      `${settings.providerName} returned an empty reply. ${emptyReplyDiagnostic(
        data,
        settings
      )}`,
      {
        requestMessages,
        rawResponse: data.choices?.[0]?.message?.content ?? "",
        model: data.model ?? settings.model,
        temperature,
        providerTimings: timings,
        ...(data.id ? { providerResponseId: data.id } : {})
      }
    );
  }

  if (fallbackBufferedAfterEmptyStream && onPublicNarrationDelta) {
    const narration = streamedDisplayTextPrefix(content);

    if (narration) {
      onPublicNarrationDelta(narration);
    }
  }

  return {
    content,
    ...(data.id ? { id: data.id } : {}),
    debug: {
      requestMessages,
      rawResponse: content,
      model: data.model ?? settings.model,
      temperature,
      providerTimings: timings,
      ...(data.id ? { providerResponseId: data.id } : {})
    }
  };
}
