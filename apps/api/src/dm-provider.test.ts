import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

const { askDungeonMasterProvider, assertDungeonMasterProviderConfigured } =
  await import("./dm-provider.js");

const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalTestProvider = process.env.AI_TAVERNS_TEST_DM_PROVIDER;

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
});

before(() => {
  assert.ok(process.env.DEEPSEEK_API_KEY);
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
      content: "What happens next?"
    }
  ]);
  assert.equal(requestBody?.stream, undefined);
  assert.equal(requestBody?.response_format, undefined);
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

test("DeepSeek provider lowers temperature for combat language", async () => {
  let requestBody:
    | {
        temperature?: number;
      }
    | undefined;

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as typeof requestBody;

    return jsonResponse({
      id: "combat-chat-1",
      model: "test-chat-model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              '{"public_narration":"The bandit raises a blade.","roll_requests":[],"next_input_needed":"player_actions","input_targets":[],"input_policy":"all_players"}'
          }
        }
      ]
    });
  };

  const response = await askDungeonMasterProvider({
    instructions: "Return a JSON DM response.",
    message: "I attack the bandit with my sword."
  });

  assert.equal(requestBody?.temperature, 0.4);
  assert.equal(response.debug.temperature, 0.4);
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
    campaign_title: string;
    region: { name: string };
    allowed_player_facing_terms: { term: string; plain_meaning: string }[];
    first_interactable_choices: string[];
  };

  assert.equal(parsed.campaign_title, "Lanterns at Ashford Tollhouse");
  assert.equal(parsed.region.name, "Ashford Vale");
  assert.deepEqual(parsed.allowed_player_facing_terms, [
    {
      term: "Ashford Tollhouse",
      plain_meaning: "a stone roadside checkpoint"
    }
  ]);
  assert.ok(
    parsed.first_interactable_choices.includes(
      "Question Marra about the silent bridge watch."
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
  assert.equal(response.debug.model, "deepseek-chat");
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

  globalThis.fetch = async () => {
    requestCount += 1;

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
    assert.equal(requestBody.response_format, undefined);
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
    assert.equal(requestBody.response_format, undefined);

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
    assert.equal(requestBody.response_format, undefined);

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
