export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type UserId = Brand<string, "UserId">;
export type SessionId = Brand<string, "SessionId">;
export type CampaignId = Brand<string, "CampaignId">;
export type RoomId = Brand<string, "RoomId">;
export type PlayerId = Brand<string, "PlayerId">;
export type TurnId = Brand<string, "TurnId">;
export type MessageId = Brand<string, "MessageId">;

export type Campaign = {
  id: CampaignId;
  ownerUserId: UserId | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Room = {
  id: RoomId;
  campaignId: CampaignId;
  status: "lobby" | "active" | "resolving" | "complete";
  createdAt: Date;
  updatedAt: Date;
};

export type Player = {
  id: PlayerId;
  roomId: RoomId;
  userId: UserId | null;
  displayName: string;
};

export type GameMessage = {
  id: MessageId;
  campaignId: CampaignId;
  role: "player" | "dm" | "system";
  kind?: "turn" | "ask_dm_question" | "ask_dm_answer";
  playerName?: string;
  characterName?: string;
  content: string;
  createdAt: Date;
};

export type DiceRollRequest = {
  id: string;
  dice: string;
  label: string;
  player?: string;
  modifier?: number;
  advantageState?: string;
};

export type DiceRollSubmission = {
  requestId: string;
  total: number;
  rolls: number[];
  modifier?: number;
};

export type AuthSession = {
  id: SessionId;
  userId: UserId;
  expiresAt: Date;
  revokedAt: Date | null;
};
