import type { FastifyInstance } from "fastify";
import {
  HealthResponseSchema,
  type HealthResponse
} from "@ai-dnd/contracts";

export async function registerHealthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async (): Promise<HealthResponse> => {
    const response = {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString()
    } satisfies HealthResponse;

    return HealthResponseSchema.parse(response);
  });
}
