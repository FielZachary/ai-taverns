import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
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
  findActiveSessionByTokenHash,
  revokeSessionByTokenHash,
  upsertUserByEmail
} from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";

export type AuthRouteOptions = {
  config: ApiConfig;
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
      displayName: authSession.user.displayName
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
  const { config } = options;

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

      const user = await upsertUserByEmail(client, {
        email: loginToken.email,
        displayName: null
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

      const response = {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName
        },
        session: {
          id: session.id,
          expiresAt: session.expiresAt.toISOString()
        }
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
      user
    });
  });
}
