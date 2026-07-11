import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

import { loadConfig } from "./config.js";
import { postgresPlugin } from "./plugins/postgres.js";

test("postgresPlugin decorates the app and closes a lazily connected pool", async () => {
  const app = Fastify({ logger: false });

  await app.register(postgresPlugin, {
    config: loadConfig({
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/ai_taverns"
    }),
    connectOnReady: false
  });
  await app.ready();

  assert.equal(typeof app.pg.query, "function");
  assert.equal(typeof app.pg.end, "function");

  await app.close();

  await assert.rejects(
    app.pg.query("select 1"),
    /Cannot use a pool after calling end on the pool/
  );
});

test("postgresPlugin attempts an eager readiness query when configured", async () => {
  const app = Fastify({ logger: false });

  await assert.rejects(
    async () => {
      await app.register(postgresPlugin, {
        config: loadConfig({
          DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/ai_taverns"
        }),
        connectOnReady: true
      });
    },
    /ECONNREFUSED|Connection terminated/
  );

  if ("pg" in app) {
    await app.pg.end();
  }
});
