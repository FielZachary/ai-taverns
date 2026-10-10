import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listCampaignSummariesForUser, type DungeonMasterRuntime } from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

const stageSchema = z.enum(["opening_brief_planner", "opening_planner", "opening_narrator", "router", "scene_director", "npc_dialogue", "combat", "clarification"]);
const messageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().trim().min(1).max(60_000) });
const requestSchema = z.object({ action: z.enum(["baseline", "override"]), campaignId: z.string().trim().min(1).max(200), stage: stageSchema, messages: z.array(messageSchema).min(2).max(50) });

type DmLabRouteOptions = { config: ApiConfig; dmRuntime?: DungeonMasterRuntime | undefined };

function error(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }); }
function isDmLabEnabled(config: ApiConfig) { return config.nodeEnv !== "production" || process.env.DM_LAB_ENABLED === "true"; }
function responseFormat(stage: z.infer<typeof stageSchema>) { return stage === "opening_narrator" ? "text" as const : "json" as const; }
function fullRequest(messages: z.infer<typeof messageSchema>[]) { return messages.map((message, index) => `# ${index + 1}. ${message.role.toUpperCase()}\n${message.content}`).join("\n\n"); }
function validationFor(content: string, format: "json" | "text") {
  if (format === "text") {
    const paragraphs = content.trim().split(/\n\s*\n/).filter(Boolean);
    return { valid: paragraphs.length === 4 && paragraphs[3] === "What would you like to do?", details: [`Expected 4 paragraphs; received ${paragraphs.length}.`, `Required handoff present: ${paragraphs[3] === "What would you like to do?"}.`] };
  }
  try { JSON.parse(content); return { valid: true, details: ["Valid JSON response."] }; }
  catch { return { valid: false, details: ["Response is not valid JSON."] }; }
}

export async function registerDmLabRoutes(fastify: FastifyInstance, options: DmLabRouteOptions) {
  const runtime = options.dmRuntime ?? { askProvider: askDungeonMasterProvider };
  fastify.get("/internal/dm-lab/campaigns", async (request) => {
    if (!isDmLabEnabled(options.config)) throw error(404, "DM Lab is disabled.");
    const user = await requireAuthenticatedUser(fastify, options.config, request.cookies[options.config.authCookieName]);
    const campaigns = await listCampaignSummariesForUser(fastify.pg, user.id, 10);
    return { campaigns: campaigns.map((campaign) => ({ id: campaign.id, title: campaign.title, preview: campaign.preview ?? null, mode: campaign.mode })) };
  });
  fastify.post("/internal/dm-lab/compare", async (request) => {
    if (!isDmLabEnabled(options.config)) throw error(404, "DM Lab is disabled.");
    await requireAuthenticatedUser(fastify, options.config, request.cookies[options.config.authCookieName]);
    const body = requestSchema.parse(request.body);
    const first = body.messages[0];
    const last = body.messages.at(-1);
    if (first?.role !== "system" || last?.role !== "user") throw error(400, "The debug prompt must start with SYSTEM and end with USER.");
    const format = responseFormat(body.stage);
    const startedAt = Date.now();
    const provider = await runtime.askProvider({ instructions: first.content, message: last.content, requestMessages: body.messages, responseFormat: format });
    return {
      source: { file: "debug prompt", function: "captured provider request", gitRevision: "captured", campaignId: body.campaignId },
      fixture: `local campaign ${body.campaignId}`,
      stage: body.stage,
      action: body.action,
      request: { messages: body.messages, fullPrompt: fullRequest(body.messages) },
      result: { output: provider.content, validation: validationFor(provider.content, format), durationMs: Date.now() - startedAt, model: provider.debug.model ?? null }
    };
  });
}
