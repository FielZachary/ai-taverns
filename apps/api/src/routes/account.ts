import type { FastifyInstance } from "fastify";
import { AccountUsageResponseSchema } from "@ai-dnd/contracts";
import { getUsageSummary } from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

export async function registerAccountRoutes(fastify: FastifyInstance, options: { config: ApiConfig }) {
  fastify.get("/account/usage", async (request) => {
    const user = await requireAuthenticatedUser(fastify, options.config, request.cookies[options.config.authCookieName]);
    return AccountUsageResponseSchema.parse(await getUsageSummary(fastify.pg, { userId: user.id }));
  });
}
