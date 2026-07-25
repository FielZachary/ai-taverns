import { z } from "zod";
import { DiceRollRequestSchema, NextInputNeededSchema } from "./rooms.js";

export const DmProviderGameMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["player", "dm", "system"]),
    kind: z.enum(["turn", "ask_dm_question", "ask_dm_answer"]).optional(),
    content: z.string(),
    createdAt: z.string().datetime()
  })
  .passthrough();

export const DmProviderTurnRequestSchema = z.object({
  message: z.string().optional(),
  history: z.array(DmProviderGameMessageSchema).optional(),
  sessionId: z.string().optional()
});

export const DmProviderPrepRequestSchema = z.object({
  sessionId: z.string().optional(),
  ownerClientId: z.string().optional()
});

export const DmProviderTurnResponseSchema = z.object({
  message: DmProviderGameMessageSchema,
  pendingRollRequest: DiceRollRequestSchema.nullable().optional(),
  pendingRollRequests: z.array(DiceRollRequestSchema).optional(),
  nextInputNeeded: NextInputNeededSchema.optional(),
  inputTargets: z.array(z.string()).optional(),
  inputPolicy: z.enum(["all_players", "only_targeted_players"]).optional()
});

export type DmProviderGameMessage = z.infer<typeof DmProviderGameMessageSchema>;
export type DmProviderTurnRequest = z.infer<typeof DmProviderTurnRequestSchema>;
export type DmProviderPrepRequest = z.infer<typeof DmProviderPrepRequestSchema>;
export type DmProviderTurnResponse = z.infer<typeof DmProviderTurnResponseSchema>;
