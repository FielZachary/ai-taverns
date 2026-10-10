import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
process.env.QWEN_API_KEY = "test-qwen-key";
process.env.QWEN_BASE_URL = "https://qwen.example.test/v1";

const { askDungeonMasterProvider, assertDungeonMasterProviderConfigured } =
  await import("./dm-provider.js");

const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalTestProvider = process.env.AI_TAVERNS_TEST_DM_PROVIDER;
const originalDeepSeekModel = process.env.DEEPSEEK_MODEL;
const originalQwenApiKey = process.env.QWEN_API_KEY;
const originalQwenBaseUrl = process.env.QWEN_BASE_URL;
const originalQwenModel = process.env.QWEN_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalTestProvider === undefined) {
    delete process.env.AI_TAVERNS_TEST_DM_PROVIDER;
  } else {
    process.env.AI_TAVERNS_TEST_DM_PROVIDER = originalTestProvider;
  }
  if (originalDeepSeekModel === undefined) {
    delete process.env.DEEPSEEK_MODEL;
  } else {
    process.env.DEEPSEEK_MODEL = originalDeepSeekModel;
  }
  if (originalQwenApiKey === undefined) {
    delete process.env.QWEN_API_KEY;
  } else {
    process.env.QWEN_API_KEY = originalQwenApiKey;
  }
  if (originalQwenBaseUrl === undefined) {
    delete process.env.QWEN_BASE_URL;
  } else {
    process.env.QWEN_BASE_URL = originalQwenBaseUrl;
  }
  if (originalQwenModel === undefined) {
    delete process.env.QWEN_MODEL;
  } else {
    process.env.QWEN_MODEL = originalQwenModel;
  }
});

before(() => {
  assert.ok(process.env.DEEPSEEK_API_KEY);
  assert.ok(process.env.QWEN_API_KEY);
});

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      status: 200
    }
  );
}

function streamData(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

test("DeepSeek provider sends filtered history and returns non-stream debug metadata", async () => {
  let requestBody: {
    messages: { role: string; content: string }[];
    temperature?: number;
    stream?: boolean;
    response_format?: unknown;
    thinking?: { type?: string };
  } | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "chat-1",
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"A door opens.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "What happens next?",
    history: [
      {
        id: "message-1",
        role: "dm",
        kind: "turn",
        content: "The room is quiet.",
        createdAt: "2026-07-11T00:00:00.000Z"
      },
      {
        id: "message-2",
        role: "player",
        content: "   ",
        createdAt: "2026-07-11T00:00:01.000Z"
      },
      {
        id: "message-3",
        role: "player",
        content: "I listen at the door.",
        createdAt: "2026-07-11T00:00:02.000Z"
      },
      {
        id: "message-4",
        role: "player",
        kind: "ask_dm_question",
        content: "Is this a clue?",
        createdAt: "2026-07-11T00:00:03.000Z"
      },
      {
        id: "message-5",
        role: "dm",
        kind: "ask_dm_answer",
        content: "It is table guidance, not a resolved action.",
        createdAt: "2026-07-11T00:00:04.000Z"
      }
    ]
  });

  assert.deepEqual(requestBody?.messages, [
    {
      role: "system",
      content: "Return a JSON DM response."
    },
    {
      role: "assistant",
      content: JSON.stringify({
        public_narration: "The room is quiet.",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players"
      })
    },
    {
      role: "user",
      content: "I listen at the door."
    },
    {
      role: "user",
      content: [
        "Out-of-turn Ask DM table question.",
        "This is table guidance only, not a committed character action and not scene advancement.",
        "Is this a clue?"
      ].join("\n")
    },
    {
      role: "assistant",
      content: JSON.stringify({
        public_narration: [
          "Prior Ask DM answer in first-person DM table voice.",
          "This was clarification only; it was not in-fiction narration, a committed action, or scene advancement.",
          "It is table guidance, not a resolved action."
        ].join("\n"),
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players"
      })
    },
    {
      role: "user",
      content: "What happens next?"
    }
  ]);
  assert.equal(requestBody?.stream, undefined);
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
  assert.deepEqual(requestBody?.thinking, { type: "disabled" });
  assert.equal(requestBody?.temperature, 0.8);
  assert.equal(response.id, "chat-1");
  assert.equal(response.debug.providerResponseId, "chat-1");
  assert.equal(response.debug.model, "test-chat-model");
  assert.equal(response.debug.temperature, requestBody?.temperature);
  assert.equal(response.debug.providerTimings?.[0]?.status, 200);
  assert.equal(response.debug.providerTimings?.[0]?.ok, true);
  assert.equal(
    response.debug.providerTimings?.[0]?.responseFormat,
    "json_contract_prompt"
  );
});

