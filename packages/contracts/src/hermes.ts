import { z } from "zod";
import { DiceRollRequestSchema } from "./rooms.js";

export const HermesGameMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["player", "dm", "system"]),
    kind: z.enum(["turn", "ask_dm_question", "ask_dm_answer"]).optional(),
    content: z.string(),
    createdAt: z.string().datetime()
  })
  .passthrough();

export const HermesTurnRequestSchema = z.object({
  message: z.string().optional(),
  history: z.array(HermesGameMessageSchema).optional(),
  sessionId: z.string().optional()
});

export const HermesPrepRequestSchema = z.object({
  sessionId: z.string().optional(),
  ownerClientId: z.string().optional()
});

export const HermesTurnResponseSchema = z.object({
  message: HermesGameMessageSchema,
  pendingRollRequest: DiceRollRequestSchema.nullable().optional(),
  pendingRollRequests: z.array(DiceRollRequestSchema).optional(),
  inputTargets: z.array(z.string()).optional(),
  inputPolicy: z.enum(["all_players", "only_targeted_players"]).optional()
});

export type HermesGameMessage = z.infer<typeof HermesGameMessageSchema>;
export type HermesTurnRequest = z.infer<typeof HermesTurnRequestSchema>;
export type HermesPrepRequest = z.infer<typeof HermesPrepRequestSchema>;
export type HermesTurnResponse = z.infer<typeof HermesTurnResponseSchema>;
