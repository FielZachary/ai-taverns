import { z } from "zod";
import { MechanicsSeedSchema } from "./mechanics.js";

export const CampaignModeSchema = z.enum(["single_player", "multiplayer"]);

export const CampaignSummarySchema = z.object({
  id: z.string().uuid(),
  hermesSessionId: z.string().min(1),
  mode: CampaignModeSchema,
  title: z.string().min(1),
  preview: z.string().optional(),
  time: z.string().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  joinCode: z.string().min(1).optional()
});

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignSummarySchema)
});

export const CampaignCreateRequestSchema = z.object({
  mode: CampaignModeSchema.optional(),
  title: z.string().optional(),
  campaignGenre: z.string().optional(),
  campaignGenreKind: z.enum(["preset", "custom"]).optional(),
  campaignGenrePresetId: z.string().optional(),
  customWorldName: z.string().optional(),
  customWorldDescription: z.string().optional(),
  ownerClientId: z.string().optional(),
  playerName: z.string().optional(),
  characterName: z.string().optional(),
  characterSheet: z.string().optional(),
  mechanicsSeed: MechanicsSeedSchema.optional()
});

export const CampaignCreateResponseSchema = z.object({
  campaign: CampaignSummarySchema
});

export const CampaignReadParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const CampaignReadResponseSchema = z.object({
  campaign: CampaignSummarySchema
});

export const CampaignJoinPreviewRequestSchema = z.object({
  gameCode: z.string().optional()
});

export const CampaignJoinPreviewResponseSchema = z.object({
  code: z.string().min(1),
  campaignTitle: z.string().min(1),
  availableSlots: z.number().int().nonnegative(),
  hasBegun: z.boolean()
});

export const CampaignJoinRequestSchema = z.object({
  gameCode: z.string().optional(),
  clientId: z.string().optional(),
  username: z.string().optional(),
  characterName: z.string().optional(),
  characterSheet: z.string().optional(),
  mechanicsSeed: MechanicsSeedSchema.optional()
});

export const CampaignJoinResponseSchema = z.object({
  campaign: CampaignSummarySchema
});

export type CampaignMode = z.infer<typeof CampaignModeSchema>;
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export type CampaignListResponse = z.infer<typeof CampaignListResponseSchema>;
export type CampaignCreateRequest = z.infer<typeof CampaignCreateRequestSchema>;
export type CampaignCreateResponse = z.infer<
  typeof CampaignCreateResponseSchema
>;
export type CampaignReadParams = z.infer<typeof CampaignReadParamsSchema>;
export type CampaignReadResponse = z.infer<typeof CampaignReadResponseSchema>;
export type CampaignJoinPreviewRequest = z.infer<
  typeof CampaignJoinPreviewRequestSchema
>;
export type CampaignJoinPreviewResponse = z.infer<
  typeof CampaignJoinPreviewResponseSchema
>;
export type CampaignJoinRequest = z.infer<typeof CampaignJoinRequestSchema>;
export type CampaignJoinResponse = z.infer<typeof CampaignJoinResponseSchema>;