test("DeepSeek provider omits JSON mode for plain-text requests", async () => {
  let requestBody: { response_format?: unknown; stream?: boolean } | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "text-1",
      model: "test-chat-model",
      choices: [{ message: { content: "A plain-text campaign opener." } }]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return only plain prose.",
    message: "Write the opener.",
    responseFormat: "text"
  });

  assert.equal(requestBody?.response_format, undefined);
  assert.equal(requestBody?.stream, undefined);
  assert.equal(response.content, "A plain-text campaign opener.");
  assert.equal(
    response.debug.providerTimings?.[0]?.responseFormat,
    "text_prompt"
  );
});

test("provider routes Qwen model selections to Qwen credentials", async () => {
  process.env.QWEN_MODEL = "custom-qwen-flash";
  let requestUrl = "";
  let authorization = "";
  let requestBody: {
    enable_thinking?: boolean;
    max_completion_tokens?: number;
    model?: string;
    messages: { role: string; content: string }[];
    response_format?: { type?: string };
  } | undefined;

  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    authorization = String(new Headers(init?.headers).get("Authorization"));
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "qwen-chat-1",
      model: "custom-qwen-flash",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"A lantern flares.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin.",
    model: "qwen-3-5-plus"
  });

  assert.equal(requestUrl, "https://qwen.example.test/v1/chat/completions");
  assert.equal(authorization, "Bearer test-qwen-key");
  assert.equal(requestBody?.model, "custom-qwen-flash");
  assert.equal(requestBody?.enable_thinking, false);
  assert.equal(requestBody?.max_completion_tokens, 4096);
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
  assert.equal(response.id, "qwen-chat-1");
  assert.equal(response.debug.model, "custom-qwen-flash");
});

test("provider defaults Qwen chat requests to the QwenCloud compatible endpoint", async () => {
  delete process.env.QWEN_BASE_URL;
  process.env.QWEN_MODEL = "qwen3.5-plus";
  let requestUrl = "";

  globalThis.fetch = async (url) => {
    requestUrl = String(url);

    return jsonResponse({
      id: "qwen-default-chat-1",
      model: "qwen3.5-plus",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"A lantern flares.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin.",
    model: "qwen-3-5-plus"
  });

  assert.equal(
    requestUrl,
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
  );
});

test("DeepSeek provider ignores combat language without routed DM job", async () => {
  const temperatures: Array<number | undefined> = [];

  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      temperature?: number;
    };
    temperatures.push(requestBody.temperature);

    return jsonResponse({
      id: `unrouted-combat-language-chat-${temperatures.length}`,
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"The danger sharpens.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  for (const currentPlayerAction of [
    "I cast magic missile.",
    "I stab the nearest cultist.",
    "I swing my axe.",
    "I shoot the lookout.",
    "I raise my crossbow.",
    "I draw my longsword."
  ]) {
    const response = await askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message:
        "Character Sheet: Armor Class 13, HP 27, Weapons: dagger.\n\nCurrent player action: " +
        currentPlayerAction,
      currentPlayerAction
    });

    assert.equal(response.debug.temperature, 0.8);
  }

  assert.deepEqual(temperatures, [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
});

test("DeepSeek provider uses routed DM job for temperature", async () => {
  const temperatures: Array<number | undefined> = [];

  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      temperature?: number;
    };
    temperatures.push(requestBody.temperature);

    return jsonResponse({
      id: `job-temperature-chat-${temperatures.length}`,
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"The scene moves.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const calls = [
    {
      dmJob: "combat" as const,
      message: "I inspect the quiet mural.",
      expectedTemperature: 0.2
    },
    {
      dmJob: "scene_director" as const,
      message: "The old mural depicts a battle and a shattered sword.",
      expectedTemperature: 0.8
    },
    {
      dmJob: "scene_director" as const,
      message: "I study the blood pattern near the spear rack.",
      expectedTemperature: 0.8
    },
    {
      dmJob: "npc_dialogue" as const,
      message: "I ask the veteran how the fight started.",
      expectedTemperature: 0.8
    }
  ];

  for (const call of calls) {
    const response = await askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: call.message,
      dmJob: call.dmJob
    });

    assert.equal(response.debug.temperature, call.expectedTemperature);
  }

  assert.deepEqual(
    temperatures,
    calls.map((call) => call.expectedTemperature)
  );
});

