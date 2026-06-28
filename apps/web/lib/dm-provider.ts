import type { GameMessage } from "@/lib/game-types";

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const deepSeekBaseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/+$/, "");
const deepSeekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatResponse = {
  id?: string;
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
};

export type DungeonMasterProviderResponse = {
  id?: string;
  content: string;
};

export type DungeonMasterProviderInput = {
  message: string;
  instructions: string;
  history?: GameMessage[];
};

export function assertDungeonMasterProviderConfigured() {
  if (!deepSeekApiKey) {
    throw new Error("DeepSeek is not configured. Set DEEPSEEK_API_KEY.");
  }

  try {
    new URL(deepSeekBaseUrl);
  } catch {
    throw new Error("DeepSeek is not configured with a valid DEEPSEEK_BASE_URL.");
  }
}

function mapHistoryMessage(message: GameMessage): DeepSeekMessage {
  return {
    role: message.role === "player" ? "user" : "assistant",
    content: message.content
  };
}

export async function askDungeonMasterProvider({
  message,
  instructions,
  history = []
}: DungeonMasterProviderInput): Promise<DungeonMasterProviderResponse> {
  assertDungeonMasterProviderConfigured();

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: instructions
    },
    ...history
      .filter((historyMessage) => historyMessage.content.trim())
      .map(mapHistoryMessage),
    {
      role: "user",
      content: message
    }
  ];

  let response: Response;

  try {
    response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: JSON.stringify({
        model: deepSeekModel,
        messages,
        response_format: {
          type: "json_object"
        }
      }),
      signal: AbortSignal.timeout(175_000)
    });
  } catch (error) {
    throw new Error(
      `DeepSeek could not be reached. ${
        error instanceof Error ? error.message : "Network request failed."
      }`
    );
  }

  const data = (await response.json().catch(() => ({}))) as DeepSeekChatResponse;

  if (!response.ok) {
    throw new Error(
      `DeepSeek turn failed with status ${response.status}. ${
        data.error?.message ?? ""
      }`.trim()
    );
  }

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("DeepSeek returned an empty reply.");
  }

  return {
    id: data.id,
    content
  };
}
