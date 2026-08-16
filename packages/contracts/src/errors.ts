import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INTERNAL_SERVER_ERROR",
  "LIMIT_EXCEEDED"
]);

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.object({ resourceType: z.string(), tierId: z.number().int().positive(), limit: z.number().int().nonnegative(), used: z.number().int().nonnegative(), resetAt: z.string().optional() }).optional()
  })
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
