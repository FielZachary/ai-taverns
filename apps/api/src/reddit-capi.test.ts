import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "./config.js";
import { redditCapiIsConfigured, trackRedditSignup } from "./reddit-capi.js";

const log = {
  warn() {}
} as never;

test("Reddit signup conversion stays disabled without both server credentials", async () => {
  const calls: string[] = [];
  await trackRedditSignup({
    config: loadConfig({ NODE_ENV: "test" }),
    log,
    signup: {
      email: "player@example.com",
      userId: "user-123",
      eventSourceUrl: "https://ai-taverns.com/onboarding",
      ipAddress: "203.0.113.4",
      userAgent: "test-agent"
    },
    fetchImplementation: async (url) => {
      calls.push(url.toString());
      return new Response(null, { status: 204 });
    }
  });

  assert.equal(redditCapiIsConfigured(loadConfig({ NODE_ENV: "test" })), false);
  assert.deepEqual(calls, []);
});

test("Reddit signup conversion sends a hashed standard Sign Up event", async () => {
  let request: Request | undefined;
  await trackRedditSignup({
    config: loadConfig({
      NODE_ENV: "test",
      REDDIT_CAPI_PIXEL_ID: "pixel-123",
      REDDIT_CAPI_ACCESS_TOKEN: "secret-token"
    }),
    log,
    signup: {
      email: " Player@Example.com ",
      userId: "user-123",
      eventSourceUrl: "https://ai-taverns.com/onboarding?rdt_cid=click-id",
      ipAddress: "203.0.113.4",
      userAgent: "test-agent"
    },
    fetchImplementation: async (url, init) => {
      request = new Request(url, init);
      return new Response(null, { status: 204 });
    }
  });

  assert.ok(request);
  assert.equal(
    request.url,
    "https://ads-api.reddit.com/api/v3/pixels/pixel-123/conversion_events"
  );
  assert.equal(request.headers.get("authorization"), "Bearer secret-token");
  const body = (await request.json()) as { events: Array<Record<string, unknown>> };
  const event = body.events[0];
  assert.ok(event);
  assert.equal(event.action_source, "WEBSITE");
  assert.deepEqual(event.type, { tracking_type: "SIGN_UP" });
  assert.equal(event.event_source_url, "https://ai-taverns.com/onboarding?rdt_cid=click-id");
  assert.deepEqual(event.user, {
    email: "46b06dcd1ce7d8bdf29ce2677575bd21fd7b3879416d5b810dcc78b77e932b02",
    external_id: "fcdec6df4d44dbc637c7c5b58efface52a7f8a88535423430255be0bb89bedd8",
    ip_address: "203.0.113.4",
    user_agent: "test-agent"
  });
  assert.match((event.metadata as { conversion_id: string }).conversion_id, /^[0-9a-f-]{36}$/);
});
