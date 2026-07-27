import { z } from "zod";
import { MechanicsSeedSchema } from "./mechanics.js";

export const CampaignModeSchema = z.enum(["single_player", "multiplayer"]);

export const CampaignSummarySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().min(1),
  mode: CampaignModeSchema,
  title: z.string().min(1),
  ownerClientId: z.string().optional(),
  portraitAssetId: z.string().uuid().optional(),
  portraitUrl: z.string().min(1).optional(),
  preview: z.string().optional(),
  time: z.string().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  joinCode: z.string().min(1).optional()
});

export const CampaignListResponseSchema = z.object({
  campaigns: z.array(CampaignSummarySchema)
});

export const EldermereCampaignStartSchema = z.object({
  regionName: z.string().min(1),
  settlementName: z.string().min(1),
  reason: z.string().optional()
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
  mechanicsSeed: MechanicsSeedSchema.optional(),
  eldermereStart: EldermereCampaignStartSchema.optional(),
  generateCharacterPortrait: z.boolean().optional()
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

export const CharacterPortraitArtStyleSchema = z.enum([
  "painterly_fantasy",
  "storybook_illustration",
  "ink_and_watercolor",
  "cinematic_concept_art"
]);

export const CharacterPortraitImageModelSchema = z.enum(["qwen"]);

export const CharacterPortraitGenerateParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const CharacterPortraitGenerateRequestSchema = z.object({
  guidelines: z.string().optional(),
  artStyle: CharacterPortraitArtStyleSchema.optional(),
  imageModel: CharacterPortraitImageModelSchema.optional()
});

export const CharacterPortraitPreviewRequestSchema = z.object({
  characterName: z.string().optional(),
  playerName: z.string().optional(),
  characterSheet: z.string().optional(),
  campaignGenre: z.string().optional(),
  customWorldName: z.string().optional(),
  guidelines: z.string().optional(),
  artStyle: CharacterPortraitArtStyleSchema.optional(),
  imageModel: CharacterPortraitImageModelSchema.optional()
});

export const CharacterPortraitPreviewResponseSchema = z.object({
  imageDataUrl: z.string().min(1),
  contentType: z.string().min(1)
});

export const CharacterBackstoryModeSchema = z.enum(["generate", "add_details"]);

export const CharacterBackstoryGenerateRequestSchema = z.object({
  mode: CharacterBackstoryModeSchema,
  characterSheet: z.string().min(1),
  currentBackstory: z.string().optional(),
  campaignGenre: z.string().optional(),
  campaignGenreKind: z.enum(["preset", "custom"]).optional(),
  campaignGenrePresetId: z.string().optional(),
  customWorldName: z.string().optional(),
  customWorldDescription: z.string().optional()
});

export const CharacterBackstoryGenerateResponseSchema = z.object({
  backstory: z.string().min(1),
  eldermereStart: EldermereCampaignStartSchema.optional()
});

export const CharacterPortraitUploadParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const CharacterPortraitUploadRequestSchema = z.object({
  imageDataUrl: z.string().min(1),
  fileName: z.string().optional(),
  guidelines: z.string().optional(),
  artStyle: CharacterPortraitArtStyleSchema.optional()
});

export const CharacterPortraitResponseSchema = z.object({
  campaign: CampaignSummarySchema
});

export const CampaignNpcCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  markdown: z.string(),
  updatedAt: z.string().datetime().optional()
});

export const CampaignNpcCardsResponseSchema = z.object({
  npcCards: z.array(CampaignNpcCardSchema)
});

export const CampaignNpcCardUpdateParamsSchema = z.object({
  campaignId: z.string().uuid(),
  npcCardId: z.string().min(1)
});

export const CampaignNpcCardUpdateRequestSchema = z.object({
  markdown: z.string().min(1)
});

export const CampaignNpcCardUpdateResponseSchema = z.object({
  npcCard: CampaignNpcCardSchema
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

export const CampaignInviteSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  enabled: z.boolean(),
  maxUses: z.number().int().positive().nullable(),
  useCount: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  disabledAt: z.string().datetime().nullable()
});

