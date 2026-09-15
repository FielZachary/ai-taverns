import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().min(1).default("info"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/ai_taverns"),
  DATABASE_SSL_DISABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  WEB_ORIGINS: z.string().default("http://localhost:3000"),
  AUTH_COOKIE_NAME: z.string().min(1).default("ai_taverns_session"),
  AUTH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_LOGIN_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_EXPOSE_LOCAL_LOGIN_TOKENS: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  AUTH_PUBLIC_APP_ORIGIN: z.string().url().optional(),
  AUTH_EMAIL_FROM: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  MEDIA_STORAGE_DRIVER: z.enum(["local", "spaces", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().min(1).default(".local-media"),
  MEDIA_PUBLIC_BASE_URL: z.string().min(1).default("/media"),
  SPACES_ENDPOINT: z.string().url().optional(),
  SPACES_REGION: z.string().min(1).optional(),
  SPACES_BUCKET: z.string().min(1).optional(),
  SPACES_ACCESS_KEY_ID: z.string().min(1).optional(),
  SPACES_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  DIGITALOCEAN_SPACES_ACCESS_KEY: z.string().min(1).optional(),
  DIGITALOCEAN_SPACES_SECRET_KEY: z.string().min(1).optional(),
  MIXPANEL_PROJECT_TOKEN: z.string().min(1).optional(),
  MIXPANEL_PROJECT_ID: z.string().min(1).default("4049394"),
  MIXPANEL_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  MIXPANEL_DEBUG: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  REDDIT_CAPI_PIXEL_ID: z.string().min(1).optional(),
  REDDIT_CAPI_ACCESS_TOKEN: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
  SUBSCRIPTION_DEFAULT_TIER_ID: z.coerce.number().int().positive().default(4)
});

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  databaseSslDisabled: boolean;
  databasePoolMax: number;
  webOrigins: string[];
  authCookieName: string;
  authCookieSecure: boolean;
  authSessionTtlDays: number;
  authLoginTokenTtlMinutes: number;
  authExposeLocalLoginTokens: boolean;
  authPublicAppOrigin: string;
  authEmailFrom: string | undefined;
  googleOAuthClientId: string | undefined;
  googleOAuthClientSecret: string | undefined;
  resendApiKey: string | undefined;
  mediaStorageDriver: "local" | "spaces" | "s3";
  mediaLocalDir: string;
  mediaPublicBaseUrl: string;
  spacesEndpoint: string | undefined;
  spacesRegion: string | undefined;
  spacesBucket: string | undefined;
  spacesAccessKeyId: string | undefined;
  spacesSecretAccessKey: string | undefined;
  mixpanelProjectToken: string | undefined;
  mixpanelProjectId: string;
  mixpanelEnabled: boolean;
  mixpanelDebug: boolean;
  redditCapiPixelId: string | undefined;
  redditCapiAccessToken: string | undefined;
  subscriptionDefaultTierId: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = ConfigSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    databaseSslDisabled: parsed.DATABASE_SSL_DISABLED,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    webOrigins: parsed.WEB_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    authCookieName: parsed.AUTH_COOKIE_NAME,
    authCookieSecure:
      parsed.AUTH_COOKIE_SECURE ?? parsed.NODE_ENV === "production",
    authSessionTtlDays: parsed.AUTH_SESSION_TTL_DAYS,
    authLoginTokenTtlMinutes: parsed.AUTH_LOGIN_TOKEN_TTL_MINUTES,
    authExposeLocalLoginTokens:
      parsed.AUTH_EXPOSE_LOCAL_LOGIN_TOKENS ??
      parsed.NODE_ENV !== "production",
    authPublicAppOrigin:
      parsed.AUTH_PUBLIC_APP_ORIGIN ??
      parsed.WEB_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)[0] ??
      "http://localhost:3000",
    authEmailFrom: parsed.AUTH_EMAIL_FROM,
    googleOAuthClientId: parsed.GOOGLE_OAUTH_CLIENT_ID,
    googleOAuthClientSecret: parsed.GOOGLE_OAUTH_CLIENT_SECRET,
    resendApiKey: parsed.RESEND_API_KEY,
    mediaStorageDriver: parsed.MEDIA_STORAGE_DRIVER,
    mediaLocalDir: parsed.MEDIA_LOCAL_DIR,
    mediaPublicBaseUrl: parsed.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, ""),
    spacesEndpoint: parsed.SPACES_ENDPOINT,
    spacesRegion: parsed.SPACES_REGION,
    spacesBucket: parsed.SPACES_BUCKET,
    spacesAccessKeyId:
      parsed.SPACES_ACCESS_KEY_ID ?? parsed.DIGITALOCEAN_SPACES_ACCESS_KEY,
    spacesSecretAccessKey:
      parsed.SPACES_SECRET_ACCESS_KEY ?? parsed.DIGITALOCEAN_SPACES_SECRET_KEY,
    mixpanelProjectToken: parsed.MIXPANEL_PROJECT_TOKEN,
    mixpanelProjectId: parsed.MIXPANEL_PROJECT_ID,
    mixpanelEnabled:
      parsed.MIXPANEL_ENABLED ?? Boolean(parsed.MIXPANEL_PROJECT_TOKEN),
    mixpanelDebug: parsed.MIXPANEL_DEBUG ?? false,
    redditCapiPixelId: parsed.REDDIT_CAPI_PIXEL_ID,
    redditCapiAccessToken:
      parsed.REDDIT_CAPI_ACCESS_TOKEN ?? parsed.REDDIT_CLIENT_SECRET,
    subscriptionDefaultTierId: parsed.SUBSCRIPTION_DEFAULT_TIER_ID
  };
}
