import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AuthMeResponseSchema,
  AuthClaimGuestStateRequestSchema,
  AuthClaimGuestStateResponseSchema,
  AuthPasswordlessStartRequestSchema,
  AuthPasswordlessStartResponseSchema,
  AuthPasswordlessVerifyRequestSchema,
  AuthProtectedResponseSchema,
  AuthSignOutResponseSchema,
  type AuthMeResponse,
  type AuthPasswordlessStartResponse
} from "@ai-dnd/contracts";
import {
  claimGuestStateForUser,
  consumeLoginToken,
  createLoginToken,
  createSession,
  ensureEmailIdentity,
  ensureGoogleIdentity,
  findUserByAuthIdentity,
  findUserByEmail,
  findActiveSessionByTokenHash,
  revokeSessionByTokenHash,
  upsertUserByEmail
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import type { ServerAnalytics } from "../analytics.js";
import { trackRedditSignup } from "../reddit-capi.js";

export type AuthRouteOptions = {
  config: ApiConfig;
  analytics?: ServerAnalytics;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createHttpError(statusCode: number, message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

const AuthGoogleStartQuerySchema = z.object({
  nextPath: z.string().trim().regex(/^\/(?!\/)/).max(200).optional()
});

const AuthGoogleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(32).optional(),
  error: z.string().optional()
});

const GoogleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  scope: z.string().optional()
});

const GoogleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  email_verified: z.boolean().optional(),
  name: z.string().trim().min(1).optional()
});

function googleStateCookieName(config: ApiConfig) {
  return `${config.authCookieName}_google_state`;
}

function googleCallbackUrl(config: ApiConfig) {
  const publicOrigin = config.authPublicAppOrigin.replace(/\/$/, "");
  return `${publicOrigin}/api/auth/google/callback`;
}

function encodeGoogleStateCookie(input: {
  state: string;
  nextPath: string | undefined;
}) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeGoogleStateCookie(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return z
      .object({
        state: z.string().min(32),
        nextPath: z.string().regex(/^\/(?!\/)/).max(200).optional()
      })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function googleStateCookieOptions(config: ApiConfig) {
  return {
    path: "/api/auth/google",
    httpOnly: true,
    secure: config.authCookieSecure,
    sameSite: "lax" as const,
    maxAge: 10 * 60
  };
}

function createMagicLink(config: ApiConfig, token: string, nextPath?: string): string {
  const url = new URL(
    "/auth/confirm",
    config.authPublicAppOrigin.replace(/\/$/, "")
  );
  url.searchParams.set("token", token);

  if (nextPath) {
    url.searchParams.set("next", nextPath);
  }

  return url.toString();
}

function requireGoogleOAuthConfig(config: ApiConfig) {
  if (!config.googleOAuthClientId || !config.googleOAuthClientSecret) {
    throw createHttpError(500, "Google sign-in is not configured.");
  }

  return {
    clientId: config.googleOAuthClientId,
    clientSecret: config.googleOAuthClientSecret
  };
}

async function exchangeGoogleAuthorizationCode(input: {
  config: ApiConfig;
  code: string;
}) {
  const credentials = requireGoogleOAuthConfig(input.config);
  const body = new URLSearchParams({
    code: input.code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: googleCallbackUrl(input.config),
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw createHttpError(401, "Google sign-in could not be completed.");
  }

  return GoogleTokenResponseSchema.parse(await response.json());
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw createHttpError(401, "Google profile could not be loaded.");
  }

  const profile = GoogleUserInfoSchema.parse(await response.json());

  if (profile.email_verified === false) {
    throw createHttpError(401, "Google account email is not verified.");
  }

  return profile;
}

async function sendMagicLinkEmail(input: {
  config: ApiConfig;
  email: string;
  magicLink: string;
  expiresAt: Date;
}): Promise<void> {
  const { config, email, magicLink, expiresAt } = input;

  if (!config.resendApiKey) {
    if (config.authExposeLocalLoginTokens) {
      return;
    }

    throw createHttpError(500, "Email delivery is not configured.");
  }

  if (!config.authEmailFrom) {
    throw createHttpError(500, "Auth email sender is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.authEmailFrom,
      to: email,
      subject: "Your AI Taverns sign-in link",
      text: [
        "Use this link to sign in to AI Taverns:",
        "",
        magicLink,
        "",
        `This link expires at ${expiresAt.toISOString()}.`,
        "If you did not request this, you can ignore this email."
      ].join("\n"),
      html: [
        "<p>Use this link to sign in to AI Taverns:</p>",
        `<p><a href="${magicLink}">Sign in to AI Taverns</a></p>`,
        `<p>This link expires at ${expiresAt.toISOString()}.</p>`,
        "<p>If you did not request this, you can ignore this email.</p>"
      ].join("")
    })
  });

  if (!response.ok) {
    throw createHttpError(502, "Email delivery failed.");
  }
}

