import type {
  AiDebugInfo,
  AiDebugMessage,
  GameMessage
} from "@ai-dnd/dm";

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
  onPublicNarrationDelta?: (text: string) => void;
};

const testOpeningNarration = [
  "Lanternlight gathers around the Ashford Tollhouse as rain ticks against the shutters.",
  "A sealed road charter waits on the table while a worried courier points toward the fogbound bridge.",
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
    providerTimings: [
      {
        attempt: 1,
        requestStartedAt: new Date(0).toISOString(),
        completedAt: new Date(0).toISOString(),
        totalMs: 0,
        requestBytes: 0,
        requestMessageCount: 0,
        requestContentChars: 0,
        responseFormat: "json_object",
        status: 200,
        ok: true
      }
    ],
    providerResponseId: "test-provider-response"
  };
}

function testOpeningPlanContent() {
  return JSON.stringify({
    campaign_title: "Lanterns at Ashford Tollhouse",
    region: {
      name: "Ashford Vale",
      why_this_region: "It gives the party a grounded road mystery.",
      plain_description: "A rain-washed valley crossed by old trade roads."
    },
    starting_location: {
      name: "Ashford Tollhouse",
      type: "roadside tollhouse",
      why_this_location: "It puts the party at the first obstacle immediately.",
      plain_description: "A stone tollhouse beside a fogbound bridge."
    },
    opening_premise: {
      why_the_party_is_here: "They were hired to escort a sealed road charter.",
      immediate_objective: "Find out why the bridge watch has gone silent.",
      immediate_complication: "The courier is frightened and the bridge is hidden by fog.",
      first_scene_location: "Inside the Ashford Tollhouse common room.",
      opening_mood: "rainy, watchful, and urgent",
      campaign_promise: "A road mystery with practical choices and hidden danger."
    },
    player_facing_facts: [
      "The courier needs help before nightfall.",
      "The fogbound bridge blocks the road ahead."
    ],
    allowed_player_facing_terms: [
      {
        term: "Ashford Tollhouse",
        plain_meaning: "a stone roadside checkpoint"
      }
    ],
    npc_seed: [
      {
        name: "Marra Vale",
        role: "worried courier",
        wants: "safe passage across the bridge",
        visible_behavior: "keeps checking the rain-dark windows"
      }
    ],
    first_interactable_choices: [
      "Question Marra about the silent bridge watch.",
      "Inspect the sealed road charter.",
      "Step outside and study the fogbound bridge."
    ],
    sensory_palette: {
      sights: ["lanternlight on wet stone"],
      sounds: ["rain tapping shutters"],
      smells: ["damp wool and woodsmoke"],
      textures_or_weather: ["cold rain in the doorway"]
    },
    dm_private_context: [
      "The bridge watch discovered something under the road."
    ],
    forbidden_opening_terms: ["Second Dominion"],
    narrator_instructions: [
      "Open inside the tollhouse and end by asking what the players do."
    ],
    opening_quality_checks: [
      "No forbidden terms appear.",
      "The opener gives the party at least two clear options."
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
  const content = isPlannerCall ? testOpeningPlanContent() : testDmContractContent();

  if (!isPlannerCall) {
    input.onPublicNarrationDelta?.(testOpeningNarration);
  }

  return {
    id: "test-provider-response",
    content,
    debug: testProviderDebug(input, content)
  };
}

export function assertDungeonMasterProviderConfigured() {
  if (shouldUseTestProvider()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AI Taverns test DM provider is not available in production.");
    }

    return;
  }

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

function publicNarrationPrefix(buffer: string) {
  const match = buffer.match(/"public_narration"\s*:\s*"/);

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

    const narration = publicNarrationPrefix(streamedContent);

    if (narration.length <= emittedNarration.length) {
      return;
    }

    onPublicNarrationDelta(narration.slice(emittedNarration.length));
    emittedNarration = narration;
  };
}

async function requestDeepSeek(
  messages: DeepSeekMessage[],
  attempt: number,
  onPublicNarrationDelta?: (text: string) => void
) {
  let response: Response;
  const requestBody = JSON.stringify({
    model: deepSeekModel,
    messages,
    temperature: 0.8,
    max_tokens: 4096,
    ...(onPublicNarrationDelta ? { stream: true } : {}),
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

  let responseText = "";
  let data: DeepSeekChatResponse = {};

  if (onPublicNarrationDelta && response.ok) {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("DeepSeek streaming response was empty.");
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
      model: responseModel ?? deepSeekModel,
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
  history = [],
  onPublicNarrationDelta
}: DungeonMasterProviderInput): Promise<DungeonMasterProviderResponse> {
  if (shouldUseTestProvider()) {
    return askTestDungeonMasterProvider({
      message,
      instructions,
      history,
      ...(onPublicNarrationDelta ? { onPublicNarrationDelta } : {})
    });
  }

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
  let { data, timing } = await requestDeepSeek(
    requestMessages,
    1,
    onPublicNarrationDelta
  );
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
    ({ data, timing } = await requestDeepSeek(
      requestMessages,
      2,
      onPublicNarrationDelta
    ));
    timings.push(timing);
    content = data.choices?.[0]?.message?.content?.trim();
  }

  if (!content) {
    throw new Error(
      `DeepSeek returned an empty reply. ${emptyReplyDiagnostic(data)}`
    );
  }

  return {
    content,
    ...(data.id ? { id: data.id } : {}),
    debug: {
      requestMessages,
      rawResponse: content,
      model: data.model ?? deepSeekModel,
      providerTimings: timings,
      ...(data.id ? { providerResponseId: data.id } : {})
    }
  };
}
