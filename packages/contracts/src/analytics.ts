import { z } from "zod";
import { CampaignModeSchema } from "./campaigns.js";

export const HookStageSchema = z.enum([
  "visitor",
  "activated",
  "engaged",
  "hooked"
]);

export const HookMetricSchema = z.enum([
  "campaign_created_or_joined",
  "character_completed",
  "portrait_added",
  "first_player_message",
  "five_player_messages",
  "five_dm_responses",
  "returned_after_24h",
  "returned_after_7d",
  "used_player_resources",
  "dice_submitted",
  "asked_dm",
  "regenerated_response",
  "multiplayer_invite_created",
  "multiplayer_adventure_begun"
]);

export const HookScoreDeltaSchema = z.object({
  metric: HookMetricSchema,
  points: z.number().int()
});

export const HookSnapshotSchema = z.object({
  score: z.number().int().min(0).max(100),
  stage: HookStageSchema,
  deltas: z.array(HookScoreDeltaSchema),
  isHooked: z.boolean()
});

const AnalyticsBasePropertiesSchema = z.object({
  source: z.enum(["web", "api"]),
  app: z.literal("ai-taverns"),
  schemaVersion: z.literal(1),
  distinctId: z.string().min(1),
  userId: z.string().min(1).optional(),
  guestId: z.string().min(1).optional(),
  campaignId: z.string().uuid().optional(),
  campaignMode: CampaignModeSchema.optional(),
  campaignGenre: z.string().min(1).optional(),
  campaignGenreKind: z.enum(["preset", "custom"]).optional(),
  campaignGenrePresetId: z.string().min(1).optional(),
  characterClass: z.string().min(1).optional(),
  characterSpecies: z.string().min(1).optional(),
  characterBuildMode: z.enum(["quick", "custom"]).optional(),
  hookScore: z.number().int().min(0).max(100).optional(),
  hookStage: HookStageSchema.optional(),
  isHooked: z.boolean().optional()
});

export const AnalyticsEventNameSchema = z.enum([
  "Onboarding Started",
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
  "Campaign Switched",
  "Session Resumed",
  "Campaign Returned After 24h",
  "Campaign Returned After 7d",
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
  "Campaign Restarted",
  "Hook Milestone Reached"
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
      hookDeltas: z.array(HookScoreDeltaSchema).optional(),
      hookMilestone: HookMetricSchema.optional()
    })
    .passthrough()
});

export type HookStage = z.infer<typeof HookStageSchema>;
export type HookMetric = z.infer<typeof HookMetricSchema>;
export type HookScoreDelta = z.infer<typeof HookScoreDeltaSchema>;
export type HookSnapshot = z.infer<typeof HookSnapshotSchema>;
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventProperties = AnalyticsEvent["properties"];

const hookMetricPoints: Record<HookMetric, number> = {
  campaign_created_or_joined: 15,
  character_completed: 15,
  portrait_added: 10,
  first_player_message: 15,
  five_player_messages: 20,
  five_dm_responses: 10,
  returned_after_24h: 15,
  returned_after_7d: 15,
  used_player_resources: 10,
  dice_submitted: 5,
  asked_dm: 5,
  regenerated_response: 5,
  multiplayer_invite_created: 5,
  multiplayer_adventure_begun: 10
};

export function hookStageForScore(score: number): HookStage {
  if (score >= 75) {
    return "hooked";
  }

  if (score >= 50) {
    return "engaged";
  }

  if (score >= 25) {
    return "activated";
  }

  return "visitor";
}

export function hookSnapshotForMetrics(metrics: Iterable<HookMetric>): HookSnapshot {
  const seenMetrics = new Set(metrics);
  const deltas = Array.from(seenMetrics).map((metric) => ({
    metric,
    points: hookMetricPoints[metric]
  }));
  const score = Math.min(
    100,
    deltas.reduce((total, delta) => total + delta.points, 0)
  );
  const stage = hookStageForScore(score);

  return {
    score,
    stage,
    deltas,
    isHooked: stage === "hooked"
  };
}

export function hookPointsForMetric(metric: HookMetric): number {
  return hookMetricPoints[metric];
}