test("DeepSeek provider does not lower temperature for system-only combat rules", async () => {
  let requestBody:
    | {
        temperature?: number;
      }
    | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "noncombat-chat-1",
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"The candle flickers.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions:
      "Return a JSON DM response. If combat starts, enforce initiative rules.",
    message: "I inspect the old desk."
  });

  assert.equal(requestBody?.temperature, 0.8);
  assert.equal(response.debug.temperature, 0.8);
});

test("DeepSeek provider defaults to high temperature without routed DM job", async () => {
  let requestBody:
    | {
        temperature?: number;
      }
    | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "context-chat-1",
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"There are two people beside you.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message:
      "Character Sheet: Armor Class 13, HP 27, Weapons: dagger.\n\nCurrent player action: how many people are with us?",
    currentPlayerAction: "how many people are with us?"
  });

  assert.equal(requestBody?.temperature, 0.8);
  assert.equal(response.debug.temperature, 0.8);
});

test("test DM provider returns deterministic local contract JSON", async () => {
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";
  delete process.env.NODE_ENV;
  globalThis.fetch = async () => {
    throw new Error("test provider should not call fetch");
  };

  const narrationDeltas: string[] = [];
  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin.",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });
  const parsed = JSON.parse(response.content) as {
    public_narration: string;
    next_input_needed: string;
    roll_requests: unknown[];
  };

  assert.equal(response.id, "test-provider-response");
  assert.equal(response.debug.model, "ai-taverns-test-provider");
  assert.match(parsed.public_narration, /Ashford Tollhouse/);
  assert.equal(parsed.next_input_needed, "player_actions");
  assert.deepEqual(parsed.roll_requests, []);
  assert.deepEqual(narrationDeltas, [parsed.public_narration]);
});

test("test DM provider returns deterministic campaign planner JSON without streaming narration", async () => {
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";
  delete process.env.NODE_ENV;
  globalThis.fetch = async () => {
    throw new Error("test provider should not call fetch");
  };

  const narrationDeltas: string[] = [];
  const response = await askDungeonMasterProvider({
    instructions: "You are a campaign-opening planner for AI Taverns.",
    message: "Plan the opening.",
    history: [
      {
        id: "message-1",
        role: "dm",
        content: "Previous table context.",
        createdAt: "2026-07-12T00:00:00.000Z"
      }
    ],
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });
  const parsed = JSON.parse(response.content) as {
    region: string;
    starting_location: string;
    concept: string;
    campaign_anchors: { name: string; description: string }[];
  };

  assert.equal(parsed.region, "Ashford Vale");
  assert.equal(parsed.starting_location, "Ashford Tollhouse");
  assert.match(parsed.concept, /road mystery/i);
  assert.ok(
    parsed.campaign_anchors.some(
      (anchor) => anchor.name === "Marra Vale" && /courier/i.test(anchor.description)
    )
  );
  assert.deepEqual(narrationDeltas, []);
  assert.deepEqual(response.debug.requestMessages, [
    {
      role: "system",
      content: "You are a campaign-opening planner for AI Taverns."
    },
    {
      role: "assistant",
      content: JSON.stringify({
        public_narration: "Previous table context.",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players"
      })
    },
    {
      role: "user",
      content: "Plan the opening."
    }
  ]);
  assert.equal(response.debug.rawResponse, response.content);
  assert.equal(
    response.debug.providerTimings?.[0]?.completedAt,
    new Date(0).toISOString()
  );
  assert.equal(response.debug.providerTimings?.[0]?.requestMessageCount, 0);
});

test("test DM provider returns deterministic Ask DM answer JSON without streaming narration", async () => {
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";
  delete process.env.NODE_ENV;
  globalThis.fetch = async () => {
    throw new Error("test provider should not call fetch");
  };

  const narrationDeltas: string[] = [];
  const response = await askDungeonMasterProvider({
    instructions:
      "You are the AI Taverns DnD Dungeon Master answering an out-of-turn table question.",
    message: "What can I tell about the charter?",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });
  const parsed = JSON.parse(response.content) as { answer: string };

  assert.match(parsed.answer, /sealed road charter/);
  assert.match(parsed.answer, /broken seal/);
  assert.deepEqual(narrationDeltas, []);
  assert.equal(response.debug.rawResponse, response.content);
});

test("test DM provider configuration passes outside production", () => {
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";
  delete process.env.NODE_ENV;

  assert.doesNotThrow(() => assertDungeonMasterProviderConfigured());
});

test("test DM provider is disabled in production", async () => {
  process.env.AI_TAVERNS_TEST_DM_PROVIDER = "true";
  process.env.NODE_ENV = "production";

  assert.throws(
    () => assertDungeonMasterProviderConfigured(),
    /test DM provider is not available in production/
  );

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin."
    }),
    /test DM provider is not available in production/
  );
});

test("DeepSeek provider maps fetch timeout failures to a stable reachability error", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    throw new Error("The operation was aborted.");
  };

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "What happens next?"
    }),
    /DeepSeek could not be reached\. The operation was aborted\./
  );
});

test("DeepSeek provider reports non-OK HTTP responses with provider error details", async () => {
  globalThis.fetch = async () =>
    jsonResponse(
      {
        error: {
          message: "rate limit exceeded"
        }
      },
      429
    );

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin."
    }),
    /DeepSeek turn failed with status 429\. rate limit exceeded/
  );
});

test("DeepSeek provider reports non-OK HTTP responses when the body is malformed", async () => {
  globalThis.fetch = async () => new Response("{not-json", { status: 502 });

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin."
    }),
    /DeepSeek turn failed with status 502\./
  );
});

test("DeepSeek provider maps non-Error fetch failures to a stable reachability error", async () => {
  globalThis.fetch = async () => {
    throw "socket closed";
  };

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin."
    }),
    /DeepSeek could not be reached\. Network request failed\./
  );
});

test("DeepSeek provider falls back to configured model when responses omit optional metadata", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content:
              '{"public_narration":"A quiet bell rings.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin."
  });

  assert.equal(response.id, undefined);
  assert.equal(response.debug.providerResponseId, undefined);
  assert.equal(response.debug.model, "deepseek-v4-flash");
});

test("DeepSeek provider maps the legacy chat model alias before sending requests", async () => {
  process.env.DEEPSEEK_MODEL = "deepseek-chat";
  let requestBody: { model?: string } | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      choices: [
        {
          message: {
            content:
              '{"public_narration":"A quiet bell rings.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin."
  });

  assert.equal(requestBody?.model, "deepseek-v4-flash");
  assert.equal(response.debug.model, "deepseek-v4-flash");
});

test("DeepSeek provider allows the supported pro model from configuration", async () => {
  process.env.DEEPSEEK_MODEL = "deepseek-v4-pro";
  let requestBody: { model?: string } | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      choices: [
        {
          message: {
            content:
              '{"public_narration":"A quiet bell rings.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin."
  });

  assert.equal(requestBody?.model, "deepseek-v4-pro");
  assert.equal(response.debug.model, "deepseek-v4-pro");
});

test("DeepSeek provider reports successful streaming responses without a body", async () => {
  globalThis.fetch = async () => new Response(null, { status: 200 });

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin.",
      onPublicNarrationDelta: () => undefined
    }),
    /DeepSeek streaming response was empty\./
  );
});

test("DeepSeek provider skips malformed stream chunks and keeps valid streamed content", async () => {
  const narrationDeltas: string[] = [];
  let requestCount = 0;
  let requestBody: { stream?: boolean; response_format?: unknown } | undefined;

  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return streamResponse([
      "data: {not-json}\n\n",
      streamData({
        id: "stream-1",
        model: "test-model",
        choices: [
          {
            delta: {
              content: '{"public_narration":"Hello'
            }
          }
        ]
      }),
      streamData({
        choices: [
          {
            delta: {
              content:
                ' world","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
            }
          }
        ]
      }),
      "data: [DONE]\n\n",
      "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}"
    ]);
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin.",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });

  assert.equal(requestCount, 1);
  assert.equal(requestBody?.stream, true);
  assert.equal(requestBody?.response_format, undefined);
  assert.equal(response.id, "stream-1");
  assert.equal(response.debug.model, "test-model");
  assert.equal(
    response.content,
    '{"public_narration":"Hello world","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
  );
  assert.deepEqual(narrationDeltas, ["Hello", " world"]);
});

test("DeepSeek provider streams escaped narration prefixes as chunks arrive", async () => {
  const narrationDeltas: string[] = [];

  globalThis.fetch = async () =>
    streamResponse([
      streamData({
        choices: [
          {
            delta: {
              content: '{"aside":"quiet",'
            }
          }
        ]
      }),
      streamData({
        choices: [
          {
            delta: {
              content: '"public_narration":"Line one\\nTab\\tBell\\u263a'
            }
          }
        ]
      }),
      streamData({
        choices: [
          {
            delta: {
              content:
                ' mark\\q","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
            }
          }
        ]
      })
    ]);

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Begin.",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });

  assert.equal(
    response.content,
    '{"aside":"quiet","public_narration":"Line one\\nTab\\tBell\\u263a mark\\q","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
  );
  assert.deepEqual(narrationDeltas, [
    "Line one\nTab\tBell☺",
    " markq"
  ]);
});

test("DeepSeek provider streams Ask DM answer prefixes as chunks arrive", async () => {
  const narrationDeltas: string[] = [];

  globalThis.fetch = async () =>
    streamResponse([
      streamData({
        id: "ask-stream-1",
        model: "test-model",
        choices: [
          {
            delta: {
              content: '{"answer":"Those tracks look too'
            }
          }
        ]
      }),
      streamData({
        id: "ask-stream-1",
        model: "test-model",
        choices: [
          {
            delta: {
              content: ' broad for a wolf."}'
            }
          }
        ]
      }),
      "data: [DONE]\n\n"
    ]);

  const response = await askDungeonMasterProvider({
    instructions: "Return an Ask DM JSON answer.",
    message: "Would I know these tracks?",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });

  assert.equal(
    response.content,
    '{"answer":"Those tracks look too broad for a wolf."}'
  );
  assert.deepEqual(narrationDeltas, [
    "Those tracks look too",
    " broad for a wolf."
  ]);
});

test("DeepSeek provider retries an empty stream and reports an empty reply diagnostic", async () => {
  let requestCount = 0;
  const streams: Array<boolean | undefined> = [];

  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    const requestBody = JSON.parse(String(init?.body)) as {
      stream?: boolean;
      response_format?: unknown;
    };
    streams.push(requestBody.stream);
    assert.deepEqual(
      requestBody.response_format,
      requestCount === 1 ? undefined : { type: "json_object" }
    );
    return streamResponse(["data: [DONE]\n\n"]);
  };

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin.",
      onPublicNarrationDelta: () => undefined
    }),
    /DeepSeek returned an empty reply\./
  );

  assert.equal(requestCount, 2);
  assert.deepEqual(streams, [true, undefined]);
});

test("DeepSeek provider falls back to buffered retry after an empty stream", async () => {
  let requestCount = 0;
  const streams: Array<boolean | undefined> = [];
  const narrationDeltas: string[] = [];

  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    const requestBody = JSON.parse(String(init?.body)) as {
      stream?: boolean;
      response_format?: unknown;
    };
    streams.push(requestBody.stream);
    assert.deepEqual(
      requestBody.response_format,
      requestCount === 1 ? undefined : { type: "json_object" }
    );

    if (requestCount === 1) {
      return streamResponse(["data: [DONE]\n\n"]);
    }

    return jsonResponse({
      id: "buffered-retry",
      model: "test-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"The tunnel breathes warm air.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "Proceed.",
    onPublicNarrationDelta: (delta) => narrationDeltas.push(delta)
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(streams, [true, undefined]);
  assert.equal(response.id, "buffered-retry");
  assert.deepEqual(narrationDeltas, ["The tunnel breathes warm air."]);
  assert.equal(response.debug.providerTimings?.length, 2);
});

test("DeepSeek provider attaches debug details to repeated empty reply errors", async () => {
  let requestCount = 0;

  globalThis.fetch = async (_url, init) => {
    requestCount += 1;
    const requestBody = JSON.parse(String(init?.body)) as {
      stream?: boolean;
      response_format?: unknown;
    };
    assert.equal(requestBody.stream, requestCount === 1 ? true : undefined);
    assert.deepEqual(
      requestBody.response_format,
      requestCount === 1 ? undefined : { type: "json_object" }
    );

    return jsonResponse({
      model: "test-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: ""
          }
        }
      ]
    });
  };

  await assert.rejects(
    async () => {
      try {
        await askDungeonMasterProvider({
          instructions: "Return a JSON DM response.",
          message: "Begin.",
          onPublicNarrationDelta: () => undefined
        });
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "DeepSeekEmptyReplyError");
        assert.equal(
          (error as { debug?: { model?: string } }).debug?.model,
          "test-model"
        );
        assert.equal(
          (error as { debug?: { providerTimings?: unknown[] } }).debug
            ?.providerTimings?.length,
          2
        );
        assert.equal(
          (error as { debug?: { requestMessages?: unknown[] } }).debug
            ?.requestMessages?.length,
          3
        );
        throw error;
      }
    },
    /DeepSeek returned an empty reply\./
  );
  assert.equal(requestCount, 2);
});

test("DeepSeek provider includes empty-response diagnostic details", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      model: "diagnostic-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            reasoning_content: "I thought about it."
          }
        }
      ]
    });

  await assert.rejects(
    askDungeonMasterProvider({
      instructions: "Return a JSON DM response.",
      message: "Begin."
    }),
    /finish_reason=stop; model=diagnostic-model; choices=1; message_keys=reasoning_content; has_reasoning=true/
  );
});
