import { z } from "zod";

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

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