function sessionCookieOptions(config: ApiConfig, expiresAt: Date) {
  return {
    path: "/",
    httpOnly: true,
    secure: config.authCookieSecure,
    sameSite: "lax" as const,
    expires: expiresAt
  };
}

async function getAuthenticatedSession(
  fastify: FastifyInstance,
  config: ApiConfig,
  sessionToken: string | undefined
): Promise<AuthMeResponse> {
  if (!sessionToken) {
    const response = {
      authenticated: false,
      user: null,
      session: null
    } satisfies AuthMeResponse;

    return AuthMeResponseSchema.parse(response);
  }

  const authSession = await findActiveSessionByTokenHash(
    fastify.pg,
    hashToken(sessionToken),
    new Date()
  );

  if (!authSession) {
    const response = {
      authenticated: false,
      user: null,
      session: null
    } satisfies AuthMeResponse;

    return AuthMeResponseSchema.parse(response);
  }

  const response = {
    authenticated: true,
    user: {
      id: authSession.user.id,
      email: authSession.user.email,
      displayName: authSession.user.displayName,
      onboardingCompletedAt:
        authSession.user.onboardingCompletedAt?.toISOString() ?? null
    },
    session: {
      id: authSession.session.id,
      expiresAt: authSession.session.expiresAt.toISOString()
    }
  } satisfies AuthMeResponse;

  return AuthMeResponseSchema.parse(response);
}

export async function requireAuthenticatedUser(
  fastify: FastifyInstance,
  config: ApiConfig,
  sessionToken: string | undefined
) {
  const authSession = await getAuthenticatedSession(fastify, config, sessionToken);

  if (!authSession.authenticated) {
    throw createHttpError(401, "Authentication required.");
  }

  return authSession.user;
}

