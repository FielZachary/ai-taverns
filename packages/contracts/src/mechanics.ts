import { z } from "zod";

export const SpellSlotLevelSchema = z.enum([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9"
]);

export const SpellSlotStateSchema = z.object({
  max: z.number().int().nonnegative(),
  used: z.number().int().nonnegative()
});

export const MechanicsSeedSchema = z.object({
  characterClass: z.string().min(1),
  level: z.number().int().positive(),
  maxHp: z.number().int().positive(),
  currentHp: z.number().int().nonnegative(),
  spellSlots: z.record(SpellSlotLevelSchema, SpellSlotStateSchema).optional()
});

export const MechanicsActorStateSchema = z.object({
  characterName: z.string(),
  currentHp: z.number().int().nonnegative().optional(),
  maxHp: z.number().int().nonnegative().optional(),
  armorClass: z.number().int().nonnegative().optional(),
  allegiance: z.enum(["player", "ally", "hostile", "neutral"]).optional(),
  isPlayerControlled: z.boolean().optional(),
  spellSlots: z.record(SpellSlotLevelSchema, SpellSlotStateSchema).optional(),
  concentration: z
    .object({
      spell: z.string().min(1),
      targets: z.array(z.string()),
      startedRound: z.number().int().nonnegative().optional(),
      durationRounds: z.number().int().positive().optional()
    })
    .nullable()
    .optional(),
  conditions: z.array(z.string()).optional()
});

export const MechanicsStateSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  combat: z.object({
    active: z.boolean(),
    round: z.number().int().nonnegative(),
    turnOwner: z.string().nullable(),
    initiativeOrder: z.array(z.string())
  }),
  actors: z.record(z.string(), MechanicsActorStateSchema)
});

export type SpellSlotLevel = z.infer<typeof SpellSlotLevelSchema>;
export type SpellSlotState = z.infer<typeof SpellSlotStateSchema>;
export type MechanicsSeed = z.infer<typeof MechanicsSeedSchema>;
export type MechanicsActorState = z.infer<typeof MechanicsActorStateSchema>;
export type MechanicsState = z.infer<typeof MechanicsStateSchema>;
