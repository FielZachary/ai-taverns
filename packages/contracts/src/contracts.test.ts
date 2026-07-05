import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AuthMeResponseSchema,
  HealthResponseSchema
} from "./index.js";

test("health contract accepts the API health response", () => {
  const parsed = HealthResponseSchema.parse({
    status: "ok",
    service: "api",
    timestamp: "2026-07-05T00:00:00.000Z"
  });

  assert.equal(parsed.status, "ok");
});

test("health contract rejects invalid response shapes", () => {
  assert.throws(() =>
    HealthResponseSchema.parse({
      status: "healthy",
      service: "api",
      timestamp: "not-a-date"
    })
  );
});

test("auth/me contract accepts unauthenticated state", () => {
  const parsed = AuthMeResponseSchema.parse({
    authenticated: false,
    user: null,
    session: null
  });

  assert.equal(parsed.authenticated, false);
});

test("auth/me contract accepts authenticated state", () => {
  const parsed = AuthMeResponseSchema.parse({
    authenticated: true,
    user: {
      id: "user_123",
      email: "player@example.com",
      displayName: "Player"
    },
    session: {
      id: "session_123",
      expiresAt: "2026-07-05T00:00:00.000Z"
    }
  });

  assert.equal(parsed.authenticated, true);
});

test("auth/me contract rejects invalid authenticated users", () => {
  assert.throws(() =>
    AuthMeResponseSchema.parse({
      authenticated: true,
      user: {
        id: "user_123",
        email: "not-an-email",
        displayName: "Player"
      },
      session: {
        id: "session_123",
        expiresAt: "2026-07-05T00:00:00.000Z"
      }
    })
  );
});

test("error envelope contract rejects unknown error codes", () => {
  assert.throws(() =>
    ApiErrorResponseSchema.parse({
      error: {
        code: "TEAPOT",
        message: "Unknown"
      }
    })
  );
});
