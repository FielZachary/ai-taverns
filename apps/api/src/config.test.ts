import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "./config.js";

test("loadConfig applies development defaults and trims web origins", () => {
  const config = loadConfig({
    WEB_ORIGINS: " http://localhost:3000, https://app.example.com ,, "
  });

  assert.equal(config.nodeEnv, "development");
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 4000);
  assert.equal(config.logLevel, "info");
  assert.equal(
    config.databaseUrl,
    "postgres://postgres:postgres@localhost:5432/ai_taverns"
  );
  assert.equal(config.databaseSslDisabled, true);
  assert.equal(config.databasePoolMax, 10);
  assert.deepEqual(config.webOrigins, [
    "http://localhost:3000",
    "https://app.example.com"
  ]);
  assert.equal(config.authCookieName, "ai_taverns_session");
  assert.equal(config.authCookieSecure, false);
  assert.equal(config.authSessionTtlDays, 30);
  assert.equal(config.authLoginTokenTtlMinutes, 15);
  assert.equal(config.authExposeLocalLoginTokens, true);
  assert.equal(config.authPublicAppOrigin, "http://localhost:3000");
  assert.equal(config.authEmailFrom, undefined);
  assert.equal(config.googleOAuthClientId, undefined);
  assert.equal(config.googleOAuthClientSecret, undefined);
  assert.equal(config.resendApiKey, undefined);
  assert.equal(config.mediaStorageDriver, "local");
  assert.equal(config.mediaLocalDir, ".local-media");
  assert.equal(config.mediaPublicBaseUrl, "/media");
  assert.equal(config.spacesEndpoint, undefined);
  assert.equal(config.spacesRegion, undefined);
  assert.equal(config.spacesBucket, undefined);
  assert.equal(config.spacesAccessKeyId, undefined);
  assert.equal(config.spacesSecretAccessKey, undefined);
});

test("loadConfig applies production security defaults and explicit overrides", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "debug",
    DATABASE_URL: "postgres://user:pass@db.example.com:5432/app",
    DATABASE_SSL_DISABLED: "false",
    DATABASE_POOL_MAX: "25",
    WEB_ORIGINS: "https://app.example.com",
    AUTH_COOKIE_NAME: "custom_session",
    AUTH_COOKIE_SECURE: "false",
    AUTH_SESSION_TTL_DAYS: "7",
    AUTH_LOGIN_TOKEN_TTL_MINUTES: "5",
    AUTH_EXPOSE_LOCAL_LOGIN_TOKENS: "true",
    AUTH_PUBLIC_APP_ORIGIN: "https://public.example.com",
    AUTH_EMAIL_FROM: "AI Taverns <hello@example.com>",
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    RESEND_API_KEY: "resend-test-key",
    MEDIA_STORAGE_DRIVER: "spaces",
    MEDIA_LOCAL_DIR: "/tmp/media",
    MEDIA_PUBLIC_BASE_URL: "https://cdn.example.com/media/",
    SPACES_ENDPOINT: "https://sgp1.digitaloceanspaces.com",
    SPACES_REGION: "sgp1",
    SPACES_BUCKET: "ai-taverns-media",
    DIGITALOCEAN_SPACES_ACCESS_KEY: "spaces-key",
    DIGITALOCEAN_SPACES_SECRET_KEY: "spaces-secret"
  });

  assert.deepEqual(config, {
    nodeEnv: "production",
    host: "127.0.0.1",
    port: 8080,
    logLevel: "debug",
    databaseUrl: "postgres://user:pass@db.example.com:5432/app",
    databaseSslDisabled: false,
    databasePoolMax: 25,
    webOrigins: ["https://app.example.com"],
    authCookieName: "custom_session",
    authCookieSecure: false,
    authSessionTtlDays: 7,
    authLoginTokenTtlMinutes: 5,
    authExposeLocalLoginTokens: true,
    authPublicAppOrigin: "https://public.example.com",
    authEmailFrom: "AI Taverns <hello@example.com>",
    googleOAuthClientId: "google-client-id",
    googleOAuthClientSecret: "google-client-secret",
    resendApiKey: "resend-test-key",
    mediaStorageDriver: "spaces",
    mediaLocalDir: "/tmp/media",
    mediaPublicBaseUrl: "https://cdn.example.com/media",
    spacesEndpoint: "https://sgp1.digitaloceanspaces.com",
    spacesRegion: "sgp1",
    spacesBucket: "ai-taverns-media",
    spacesAccessKeyId: "spaces-key",
    spacesSecretAccessKey: "spaces-secret"
  });
});

test("loadConfig falls back to localhost when web origins are blank", () => {
  const config = loadConfig({
    WEB_ORIGINS: " , "
  });

  assert.deepEqual(config.webOrigins, []);
  assert.equal(config.authPublicAppOrigin, "http://localhost:3000");
});

test("loadConfig rejects invalid required environment values", () => {
  assert.throws(
    () =>
      loadConfig({
        PORT: "not-a-port"
      }),
    /Expected number, received nan/
  );

  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "not-a-url"
      }),
    /Invalid url/
  );
});
