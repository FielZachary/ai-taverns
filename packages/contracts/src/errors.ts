import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LIMIT_EXCEEDED",
  "INTERNAL_SERVER_ERROR"
]);

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    quota: z
      .object({
        resource: z.string(),
        subscriptionTier: z.string(),
        used: z.number().int().nonnegative(),
        limit: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
        resetAt: z.string().datetime().nullable()
      })
      .optional()
  })
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
