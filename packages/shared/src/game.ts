export type GameMessageRole = "player" | "dm" | "system";
export type GameMessageKind = "turn" | "ask_dm_question" | "ask_dm_answer" | "campaign_summary";

export type GameMessage = {
  id: string;
  role: GameMessageRole;
  kind?: GameMessageKind;
  content: string;
  createdAt: string;
};

export type DiceRollRequest = {
  id: string;
  dice: string;
  label: string;
  player?: string;
  modifier?: number;
  reason?: string;
  targetDc?: number;
  advantageState?: string;
  combat?: {
    actionId?: string;
    actorKey?: string;
    targetActorKey?: string;
    kind?: string;
    attackName?: string;
    sequence?: number;
    sourceAttackRollId?: string;
    damageType?: string;
    onHitDamage?: {
      dice?: string;
      modifier?: number;
      damageType?: string;
    };
  };
};

export type SessionState = {
  campaignTitle: string;
  location: string;
  partyLevel: number;
  messages: GameMessage[];
};
