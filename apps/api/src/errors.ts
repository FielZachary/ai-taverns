import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorCode, ApiErrorResponse } from "@ai-dnd/contracts";

function statusToCode(statusCode: number): ApiErrorCode {
  if (statusCode === 401) {
    return "UNAUTHORIZED";
  }

  if (statusCode === 403) {
    return "FORBIDDEN";
  }

  if (statusCode === 404) {
    return "NOT_FOUND";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "BAD_REQUEST";
  }

  return "INTERNAL_SERVER_ERROR";
}

export function handleRouteError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode ?? 500;
  const response: ApiErrorResponse = {
    error: {
      code: statusToCode(statusCode),
      message:
        statusCode >= 500 ? "Internal server error" : error.message,
      requestId: request.id
    }
  };

  request.log.error({ err: error }, "request failed");
  return reply.status(statusCode).send(response);
}
