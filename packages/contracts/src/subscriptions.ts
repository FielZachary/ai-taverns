import { z } from "zod";

export const SubscriptionTierSchema = z.enum(["free", "premium", "prestige"]);
export const QuotaResourceSchema = z.enum([
  "dm_turn",
  "image_generation",
  "campaign_creation",
  "active_campaign"
]);

export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;
export type QuotaResource = z.infer<typeof QuotaResourceSchema>;

export type SubscriptionTierLimits = Record<QuotaResource, number | null>;

export const subscriptionTierLimits = {
  free: {
    dm_turn: 100,
    image_generation: 10,
    campaign_creation: 3,
    active_campaign: 1
  },
  premium: {
    dm_turn: 1000,
    image_generation: 100,
    campaign_creation: 30,
    active_campaign: 10
  },
  prestige: {
    dm_turn: null,
    image_generation: null,
    campaign_creation: null,
    active_campaign: null
  }
} as const satisfies Record<SubscriptionTier, SubscriptionTierLimits>;

export const QuotaUsageResourceSchema = z.object({
  resource: QuotaResourceSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
  resetAt: z.string().datetime().nullable()
});

export const AccountUsageResponseSchema = z.object({
  subscriptionTier: SubscriptionTierSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  resources: z.record(QuotaResourceSchema, QuotaUsageResourceSchema)
});

export type QuotaUsageResource = z.infer<typeof QuotaUsageResourceSchema>;
export type AccountUsageResponse = z.infer<typeof AccountUsageResponseSchema>;
