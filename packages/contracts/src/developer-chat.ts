import { z } from "zod";

export const DeveloperChatMessageSchema = z.object({
  id: z.string().uuid(),
  senderRole: z.enum(["user", "developer"]),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
  authorEmail: z.string().email().optional(),
  authorCharacterName: z.string().optional()
});

export const DeveloperChatThreadSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  campaignTitle: z.string(),
  userEmail: z.string().email(),
  characterName: z.string().optional(),
  updatedAt: z.string().datetime(),
  unreadForUser: z.number().int().nonnegative(),
  unreadForDeveloper: z.number().int().nonnegative(),
  lastMessage: DeveloperChatMessageSchema.optional()
});

export const DeveloperChatSendRequestSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const DeveloperChatThreadResponseSchema = z.object({ thread: DeveloperChatThreadSchema, messages: z.array(DeveloperChatMessageSchema) });
export const DeveloperChatListResponseSchema = z.object({ threads: z.array(DeveloperChatThreadSchema) });
export const DeveloperChatUnreadResponseSchema = z.object({ unreadCount: z.number().int().nonnegative() });
export const DeveloperChatCampaignParamsSchema = z.object({ campaignId: z.string().uuid() });
export const DeveloperChatThreadParamsSchema = z.object({ threadId: z.string().uuid() });
