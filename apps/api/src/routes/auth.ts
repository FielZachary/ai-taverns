import type { FastifyInstance } from "fastify";
import { AuthMeResponseSchema, type AuthMeResponse } from "@ai-dnd/contracts";

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.get("/auth/me", async (): Promise<AuthMeResponse> => {
    const response = {
      authenticated: false,
      user: null,
      session: null
    } satisfies AuthMeResponse;

    return AuthMeResponseSchema.parse(response);
  });
}
