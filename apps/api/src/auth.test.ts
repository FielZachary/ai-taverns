import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  AuthMeResponseSchema,
  AuthPasswordlessStartResponseSchema,
  AuthProtectedResponseSchema
} from "@ai-dnd/contracts";

import {
  app,
  database,
  readCookie,
  signIn
} from "./test/app-test-harness.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

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

test("Google OAuth start redirects to Google with state and callback configuration", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/google/start?nextPath=/new-adventure"
  });

  assert.equal(response.statusCode, 302);
  const location = response.headers.location;
  assert.ok(location);

  const redirectUrl = new URL(location);
  assert.equal(redirectUrl.origin, "https://accounts.google.com");
  assert.equal(redirectUrl.pathname, "/o/oauth2/v2/auth");
  assert.equal(redirectUrl.searchParams.get("client_id"), "test-google-client-id");
  assert.equal(
    redirectUrl.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/auth/google/callback"
  );
  assert.equal(redirectUrl.searchParams.get("response_type"), "code");
  assert.equal(redirectUrl.searchParams.get("scope"), "openid email profile");
  assert.ok(redirectUrl.searchParams.get("state"));

  const stateCookie = readCookie(response.headers["set-cookie"]);
  assert.match(stateCookie, /^test_session_google_state=/);
});

test("Google OAuth callback links identity, creates a session, and authenticates /auth/me", async () => {
  const startResponse = await app.inject({
    method: "GET",
    url: "/api/auth/google/start?nextPath=/new-adventure"
  });
  const startLocation = new URL(startResponse.headers.location as string);
  const state = startLocation.searchParams.get("state");
  assert.ok(state);
  const stateCookie = readCookie(startResponse.headers["set-cookie"]);
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];

  globalThis.fetch = (async (url, init) => {
    fetchCalls.push(url.toString());

    if (url.toString() === "https://oauth2.googleapis.com/token") {
      assert.equal(init?.method, "POST");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("code"), "google-code");
      assert.equal(body.get("client_id"), "test-google-client-id");
      assert.equal(body.get("client_secret"), "test-google-client-secret");
      assert.equal(
        body.get("redirect_uri"),
        "http://localhost:3000/api/auth/google/callback"
      );

      return Response.json({
        access_token: "google-access-token",
        token_type: "Bearer",
        expires_in: 3600
      });
    }

    if (url.toString() === "https://openidconnect.googleapis.com/v1/userinfo") {
      assert.deepEqual(init?.headers, {
        authorization: "Bearer google-access-token"
      });

      return Response.json({
        sub: "google-user-123",
        email: "PLAYER@Example.COM",
        email_verified: true,
        name: "Tavern Player"
      });
    }

    throw new Error(`Unexpected fetch URL: ${url.toString()}`);
  }) as typeof fetch;

  try {
    const callbackResponse = await app.inject({
      method: "GET",
      url: `/api/auth/google/callback?code=google-code&state=${encodeURIComponent(state)}`,
      headers: {
        cookie: stateCookie
      }
    });

    assert.equal(callbackResponse.statusCode, 302);
    assert.equal(
      callbackResponse.headers.location,
      "http://localhost:3000/new-adventure"
    );
    assert.deepEqual(fetchCalls, [
      "https://oauth2.googleapis.com/token",
      "https://openidconnect.googleapis.com/v1/userinfo"
    ]);
    assert.equal(database.users.at(-1)?.email, "player@example.com");
    assert.equal(
      database.authIdentities.some(
        (identity) =>
          identity.provider === "email" &&
          identity.provider_subject === "player@example.com"
      ),
      true
    );
    assert.equal(
      database.authIdentities.some(
        (identity) =>
          identity.provider === "google" &&
          identity.provider_subject === "google-user-123" &&
          identity.email === "player@example.com"
      ),
      true
    );

    const setCookieHeaders = callbackResponse.headers["set-cookie"];
    const sessionCookie = (Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders]).find((header) =>
      header?.toString().startsWith("test_session=")
    );
    const cookie = readCookie(sessionCookie?.toString());
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
    assert.equal(meBody.user.displayName, "Tavern Player");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google OAuth callback rejects bad state before calling Google", async () => {
  const fetchMock = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Google should not be called for a bad state");
  }) as typeof fetch;

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=google-code&state=bad-state-that-is-long-enough-for-schema"
    });

    assert.equal(response.statusCode, 302);
    assert.equal(
      response.headers.location,
      "http://localhost:3000/login?error=google-auth"
    );
  } finally {
    globalThis.fetch = fetchMock;
  }
});

test("Google OAuth start reports missing provider configuration", async () => {
  const noGoogleApp = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/ai_taverns",
      AUTH_COOKIE_NAME: "test_session"
    }),
    connectToDatabase: false
  });

  try {
    const response = await noGoogleApp.inject({
      method: "GET",
      url: "/api/auth/google/start"
    });

    assert.equal(response.statusCode, 500);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "INTERNAL_SERVER_ERROR"
    );
  } finally {
    await noGoogleApp.close();
  }
});

test("Google OAuth callback redirects malformed state cookies without calling Google", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Google should not be called for malformed state cookies");
  }) as typeof fetch;

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=google-code&state=bad-state-that-is-long-enough-for-schema",
      headers: {
        cookie: "test_session_google_state=not-base64-json"
      }
    });

    assert.equal(response.statusCode, 302);
    assert.equal(
      response.headers.location,
      "http://localhost:3000/login?error=google-auth"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google OAuth callback reports token exchange failures", async () => {
  const startResponse = await app.inject({
    method: "GET",
    url: "/api/auth/google/start"
  });
  const startLocation = new URL(startResponse.headers.location as string);
  const state = startLocation.searchParams.get("state");
  assert.ok(state);
  const stateCookie = readCookie(startResponse.headers["set-cookie"]);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    Response.json({ error: "invalid_grant" }, { status: 400 })) as typeof fetch;

  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/auth/google/callback?code=bad-code&state=${encodeURIComponent(state)}`,
      headers: {
        cookie: stateCookie
      }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.message,
      "Google sign-in could not be completed."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google OAuth callback rejects unverified Google emails", async () => {
  const startResponse = await app.inject({
    method: "GET",
    url: "/api/auth/google/start"
  });
  const startLocation = new URL(startResponse.headers.location as string);
  const state = startLocation.searchParams.get("state");
  assert.ok(state);
  const stateCookie = readCookie(startResponse.headers["set-cookie"]);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url) => {
    if (url.toString() === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: "google-access-token"
      });
    }

    return Response.json({
      sub: "google-user-unverified",
      email: "unverified@example.com",
      email_verified: false
    });
  }) as typeof fetch;

  try {
    const response = await app.inject({
      method: "GET",
      url: `/api/auth/google/callback?code=google-code&state=${encodeURIComponent(state)}`,
      headers: {
        cookie: stateCookie
      }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.message,
      "Google account email is not verified."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("passwordless verify rejects short and malformed login tokens", async () => {
  const shortTokenResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: "short"
    }
  });

  assert.equal(shortTokenResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(shortTokenResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const malformedTokenResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: "not-a-real-login-token-but-long-enough"
    }
  });

  assert.equal(malformedTokenResponse.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(malformedTokenResponse.json()).error.code,
    "UNAUTHORIZED"
  );
});

test("passwordless verify rejects expired login tokens", async () => {
  const startResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/start",
    payload: {
      email: "expired-token@example.com"
    }
  });
  const startBody = AuthPasswordlessStartResponseSchema.parse(
    startResponse.json()
  );
  const tokenRecord = database.loginTokens.at(-1);

  assert.ok(tokenRecord);
  tokenRecord.expires_at = new Date(Date.now() - 60_000);

  const verifyResponse = await app.inject({
    method: "POST",
    url: "/api/auth/passwordless/verify",
    payload: {
      token: startBody.loginToken
    }
  });

  assert.equal(verifyResponse.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(verifyResponse.json()).error.code,
    "UNAUTHORIZED"
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

test("sign out succeeds without a session cookie", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-out"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["set-cookie"]?.toString().includes("test_session="), true);
});

test("expired session cookies no longer authenticate protected endpoints", async () => {
  const cookie = await signIn("expired-session@example.com");
  const sessionRecord = database.sessions.at(-1);

  assert.ok(sessionRecord);
  sessionRecord.expires_at = new Date(Date.now() - 60_000);

  const meResponse = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: {
      cookie
    }
  });

  assert.equal(meResponse.statusCode, 200);
  assert.deepEqual(AuthMeResponseSchema.parse(meResponse.json()), {
    authenticated: false,
    user: null,
    session: null
  });

  const protectedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/protected",
    headers: {
      cookie
    }
  });

  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(protectedResponse.json()).error.code,
    "UNAUTHORIZED"
  );
});
