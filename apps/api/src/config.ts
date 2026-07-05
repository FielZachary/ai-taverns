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
  WEB_ORIGINS: z.string().default("http://localhost:3000")
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
      .filter(Boolean)
  };
}
