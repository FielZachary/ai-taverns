import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorCode, ApiErrorResponse } from "@ai-dnd/contracts";
import { ZodError } from "zod";

function statusToCode(statusCode: number): ApiErrorCode {
  if (statusCode === 429) {
    return "LIMIT_EXCEEDED";
  }

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
  const isValidationError = error instanceof ZodError;
  const statusCode = isValidationError ? 400 : error.statusCode ?? 500;
  const shouldExposeMessage =
    statusCode < 500 || (error as FastifyError & { expose?: boolean }).expose;
  const explicitCode = (error as FastifyError & { code?: string }).code;
  const quota = (error as FastifyError & { quota?: unknown }).quota;
  const response: ApiErrorResponse = {
    error: {
      code:
        explicitCode === "LIMIT_EXCEEDED"
          ? "LIMIT_EXCEEDED"
          : statusToCode(statusCode),
      message:
        shouldExposeMessage
          ? isValidationError
            ? "Invalid request body."
            : error.message
          : "Internal server error",
      requestId: request.id
    }
  };

  if (quota && typeof quota === "object") {
    response.error.quota = quota as ApiErrorResponse["error"]["quota"];
  }

  request.log.error({ err: error }, "request failed");
  return reply.status(statusCode).send(response);
}
