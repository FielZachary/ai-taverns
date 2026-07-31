import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DungeonMasterRuntime } from "@ai-dnd/db";
import { loadConfig, type ApiConfig } from "./config.js";
import { createServerAnalytics } from "./analytics.js";
import { handleRouteError } from "./errors.js";
import { postgresPlugin } from "./plugins/postgres.js";
import { roomRealtimePlugin } from "./plugins/room-realtime.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerDmRoutes } from "./routes/dm.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import { registerRoomRoutes } from "./routes/rooms.js";

export type BuildAppOptions = {
  config?: ApiConfig;
  connectToDatabase?: boolean;
  dmRuntime?: DungeonMasterRuntime;
};

function localMediaRoutePrefix(publicBaseUrl: string) {
  const pathPrefix = publicBaseUrl.startsWith("http")
    ? new URL(publicBaseUrl).pathname
    : publicBaseUrl;

  return `${pathPrefix.replace(/\/+$/, "")}/`;
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const apiDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(apiDir, "../../..");
  const fastify = Fastify({
    logger:
      config.nodeEnv === "test"
        ? false
        : {
            level: config.logLevel
          }
  });
  const analytics = createServerAnalytics({
    config,
    log: fastify.log
  });

  fastify.setErrorHandler(handleRouteError);
  fastify.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        requestId: request.id
      }
    });
  });

  await fastify.register(cors, {
    origin: config.webOrigins,
    credentials: true
  });
  await fastify.register(cookie);
  if (config.mediaStorageDriver === "local") {
    await fastify.register(fastifyStatic, {
      root: path.resolve(repoRoot, config.mediaLocalDir),
      prefix: localMediaRoutePrefix(config.mediaPublicBaseUrl),
      decorateReply: false
    });
  }
  await fastify.register(websocket);
  await fastify.register(postgresPlugin, {
    config,
    connectOnReady: options.connectToDatabase ?? true
  });
  await fastify.register(roomRealtimePlugin, {
    startPostgresListener: options.connectToDatabase ?? true
  });

  await registerHealthRoutes(fastify);
  await fastify.register(registerAuthRoutes, {
    prefix: "/api",
    config,
    analytics
  });
  await fastify.register(registerCampaignRoutes, {
    prefix: "/api",
    config,
    analytics,
    dmRuntime: options.dmRuntime
  });
  await fastify.register(registerRoomRoutes, {
    prefix: "/api",
    config,
    analytics,
    dmRuntime: options.dmRuntime
  });
  await fastify.register(registerRealtimeRoutes, {
    prefix: "/api",
    config
  });
  await fastify.register(registerDmRoutes, {
    prefix: "/api",
    config,
    analytics,
    dmRuntime: options.dmRuntime
  });
  return fastify;
}
