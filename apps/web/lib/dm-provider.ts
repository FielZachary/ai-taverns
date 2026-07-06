import type { AiDebugInfo, GameMessage } from "@/lib/game-types";

export type DungeonMasterProviderResponse = {
  id?: string;
  content: string;
  debug: AiDebugInfo;
};

export type DungeonMasterProviderInput = {
  message: string;
  instructions: string;
  history?: GameMessage[];
};

export function assertDungeonMasterProviderConfigured(): never {
  throw new Error(
    "The DM provider is owned by Fastify. Proxy requests to apps/api instead."
  );
}

export async function askDungeonMasterProvider(
  _input: DungeonMasterProviderInput
): Promise<DungeonMasterProviderResponse> {
  assertDungeonMasterProviderConfigured();
}
