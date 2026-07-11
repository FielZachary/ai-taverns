import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

const { askDungeonMasterProvider } = await import("./dm-provider.js");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
      "data: [DONE]\n\n"
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

test("DeepSeek provider retries an empty stream and reports an empty reply diagnostic", async () => {
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
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
});
