import { z } from "zod";
import { CampaignModeSchema } from "./campaigns.js";

export const DiceRollResultSchema = z.object({
  rolls: z.array(z.number().int().positive()),
  total: z.number().int()
});

export const DiceRollRequestSchema = z
  .object({
    id: z.string().min(1).optional(),
    player: z.string().optional(),
    dice: z.string().min(1),
    modifier: z.number().int().optional(),
    label: z.string().min(1),
    reason: z.string().optional(),
    advantageState: z.enum(["normal", "advantage", "disadvantage"]).optional(),
    advantage_state: z.enum(["normal", "advantage", "disadvantage"]).optional()
  })
  .passthrough();

export const DiceRollSubmissionSchema = z.object({
  rollRequestId: z.string().min(1),
  rollResult: DiceRollResultSchema.optional(),
  clientMessageId: z.string().optional()
});

export const RoomPlayerSchema = z.object({
  id: z.string().min(1),
  slot: z.number().int().nonnegative(),
  username: z.string(),
  characterName: z.string(),
  characterSheet: z.string(),
  status: z.enum(["waiting", "submitted"]),
  lastSeenAt: z.string().datetime()
});

export const RoomMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["player", "dm"]),
    kind: z.string().optional(),
    content: z.string(),
    createdAt: z.string().datetime()
  })
  .passthrough();

export const RoomSnapshotSchema = z.object({
  roomId: z.string().uuid(),
  mode: CampaignModeSchema,
  sessionId: z.string().min(1),
  players: z.array(RoomPlayerSchema),
  messages: z.array(RoomMessageSchema),
  isResolving: z.boolean(),
  hasBegun: z.boolean(),
  pendingRollRequest: DiceRollRequestSchema.nullable(),
  pendingRollRequests: z.array(DiceRollRequestSchema),
  inputTargets: z.array(z.string()),
  inputPolicy: z.enum(["all_players", "only_targeted_players"]),
  updatedAt: z.string().datetime()
});

export const RoomReadQuerySchema = z.object({
  roomId: z.string().optional(),
  sessionId: z.string().optional()
});

export const RoomPlayerUpdateRequestSchema = z.object({
  roomId: z.string().optional(),
  sessionId: z.string().optional(),
  playerId: z.string().optional(),
  username: z.string().optional(),
  characterName: z.string().optional(),
  characterSheet: z.string().optional()
});

export const RoomBeginRequestSchema = z.object({
  roomId: z.string().optional(),
  sessionId: z.string().optional()
});

export const RoomSubmitRequestSchema = z.object({
  roomId: z.string().optional(),
  sessionId: z.string().optional(),
  playerId: z.string().optional(),
  message: z.string().optional(),
  rollRequestId: z.string().optional(),
  rollResult: DiceRollResultSchema.optional(),
  clientMessageId: z.string().optional(),
  rollSubmissions: z.array(DiceRollSubmissionSchema).optional()
});

export const RoomReadResponseSchema = RoomSnapshotSchema;
export const RoomPlayerUpdateResponseSchema = RoomSnapshotSchema;
export const RoomBeginResponseSchema = RoomSnapshotSchema;
export const RoomSubmitResponseSchema = RoomSnapshotSchema;

export const RoomRealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room_updated"),
    roomId: z.string().min(1),
    updatedAt: z.string().datetime(),
    eventId: z.string().min(1).optional()
  }),
  z.object({
    type: z.literal("room_snapshot"),
    roomId: z.string().min(1),
    snapshot: RoomSnapshotSchema
  }),
  z.object({
    type: z.literal("heartbeat"),
    sentAt: z.string().datetime()
  }),
  z.object({
    type: z.literal("error"),
    message: z.string().min(1)
  })
]);

export const DmStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dm_stream_started"),
    roomId: z.string().min(1),
    turnId: z.string().min(1)
  }),
  z.object({
    type: z.literal("dm_stream_delta"),
    roomId: z.string().min(1),
    turnId: z.string().min(1),
    text: z.string()
  }),
  z.object({
    type: z.literal("dm_stream_done"),
    roomId: z.string().min(1),
    turnId: z.string().min(1),
    messageId: z.string().min(1)
  }),
  z.object({
    type: z.literal("dm_stream_failed"),
    roomId: z.string().min(1),
    turnId: z.string().min(1),
    message: z.string().min(1)
  })
]);

export const RoomSocketEventSchema = z.union([
  RoomRealtimeEventSchema,
  DmStreamEventSchema
]);

export type DiceRollRequest = z.infer<typeof DiceRollRequestSchema>;
export type DiceRollResult = z.infer<typeof DiceRollResultSchema>;
export type DiceRollSubmission = z.infer<typeof DiceRollSubmissionSchema>;
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export type RoomReadQuery = z.infer<typeof RoomReadQuerySchema>;
export type RoomPlayerUpdateRequest = z.infer<
  typeof RoomPlayerUpdateRequestSchema
>;
export type RoomBeginRequest = z.infer<typeof RoomBeginRequestSchema>;
export type RoomSubmitRequest = z.infer<typeof RoomSubmitRequestSchema>;
export type RoomRealtimeEvent = z.infer<typeof RoomRealtimeEventSchema>;
export type DmStreamEvent = z.infer<typeof DmStreamEventSchema>;
export type RoomSocketEvent = z.infer<typeof RoomSocketEventSchema>;
