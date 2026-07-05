import { z } from "zod";

export const AuthEmailSchema = z.string().trim().toLowerCase().email();

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).nullable()
});

export const AuthSessionSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.string().datetime()
});

export const AuthMeResponseSchema = z.discriminatedUnion("authenticated", [
  z.object({
    authenticated: z.literal(false),
    user: z.null(),
    session: z.null()
  }),
  z.object({
    authenticated: z.literal(true),
    user: AuthUserSchema,
    session: AuthSessionSchema
  })
]);

export const AuthPasswordlessStartRequestSchema = z.object({
  email: AuthEmailSchema,
  displayName: z.string().trim().min(1).max(120).optional()
});

export const AuthPasswordlessStartResponseSchema = z.object({
  ok: z.literal(true),
  expiresAt: z.string().datetime(),
  loginToken: z.string().min(32).optional()
});

export const AuthPasswordlessVerifyRequestSchema = z.object({
  token: z.string().min(32)
});

export const AuthSignOutResponseSchema = z.object({
  ok: z.literal(true)
});

export const AuthProtectedResponseSchema = z.object({
  ok: z.literal(true),
  user: AuthUserSchema
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
export type AuthPasswordlessStartRequest = z.infer<
  typeof AuthPasswordlessStartRequestSchema
>;
export type AuthPasswordlessStartResponse = z.infer<
  typeof AuthPasswordlessStartResponseSchema
>;
export type AuthPasswordlessVerifyRequest = z.infer<
  typeof AuthPasswordlessVerifyRequestSchema
>;
export type AuthSignOutResponse = z.infer<typeof AuthSignOutResponseSchema>;
export type AuthProtectedResponse = z.infer<typeof AuthProtectedResponseSchema>;
