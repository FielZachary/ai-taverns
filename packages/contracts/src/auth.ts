import { z } from "zod";

export const AuthEmailSchema = z.string().trim().toLowerCase().email();

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).nullable(),
  onboardingCompletedAt: z.string().datetime().nullable()
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
    session: AuthSessionSchema,
    isNewUser: z.boolean().optional()
  })
]);

export const AuthPasswordlessStartRequestSchema = z.object({
  email: AuthEmailSchema,
  displayName: z.string().trim().min(1).max(120).optional(),
  nextPath: z.string().trim().regex(/^\/(?!\/)/).max(200).optional()
});

export const AuthPasswordlessStartResponseSchema = z.object({
  ok: z.literal(true),
  expiresAt: z.string().datetime(),
  loginToken: z.string().min(32).optional(),
  loginUrl: z.string().url().optional()
});

export const AuthPasswordlessVerifyRequestSchema = z.object({
  token: z.string().min(32)
});

export const AuthSignOutResponseSchema = z.object({
  ok: z.literal(true)
});

export const AuthClaimGuestStateRequestSchema = z.object({
  clientId: z.string().trim().min(1)
});

export const AuthClaimGuestStateResponseSchema = z.object({
  claimedCampaigns: z.number().int().nonnegative(),
  claimedPlayers: z.number().int().nonnegative()
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
export type AuthClaimGuestStateRequest = z.infer<
  typeof AuthClaimGuestStateRequestSchema
>;
export type AuthClaimGuestStateResponse = z.infer<
  typeof AuthClaimGuestStateResponseSchema
>;
export type AuthProtectedResponse = z.infer<typeof AuthProtectedResponseSchema>;
