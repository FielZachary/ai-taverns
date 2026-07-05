import { z } from "zod";
import {
  DiceRollResultSchema,
  DiceRollSubmissionSchema,
  RoomSnapshotSchema
} from "./rooms.js";

export const CampaignSoloTurnRequestSchema = z.object({
  message: z.string().optional(),
  rollRequestId: z.string().optional(),
  rollResult: DiceRollResultSchema.optional(),
  clientMessageId: z.string().optional(),
  rollSubmissions: z.array(DiceRollSubmissionSchema).optional()
});

export const CampaignAskDmRequestSchema = z.object({
  question: z.string().optional(),
  clientMessageId: z.string().optional()
});

export const CampaignRegenerateRequestSchema = z.object({
  messageId: z.string().optional()
});

export const CampaignDebugTracesQuerySchema = z.object({
  traceId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

export const CampaignDebugTraceSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime()
  })
  .passthrough();

export const CampaignSoloTurnResponseSchema = RoomSnapshotSchema;
export const CampaignAskDmResponseSchema = RoomSnapshotSchema;
export const CampaignRegenerateResponseSchema = RoomSnapshotSchema;
export const CampaignDebugTracesResponseSchema = z.object({
  traces: z.array(CampaignDebugTraceSchema)
});

export type CampaignSoloTurnRequest = z.infer<
  typeof CampaignSoloTurnRequestSchema
>;
export type CampaignAskDmRequest = z.infer<typeof CampaignAskDmRequestSchema>;
export type CampaignRegenerateRequest = z.infer<
  typeof CampaignRegenerateRequestSchema
>;
export type CampaignDebugTracesQuery = z.infer<
  typeof CampaignDebugTracesQuerySchema
>;
export type CampaignDebugTrace = z.infer<typeof CampaignDebugTraceSchema>;
export type CampaignDebugTracesResponse = z.infer<
  typeof CampaignDebugTracesResponseSchema
>;
