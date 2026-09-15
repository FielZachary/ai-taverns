import { z } from "zod";
import { CampaignModeSchema } from "./campaigns.js";

export const HookStageSchema = z.enum([
  "visitor",
  "activated",
  "engaged",
  "hooked"
]);

export const LifecycleSnapshotSchema = z.object({
  score: z.number().int().min(0).max(100),
  stage: HookStageSchema,
  qualifiedReturnDays: z.number().int().nonnegative(),
  hasQualifiedReturn7d: z.boolean(),
  isHooked: z.boolean()
});

const AnalyticsBasePropertiesSchema = z.object({
  source: z.enum(["web", "api"]),
  app: z.literal("ai-taverns"),
  schemaVersion: z.literal(1),
  distinctId: z.string().min(1),
  userId: z.string().min(1).optional(),
  guestId: z.string().min(1).optional(),
  playerId: z.string().min(1).optional(),
  campaignId: z.string().uuid().optional(),
  campaignMode: CampaignModeSchema.optional(),
  campaignGenre: z.string().min(1).optional(),
  campaignGenreKind: z.enum(["preset", "custom"]).optional(),
  campaignGenrePresetId: z.string().min(1).optional(),
  characterClass: z.string().min(1).optional(),
  characterSpecies: z.string().min(1).optional(),
  characterBuildMode: z.enum(["quick", "custom"]).optional(),
  lifecycleScore: z.number().int().min(0).max(100).optional(),
  lifecycleStage: HookStageSchema.optional(),
  qualifiedReturnDays: z.number().int().nonnegative().optional(),
  hasQualifiedReturn7d: z.boolean().optional(),
  // Attribution is captured in the browser on the first tagged landing page
  // and copied onto later product events. Keep the standard UTM names so
  // Mixpanel's built-in acquisition properties and reports continue to work.
  utm_source: z.string().min(1).optional(),
  utm_medium: z.string().min(1).optional(),
  utm_campaign: z.string().min(1).optional(),
  utm_content: z.string().min(1).optional(),
  utm_term: z.string().min(1).optional(),
  utm_id: z.string().min(1).optional(),
  utm_source_platform: z.string().min(1).optional(),
  utm_campaign_id: z.string().min(1).optional(),
  utm_creative_format: z.string().min(1).optional(),
  utm_marketing_tactic: z.string().min(1).optional(),
  click_id: z.string().min(1).optional(),
  initial_utm_source: z.string().min(1).optional(),
  initial_utm_medium: z.string().min(1).optional(),
  initial_utm_campaign: z.string().min(1).optional(),
  initial_utm_content: z.string().min(1).optional(),
  initial_utm_term: z.string().min(1).optional(),
  initial_utm_id: z.string().min(1).optional(),
  initial_click_id: z.string().min(1).optional(),
  landing_path: z.string().min(1).optional(),
  initial_landing_path: z.string().min(1).optional(),
  referrer_domain: z.string().min(1).optional(),
  initial_referrer_domain: z.string().min(1).optional(),
  attribution_captured_at: z.string().datetime().optional(),
  initial_attribution_captured_at: z.string().datetime().optional()
});

export const AnalyticsEventNameSchema = z.enum([
  "Landing Page Viewed",
  "Onboarding Started",
  "Onboarding Referral Source Selected",
  "Onboarding D&D Experience Selected",
  "User Signed In",
  "Campaign Mode Selected",
  "Multiplayer Intent Selected",
  "Campaign World Selected",
  "Custom World Completed",
  "Character Creation Started",
  "Character Step Completed",
  "Character Created",
  "Campaign Created",
  "Campaign Joined",
  "Campaign Invite Previewed",
  "Campaign Invite Created",
  "Campaign Invite Disabled",
  "Multiplayer Adventure Begun",
  "Campaign Loaded",
  "Initial Scene Viewed",
  "Campaign Switched",
  "Session Resumed",
  "Qualified Return",
  "First Player Message Sent",
  "Player Message Sent",
  "DM Response Received",
  "Dice Roll Queued",
  "Dice Roll Submitted",
  "Ask DM Submitted",
  "Regenerate Response Submitted",
  "Character Sheet Opened",
  "Player Resource Tab Opened",
  "Combat Cheat Sheet Generated",
  "NPC Card Updated",
  "Character Portrait Previewed",
  "Character Portrait Requested",
  "Character Portrait Uploaded",
  "Character Revived",
  "Campaign Restarted",
  "Lifecycle Stage Reached"
]);

export const AnalyticsEventSchema = z.object({
  name: AnalyticsEventNameSchema,
  properties: AnalyticsBasePropertiesSchema
    .extend({
      step: z.string().min(1).optional(),
      stepIndex: z.number().int().nonnegative().optional(),
      timeSpentSeconds: z.number().int().nonnegative().optional(),
      mode: CampaignModeSchema.optional(),
      multiplayerIntent: z.enum(["create", "join"]).optional(),
      joinSource: z.enum(["code", "invite"]).optional(),
      inviteUsed: z.boolean().optional(),
      hasBegun: z.boolean().optional(),
      availableSlots: z.number().int().nonnegative().optional(),
      campaignAgeHours: z.number().int().nonnegative().optional(),
      hasCustomWorld: z.boolean().optional(),
      customWorldName: z.string().min(1).optional(),
      customWorldDescriptionLength: z.number().int().nonnegative().optional(),
      hasEldermereStart: z.boolean().optional(),
      hasBackstory: z.boolean().optional(),
      hasPortrait: z.boolean().optional(),
      portraitSource: z.enum(["preview", "upload", "generated"]).optional(),
      spellCount: z.number().int().nonnegative().optional(),
      skillCount: z.number().int().nonnegative().optional(),
      equipmentCompleted: z.boolean().optional(),
      playerMessageCount: z.number().int().nonnegative().optional(),
      dmMessageCount: z.number().int().nonnegative().optional(),
      totalMessageCount: z.number().int().nonnegative().optional(),
      messageLength: z.number().int().nonnegative().optional(),
      minutesSinceCampaignCreated: z.number().int().nonnegative().optional(),
      hoursSinceFirstSeen: z.number().int().nonnegative().optional(),
      hoursSinceLastActivity: z.number().int().nonnegative().optional(),
      returnedAfterDays: z.number().int().nonnegative().optional(),
      turnNumber: z.number().int().nonnegative().optional(),
      model: z.string().min(1).optional(),
      skipTurn: z.boolean().optional(),
      hasDiceRequest: z.boolean().optional(),
      diceSubmissionCount: z.number().int().nonnegative().optional(),
      rollType: z.string().min(1).optional(),
      requestedByDm: z.boolean().optional(),
      combatActive: z.boolean().optional(),
      responseLatencyMs: z.number().int().nonnegative().optional(),
      responseType: z.string().min(1).optional(),
      hasStateChange: z.boolean().optional(),
      resourceTab: z.string().min(1).optional(),
      markdownLength: z.number().int().nonnegative().optional(),
      qualifiedReturnOrdinal: z.number().int().positive().optional(),
      lifecyclePreviousStage: HookStageSchema.optional(),
      lifecycleReason: z.enum([
        "campaign_ready",
        "meaningful_first_session",
        "qualified_return",
        "retention_gate"
      ]).optional()
    })
    .passthrough()
});

export type HookStage = z.infer<typeof HookStageSchema>;
/** @deprecated Legacy milestone labels are accepted only while callers migrate. */
export type HookMetric = string;
export type LifecycleSnapshot = z.infer<typeof LifecycleSnapshotSchema>;
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventProperties = AnalyticsEvent["properties"];
