import type { AiDebugInfo, AiDebugMessage, GameMessage } from "@/lib/game-types";

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const deepSeekBaseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/+$/, "");
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";

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
};

export function assertDungeonMasterProviderConfigured() {
  if (!deepSeekApiKey) {
    throw new Error("DeepSeek is not configured. Set DEEPSEEK_API_KEY.");
  }

  try {
    new URL(deepSeekBaseUrl);
  } catch {
    throw new Error("DeepSeek is not configured with a valid DEEPSEEK_BASE_URL.");
  }
}

function mapHistoryMessage(message: GameMessage): DeepSeekMessage {
  return {
    role: message.role === "player" ? "user" : "assistant",
    content: message.content
  };
}

function requestContentChars(messages: DeepSeekMessage[]) {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

async function requestDeepSeek(messages: DeepSeekMessage[], attempt: number) {
  let response: Response;
  const requestBody = JSON.stringify({
    model: deepSeekModel,
    messages,
    temperature: 0.8,
    max_tokens: 4096,
    response_format: {
      type: "json_object"
    }
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
    responseFormat: "json_object"
  };

  try {
    response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: requestBody,
      signal: AbortSignal.timeout(175_000)
    });
  } catch (error) {
    timing.completedAt = new Date().toISOString();
    timing.totalMs = Date.now() - requestStarted;
    throw new Error(
      `DeepSeek could not be reached. ${
        error instanceof Error ? error.message : "Network request failed."
      }`
    );
  }

  const headersReceived = Date.now();
  timing.headersReceivedAt = new Date(headersReceived).toISOString();
  timing.headersMs = headersReceived - requestStarted;
  timing.status = response.status;
  timing.ok = response.ok;

  const responseText = await response.text().catch(() => "");
  const bodyReceived = Date.now();
  timing.bodyReceivedAt = new Date(bodyReceived).toISOString();
  timing.bodyReadMs = bodyReceived - headersReceived;
  timing.responseBytes = Buffer.byteLength(responseText, "utf8");

  const jsonParseStarted = Date.now();
  let data: DeepSeekChatResponse = {};
  try {
    data = JSON.parse(responseText) as DeepSeekChatResponse;
  } catch {
    data = {};
  }
  const completed = Date.now();
  timing.jsonParseMs = completed - jsonParseStarted;
  timing.completedAt = new Date(completed).toISOString();
  timing.totalMs = completed - requestStarted;

  if (!response.ok) {
    throw new Error(
      `DeepSeek turn failed with status ${response.status}. ${
        data.error?.message ?? ""
      }`.trim()
    );
  }

  return { data, timing };
}

function emptyReplyDiagnostic(data: DeepSeekChatResponse) {
  const firstChoice = data.choices?.[0];
  const message = firstChoice?.message;
  const messageKeys = message ? Object.keys(message).sort().join(",") : "none";

  return [
    `finish_reason=${firstChoice?.finish_reason ?? "unknown"}`,
    `model=${data.model ?? deepSeekModel}`,
    `choices=${data.choices?.length ?? 0}`,
    `message_keys=${messageKeys}`,
    `has_reasoning=${message?.reasoning_content ? "true" : "false"}`
  ].join("; ");
}

export async function askDungeonMasterProvider({
  message,
  instructions,
  history = []
}: DungeonMasterProviderInput): Promise<DungeonMasterProviderResponse> {
  assertDungeonMasterProviderConfigured();

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

  let requestMessages = messages;
  const timings: DeepSeekTiming[] = [];
  let { data, timing } = await requestDeepSeek(requestMessages, 1);
  timings.push(timing);
  let content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    requestMessages = [
      ...messages,
      {
        role: "user",
        content:
          "Your previous response was empty. Return exactly one valid JSON object matching the requested AI Taverns DM contract now."
      }
    ];
    ({ data, timing } = await requestDeepSeek(requestMessages, 2));
    timings.push(timing);
    content = data.choices?.[0]?.message?.content?.trim();
  }

  if (!content) {
    throw new Error(
      `DeepSeek returned an empty reply. ${emptyReplyDiagnostic(data)}`
    );
  }

  return {
    id: data.id,
    content,
    debug: {
      requestMessages,
      rawResponse: content,
      providerResponseId: data.id,
      model: data.model ?? deepSeekModel,
      providerTimings: timings
    }
  };
}
