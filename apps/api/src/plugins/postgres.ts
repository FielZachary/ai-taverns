import fp from "fastify-plugin";
import type pg from "pg";
import { createPostgresPool } from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    pg: pg.Pool;
  }
}

export type PostgresPluginOptions = {
  config: ApiConfig;
  connectOnReady: boolean;
};

export const postgresPlugin = fp<PostgresPluginOptions>(
  async (fastify, options) => {
    const pool = createPostgresPool({
      databaseUrl: options.config.databaseUrl,
      sslDisabled: options.config.databaseSslDisabled,
      maxConnections: options.config.databasePoolMax
    });

    fastify.decorate("pg", pool);

    if (options.connectOnReady) {
      await pool.query("select 1");
    }

    fastify.addHook("onClose", async () => {
      await pool.end();
    });
  },
  {
    name: "postgres"
  }
);
