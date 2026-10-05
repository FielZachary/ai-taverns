import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listCampaignSummariesForUser, type DungeonMasterRuntime } from "@ai-dnd/db";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

const stageSchema = z.enum(["opening_brief_planner", "opening_planner", "opening_narrator", "router", "scene_director", "investigation", "npc_dialogue", "combat", "clarification"]);
const packetSchema = z.object({
  version: z.literal(1),
  source: z.object({
    campaignId: z.string().trim().min(1).max(200),
    stage: stageSchema,
    gitRevision: z.string().trim().min(1).max(200),
    sourceFile: z.string().trim().min(1).max(500),
    sourceFunction: z.string().trim().min(1).max(300),
    turnId: z.string().trim().min(1).max(200).optional()
  }),
  request: z.object({
    instructions: z.string().trim().min(1).max(30_000),
    message: z.string().trim().min(1).max(60_000)
  })
});
const requestSchema = z.object({
  action: z.enum(["baseline", "override"]),
  packet: packetSchema,
  overrideInstructions: z.string().max(30_000).optional(),
  overrideMessage: z.string().max(60_000).optional()
});

type DmLabRouteOptions = { config: ApiConfig; dmRuntime?: DungeonMasterRuntime | undefined };
function error(statusCode: number, message: string) { return Object.assign(new Error(message), { statusCode }); }
function isDmLabEnabled(config: ApiConfig) { return config.nodeEnv !== "production" || process.env.DM_LAB_ENABLED === "true"; }
function responseFormat(stage: z.infer<typeof stageSchema>) { return stage === "opening_narrator" ? "text" as const : "json" as const; }
function fullRequest(instructions: string, message: string) { return ["SYSTEM INSTRUCTIONS", instructions, "", "USER / FIXTURE MESSAGE", message].join("\n"); }
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
    const { packet } = body;
    const instructions = body.action === "baseline" ? packet.request.instructions : body.overrideInstructions?.trim();
    const message = body.action === "baseline" ? packet.request.message : body.overrideMessage?.trim();
    if (!instructions || !message) throw error(400, "The full override request must include instructions and fixture context.");
    const format = responseFormat(packet.source.stage);
    const startedAt = Date.now();
    const provider = await runtime.askProvider({ instructions, message, responseFormat: format });
    return {
      source: { file: packet.source.sourceFile, function: packet.source.sourceFunction, gitRevision: packet.source.gitRevision, campaignId: packet.source.campaignId, ...(packet.source.turnId ? { turnId: packet.source.turnId } : {}) },
      fixture: `local campaign ${packet.source.campaignId}`,
      stage: packet.source.stage,
      action: body.action,
      request: { instructions, message, fullPrompt: fullRequest(instructions, message) },
      result: { output: provider.content, validation: validationFor(provider.content, format), durationMs: Date.now() - startedAt, model: provider.debug.model ?? null }
    };
  });
}
