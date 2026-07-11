import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AuthMeResponseSchema,
  AuthPasswordlessStartResponseSchema,
  AuthProtectedResponseSchema
} from "@ai-dnd/contracts";

import { app, readCookie } from "./test/app-test-harness.js";

test("GET /api/auth/me returns unauthenticated without a session cookie", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(AuthMeResponseSchema.parse(response.json()), {
    authenticated: false,
    user: null,
    session: null
  });
});

test("passwordless login creates a local session cookie and authenticates /auth/me", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: " PLAYER@Example.COM ",
      nextPath: "/new-adventure"
    }
  });

  assert.equal(startResponse.statusCode, 200);
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  assert.ok(startBody.loginToken);
  assert.equal(
    startBody.loginUrl,
    `http://localhost:3000/auth/confirm?token=${startBody.loginToken}&next=%2Fnew-adventure`
  );

  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(verifyResponse.statusCode, 200);
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);
  const verifyBody = AuthMeResponseSchema.parse(verifyResponse.json());

  assert.equal(verifyBody.authenticated, true);
  assert.equal(verifyBody.user.email, "player@example.com");

  const meResponse = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: {
      cookie
    }
  });

  assert.equal(meResponse.statusCode, 200);
  const meBody = AuthMeResponseSchema.parse(meResponse.json());
  assert.equal(meBody.authenticated, true);
  assert.equal(meBody.user.email, "player@example.com");
});

test("passwordless start rejects invalid email with the standard error envelope", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "not-an-email"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "BAD_REQUEST"
  );
});

test("passwordless login tokens cannot be reused", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "reuse@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );

  const firstVerifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(firstVerifyResponse.statusCode, 200);

  const secondVerifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(secondVerifyResponse.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(secondVerifyResponse.json()).error.code,
    "UNAUTHORIZED"
  );
});

test("protected auth endpoint requires and accepts an owned session", async () => {
  const unauthenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected"
  });

  assert.equal(unauthenticatedResponse.statusCode, 401);

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "protected@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);

  const authenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected",
    headers: {
      cookie
    }
  });

  assert.equal(authenticatedResponse.statusCode, 200);
  const body = AuthProtectedResponseSchema.parse(
    authenticatedResponse.json()
  );
  assert.equal(body.user.email, "protected@example.com");
});

test("sign out revokes the owned session", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "sign-out@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });
  const cookie = readCookie(verifyResponse.headers["set-cookie"]);

  const signOutResponse = await app.inject({
    method: "POST",
    url: "/api/auth/sign-out",
    headers: {
      cookie
    }
  });

  assert.equal(signOutResponse.statusCode, 200);

  const protectedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected",
    headers: {
      cookie
    }
  });

  assert.equal(protectedResponse.statusCode, 401);
});