export const CampaignInviteCreateRequestSchema = z.object({
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

export const CampaignInviteCreateParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const CampaignInviteListParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const CampaignInviteDisableParamsSchema = z.object({
  campaignId: z.string().uuid(),
  inviteId: z.string().uuid()
});

export const CampaignInviteCreateResponseSchema = z.object({
  invite: CampaignInviteSchema.extend({
    token: z.string().min(16)
  })
});

export const CampaignInviteListResponseSchema = z.object({
  invites: z.array(CampaignInviteSchema)
});

export const CampaignInviteDisableResponseSchema = z.object({
  invite: CampaignInviteSchema
});

export const LobbyInvitePreviewParamsSchema = z.object({
  token: z.string().min(16)
});

export const LobbyInviteJoinParamsSchema = z.object({
  token: z.string().min(16)
});

export const LobbyInvitePreviewResponseSchema = z.object({
  campaignTitle: z.string().min(1),
  availableSlots: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable()
});

export const LobbyInviteJoinRequestSchema = z.object({
  clientId: z.string().optional(),
  username: z.string().optional(),
  characterName: z.string().optional(),
  characterSheet: z.string().optional(),
  mechanicsSeed: MechanicsSeedSchema.optional()
});

export const LobbyInviteJoinResponseSchema = z.object({
  campaign: CampaignSummarySchema
});

export type CampaignMode = z.infer<typeof CampaignModeSchema>;
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export type CampaignListResponse = z.infer<typeof CampaignListResponseSchema>;
export type EldermereCampaignStart = z.infer<
  typeof EldermereCampaignStartSchema
>;
export type CampaignCreateRequest = z.infer<typeof CampaignCreateRequestSchema>;
export type CampaignCreateResponse = z.infer<
  typeof CampaignCreateResponseSchema
>;
export type CampaignReadParams = z.infer<typeof CampaignReadParamsSchema>;
export type CampaignReadResponse = z.infer<typeof CampaignReadResponseSchema>;
export type CharacterPortraitArtStyle = z.infer<
  typeof CharacterPortraitArtStyleSchema
>;
export type CharacterPortraitImageModel = z.infer<
  typeof CharacterPortraitImageModelSchema
>;
export type CharacterPortraitGenerateRequest = z.infer<
  typeof CharacterPortraitGenerateRequestSchema
>;
export type CharacterPortraitPreviewRequest = z.infer<
  typeof CharacterPortraitPreviewRequestSchema
>;
export type CharacterPortraitPreviewResponse = z.infer<
  typeof CharacterPortraitPreviewResponseSchema
>;
export type CharacterBackstoryGenerateRequest = z.infer<
  typeof CharacterBackstoryGenerateRequestSchema
>;
export type CharacterBackstoryGenerateResponse = z.infer<
  typeof CharacterBackstoryGenerateResponseSchema
>;
export type CharacterPortraitUploadRequest = z.infer<
  typeof CharacterPortraitUploadRequestSchema
>;
export type CharacterPortraitResponse = z.infer<
  typeof CharacterPortraitResponseSchema
>;
export type CampaignNpcCard = z.infer<typeof CampaignNpcCardSchema>;
export type CampaignNpcCardsResponse = z.infer<
  typeof CampaignNpcCardsResponseSchema
>;
export type CampaignNpcCardUpdateRequest = z.infer<
  typeof CampaignNpcCardUpdateRequestSchema
>;
export type CampaignNpcCardUpdateResponse = z.infer<
  typeof CampaignNpcCardUpdateResponseSchema
>;
export type CampaignJoinPreviewRequest = z.infer<
  typeof CampaignJoinPreviewRequestSchema
>;
export type CampaignJoinPreviewResponse = z.infer<
  typeof CampaignJoinPreviewResponseSchema
>;
export type CampaignJoinRequest = z.infer<typeof CampaignJoinRequestSchema>;
export type CampaignJoinResponse = z.infer<typeof CampaignJoinResponseSchema>;
export type CampaignInvite = z.infer<typeof CampaignInviteSchema>;
export type CampaignInviteCreateRequest = z.infer<
  typeof CampaignInviteCreateRequestSchema
>;
export type CampaignInviteCreateResponse = z.infer<
  typeof CampaignInviteCreateResponseSchema
>;
export type CampaignInviteListResponse = z.infer<
  typeof CampaignInviteListResponseSchema
>;
export type CampaignInviteDisableResponse = z.infer<
  typeof CampaignInviteDisableResponseSchema
>;
export type LobbyInvitePreviewResponse = z.infer<
  typeof LobbyInvitePreviewResponseSchema
>;
export type LobbyInviteJoinRequest = z.infer<typeof LobbyInviteJoinRequestSchema>;
export type LobbyInviteJoinResponse = z.infer<typeof LobbyInviteJoinResponseSchema>;