export async function registerAuthRoutes(
  fastify: FastifyInstance,
  options: AuthRouteOptions
) {
  const { config, analytics } = options;

  fastify.get("/auth/google/start", async (request, reply) => {
    const credentials = requireGoogleOAuthConfig(config);
    const query = AuthGoogleStartQuerySchema.parse(request.query);
    const state = createOpaqueToken();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    authUrl.searchParams.set("client_id", credentials.clientId);
    authUrl.searchParams.set("redirect_uri", googleCallbackUrl(config));
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");

    reply.setCookie(
      googleStateCookieName(config),
      encodeGoogleStateCookie({
        state,
        nextPath: query.nextPath
      }),
      googleStateCookieOptions(config)
    );

    return reply.redirect(authUrl.toString());
  });

  fastify.get("/auth/google/callback", async (request, reply) => {
    const query = AuthGoogleCallbackQuerySchema.parse(request.query);
    const stateCookie = decodeGoogleStateCookie(
      request.cookies[googleStateCookieName(config)]
    );
    const loginUrl = new URL("/login?error=google-auth", config.authPublicAppOrigin);

    reply.clearCookie(googleStateCookieName(config), googleStateCookieOptions(config));

    if (query.error || !query.code || !query.state || !stateCookie) {
      return reply.redirect(loginUrl.toString());
    }

    if (query.state !== stateCookie.state) {
      return reply.redirect(loginUrl.toString());
    }

    const now = new Date();
    const sessionToken = createOpaqueToken();
    const sessionExpiresAt = addDays(now, config.authSessionTtlDays);
    const googleTokens = await exchangeGoogleAuthorizationCode({
      config,
      code: query.code
    });
    const googleUser = await fetchGoogleUserInfo(googleTokens.access_token);
    const client = await fastify.pg.connect();

    try {
      await client.query("begin");

      const existingUser = await findUserByAuthIdentity(client, {
        provider: "google",
        providerSubject: googleUser.sub
      });
      const existingEmailUser = existingUser
        ? null
        : await findUserByEmail(client, googleUser.email);
      const user =
        existingUser ??
        (await upsertUserByEmail(client, {
          email: googleUser.email,
          displayName: googleUser.name ?? null,
          subscriptionTierId: config.subscriptionDefaultTierId
        }));

      await ensureGoogleIdentity(client, {
        userId: user.id,
        providerSubject: googleUser.sub,
        email: googleUser.email
      });

      if (user.email === googleUser.email) {
        await ensureEmailIdentity(client, {
          userId: user.id,
          email: user.email
        });
      }

      const session = await createSession(client, {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: sessionExpiresAt
      });

      await client.query("commit");

      reply.setCookie(
        config.authCookieName,
        sessionToken,
        sessionCookieOptions(config, session.expiresAt)
      );
      analytics?.identify({
        distinctId: `user:${user.id}`,
        properties: {
          $email: user.email,
          displayName: user.displayName,
          authProvider: "google"
        },
        setOnce: {
          firstSeenAt: now.toISOString()
        }
      });
      analytics?.track({
        name: "User Signed In",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          authProvider: "google"
        }
      });
      if (!existingUser && !existingEmailUser) {
        void trackRedditSignup({
          config,
          log: fastify.log,
          signup: {
            email: user.email,
            userId: user.id,
            eventSourceUrl: new URL(
              stateCookie.nextPath ?? "/play",
              config.authPublicAppOrigin
            ).toString(),
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"]
          }
        });
      }

      const redirectPath =
        !existingUser && !existingEmailUser
          ? "/onboarding"
          : stateCookie.nextPath ?? "/play";

      return reply.redirect(
        new URL(redirectPath, config.authPublicAppOrigin).toString()
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.post(
    "/auth/passwordless/start",
    async (request): Promise<AuthPasswordlessStartResponse> => {
      const body = AuthPasswordlessStartRequestSchema.parse(request.body);
      const token = createOpaqueToken();
      const expiresAt = addMinutes(
        new Date(),
        config.authLoginTokenTtlMinutes
      );

      await createLoginToken(fastify.pg, {
        email: body.email,
        tokenHash: hashToken(token),
        expiresAt
      });

      const magicLink = createMagicLink(config, token, body.nextPath);

      await sendMagicLinkEmail({
        config,
        email: body.email,
        magicLink,
        expiresAt
      });

      const response = {
        ok: true,
        expiresAt: expiresAt.toISOString(),
        ...(config.authExposeLocalLoginTokens
          ? { loginToken: token, loginUrl: magicLink }
          : {})
      } satisfies AuthPasswordlessStartResponse;

      return AuthPasswordlessStartResponseSchema.parse(response);
    }
  );

  fastify.post("/auth/passwordless/verify", async (request, reply) => {
    const body = AuthPasswordlessVerifyRequestSchema.parse(request.body);
    const now = new Date();
    const sessionToken = createOpaqueToken();
    const sessionExpiresAt = addDays(now, config.authSessionTtlDays);
    const client = await fastify.pg.connect();

    try {
      await client.query("begin");

      const loginToken = await consumeLoginToken(client, {
        tokenHash: hashToken(body.token),
        consumedAt: now
      });

      if (!loginToken) {
        throw createHttpError(401, "Login token is invalid or expired.");
      }

      const existingUser = await findUserByEmail(client, loginToken.email);

      const user = await upsertUserByEmail(client, {
        email: loginToken.email,
        displayName: null,
        subscriptionTierId: config.subscriptionDefaultTierId
      });

      await ensureEmailIdentity(client, {
        userId: user.id,
        email: user.email
      });

      const session = await createSession(client, {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: sessionExpiresAt
      });

      await client.query("commit");

      reply.setCookie(
        config.authCookieName,
        sessionToken,
        sessionCookieOptions(config, sessionExpiresAt)
      );
      analytics?.identify({
        distinctId: `user:${user.id}`,
        properties: {
          $email: user.email,
          displayName: user.displayName,
          authProvider: "passwordless"
        },
        setOnce: {
          firstSeenAt: now.toISOString()
        }
      });
      analytics?.track({
        name: "User Signed In",
        distinctId: `user:${user.id}`,
        properties: {
          userId: user.id,
          authProvider: "passwordless"
        }
      });
      if (!existingUser) {
        void trackRedditSignup({
          config,
          log: fastify.log,
          signup: {
            email: user.email,
            userId: user.id,
            eventSourceUrl: config.authPublicAppOrigin,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"]
          }
        });
      }

      const response = {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt.toISOString()
        },
        isNewUser: !existingUser
      } satisfies AuthMeResponse;

      return AuthMeResponseSchema.parse(response);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.post("/auth/sign-out", async (request, reply) => {
    const sessionToken = request.cookies[config.authCookieName];

    if (sessionToken) {
      await revokeSessionByTokenHash(
        fastify.pg,
        hashToken(sessionToken),
        new Date()
      );
    }

    reply.clearCookie(config.authCookieName, {
      path: "/",
      httpOnly: true,
      secure: config.authCookieSecure,
      sameSite: "lax"
    });

    return AuthSignOutResponseSchema.parse({ ok: true });
  });

  fastify.post("/auth/claim-guest-state", async (request) => {
    const body = AuthClaimGuestStateRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return AuthClaimGuestStateResponseSchema.parse(
      await claimGuestStateForUser(fastify.pg, {
        clientId: body.clientId,
        userId: user.id
      })
    );
  });

  fastify.get("/auth/me", async (request): Promise<AuthMeResponse> => {
    return getAuthenticatedSession(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );
  });

  fastify.get("/auth/protected", async (request) => {
    const user = await requireAuthenticatedUser(
      fastify,
      config,
      request.cookies[config.authCookieName]
    );

    return AuthProtectedResponseSchema.parse({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onboardingCompletedAt: user.onboardingCompletedAt
      }
    });
  });
}
