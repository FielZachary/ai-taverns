import { z } from "zod";

export const AiModelIdSchema = z.enum([
  "deepseek-v4-flash",
  "qwen-3-5-plus"
]);

export type AiModelId = z.infer<typeof AiModelIdSchema>;
