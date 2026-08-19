import { z } from "zod";

export const SUBSCRIPTION_TIERS = { FREE: 1, STARTER: 2, PRO: 3, LEGEND: 4 } as const;
export type SubscriptionTierId = (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];
export const USAGE_RESOURCE_TYPES = ["dm_turn", "image_generation", "active_campaign", "campaign_creation"] as const;
export type UsageResourceType = (typeof USAGE_RESOURCE_TYPES)[number];
export const UsageResourceTypeSchema = z.enum(USAGE_RESOURCE_TYPES);
export const UsageLimitSchema = z.object({ period: z.enum(["month", "none"]), limit: z.number().int().nonnegative().nullable() });

export const SUBSCRIPTION_TIER_ENTITLEMENTS = {
  1: { code: "free", displayName: "Free", limits: { dm_turn: { period: "month", limit: 10 }, image_generation: { period: "month", limit: 5 }, active_campaign: { period: "none", limit: 5 }, campaign_creation: { period: "month", limit: 5 } } },
  2: { code: "starter", displayName: "Starter", limits: { dm_turn: { period: "month", limit: null }, image_generation: { period: "month", limit: 20 }, active_campaign: { period: "none", limit: 20 }, campaign_creation: { period: "month", limit: 20 } } },
  3: { code: "pro", displayName: "Pro", limits: { dm_turn: { period: "month", limit: null }, image_generation: { period: "month", limit: 40 }, active_campaign: { period: "none", limit: 40 }, campaign_creation: { period: "month", limit: 40 } } },
  4: { code: "legend", displayName: "Legend", limits: { dm_turn: { period: "month", limit: null }, image_generation: { period: "month", limit: null }, active_campaign: { period: "none", limit: null }, campaign_creation: { period: "month", limit: null } } }
} as const satisfies Record<number, { code: string; displayName: string; limits: Record<UsageResourceType, { period: "month" | "none"; limit: number | null }> }>;

export function entitlementForTier(tierId: number) {
  const entitlement = SUBSCRIPTION_TIER_ENTITLEMENTS[tierId as keyof typeof SUBSCRIPTION_TIER_ENTITLEMENTS];
  if (!entitlement) throw new Error(`Unknown subscription tier id: ${tierId}`);
  return entitlement;
}

const UsageValueSchema = z.object({ used: z.number().int().nonnegative(), inFlight: z.number().int().nonnegative() });
export const UserUsageSummarySchema = z.object({
  tier: z.object({ id: z.number().int().positive(), code: z.string(), displayName: z.string() }),
  limits: z.object({ dm_turn: UsageLimitSchema, image_generation: UsageLimitSchema, active_campaign: UsageLimitSchema, campaign_creation: UsageLimitSchema }),
  usage: z.object({ dm_turn: UsageValueSchema, image_generation: UsageValueSchema, active_campaign: UsageValueSchema, campaign_creation: UsageValueSchema }),
  remaining: z.object({ dm_turn: z.number().int().nonnegative().nullable(), image_generation: z.number().int().nonnegative().nullable(), active_campaign: z.number().int().nonnegative().nullable(), campaign_creation: z.number().int().nonnegative().nullable() }),
  periods: z.object({ dm_turn: z.object({ start: z.string(), resetAt: z.string() }), image_generation: z.object({ start: z.string(), resetAt: z.string() }), campaign_creation: z.object({ start: z.string(), resetAt: z.string() }) })
});
export type UserUsageSummary = z.infer<typeof UserUsageSummarySchema>;
export const AccountUsageResponseSchema = UserUsageSummarySchema;
