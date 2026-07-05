import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { ApiErrorResponseSchema } from "@ai-dnd/contracts";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance;

before(async () => {
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ai_taverns"
    }),
    connectToDatabase: false
  });
});

after(async () => {
  await app.close();
});

test("GET /health returns the API health contract", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "api",
    timestamp: response.json().timestamp
  });
});

test("GET /api/auth/me returns unauthenticated until owned auth lands", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    authenticated: false,
    user: null,
    session: null
  });
});

test("missing routes use the standard error envelope", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/missing"
  });

  assert.equal(response.statusCode, 404);
  assert.doesNotThrow(() => ApiErrorResponseSchema.parse(response.json()));
});
