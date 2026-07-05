import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type ApiConfig } from "./config.js";
import { handleRouteError } from "./errors.js";
import { postgresPlugin } from "./plugins/postgres.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerRoomRoutes } from "./routes/rooms.js";

export type BuildAppOptions = {
  config?: ApiConfig;
  connectToDatabase?: boolean;
};

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const fastify = Fastify({
    logger:
      config.nodeEnv === "test"
        ? false
        : {
            level: config.logLevel
          }
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
  await fastify.register(postgresPlugin, {
    config,
    connectOnReady: options.connectToDatabase ?? true
  });

  await registerHealthRoutes(fastify);
  await fastify.register(registerAuthRoutes, {
    prefix: "/api",
    config
  });
  await fastify.register(registerCampaignRoutes, {
    prefix: "/api",
    config
  });
  await fastify.register(registerRoomRoutes, {
    prefix: "/api",
    config
  });

  return fastify;
}
