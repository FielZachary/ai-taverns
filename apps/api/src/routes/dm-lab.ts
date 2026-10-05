import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildEldermereDmLabPrompt,
  type DungeonMasterRuntime
} from "@ai-dnd/db";
import { buildRouterPrompt, jobPrompt, type DmJobName } from "@ai-dnd/dm";
import type { ApiConfig } from "../config.js";
import { askDungeonMasterProvider } from "../dm-provider.js";
import { requireAuthenticatedUser } from "./auth.js";

const stageSchema = z.enum([
  "opening_brief_planner",
  "opening_planner",
  "opening_narrator",
  "router",
  "scene_director",
  "investigation",
  "npc_dialogue",
  "combat",
  "clarification"
]);

const requestSchema = z.object({
  stage: stageSchema,
  action: z.enum(["baseline", "override"]),
  overrideInstructions: z.string().max(30_000).optional(),
  overrideMessage: z.string().max(60_000).optional()
});

type DmLabRouteOptions = {
  config: ApiConfig;
  dmRuntime?: DungeonMasterRuntime | undefined;
};

function error(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function isDmLabEnabled(config: ApiConfig) {
  return config.nodeEnv !== "production" || process.env.DM_LAB_ENABLED === "true";
}

function normalTurnFixture(stage: z.infer<typeof stageSchema>) {
  const currentAction =
    "I ask the dockmaster whether anyone has seen Ilyra Venn's marked map.";
  const commonMessage = [
    "CURRENT SCENE",
    "You stand at the rain-soaked public quay in Selwick. The dockmaster is counting sealed crates while a crowd watches a damaged river barge.",
    "",
    "PLAYER CHARACTER",
    "Mara Venn, human ranger and cartographer's apprentice. Her mentor Ilyra is missing.",
    "",
    "AVAILABLE CONTEXT CHUNK KEYS JSON:",
    JSON.stringify({
      npc_context: ["npc:dockmaster-oren"],
      player_character_context: ["pc:mara-venn"],
      combat_context: [],
      relevant_world_context: ["world:selwick"],
      quests_open_threads: ["thread:missing-ilyra"],
      overarching_big_plot_secrets: []
    }, null, 2),
    "",
    "Current turn input:",
    currentAction
  ].join("\n");

  if (stage === "router") {
    return {
      sourceFile: "packages/dm/src/modular-runtime.ts",
      sourceFunction: "buildRouterPrompt",
      instructions: buildRouterPrompt(),
      message: commonMessage,
      responseFormat: "json" as const
    };
  }

  const job = (stage === "clarification" ? "npc_dialogue" : stage) as DmJobName;
  return {
    sourceFile: "packages/dm/src/modular-runtime.ts",
    sourceFunction: "jobPrompt",
    instructions: jobPrompt(job, "single_player"),
    message: commonMessage,
    responseFormat: "json" as const
  };
}

function buildLabPrompt(stage: z.infer<typeof stageSchema>) {
  if (
    stage === "opening_brief_planner" ||
    stage === "opening_planner" ||
    stage === "opening_narrator"
  ) {
    return buildEldermereDmLabPrompt(stage);
  }

  return normalTurnFixture(stage);
}

function validationFor(content: string, responseFormat: "json" | "text") {
  if (responseFormat === "text") {
    const paragraphs = content.trim().split(/\n\s*\n/).filter(Boolean);
    return {
      valid: paragraphs.length === 4 && paragraphs[3] === "What would you like to do?",
      details: [
        `Expected 4 paragraphs; received ${paragraphs.length}.`,
        `Required handoff present: ${paragraphs[3] === "What would you like to do?"}.`
      ]
    };
  }

  try {
    JSON.parse(content);
    return { valid: true, details: ["Valid JSON response."] };
  } catch {
    return { valid: false, details: ["Response is not valid JSON."] };
  }
}

function fullRequest(instructions: string, message: string) {
  return [
    "SYSTEM INSTRUCTIONS",
    instructions,
    "",
    "USER / FIXTURE MESSAGE",
    message
  ].join("\n");
}

export async function registerDmLabRoutes(
  fastify: FastifyInstance,
  options: DmLabRouteOptions
) {
  const runtime = options.dmRuntime ?? { askProvider: askDungeonMasterProvider };

  fastify.post("/internal/dm-lab/compare", async (request) => {
    if (!isDmLabEnabled(options.config)) {
      throw error(404, "DM Lab is disabled.");
    }

    await requireAuthenticatedUser(
      fastify,
      options.config,
      request.cookies[options.config.authCookieName]
    );
    const body = requestSchema.parse(request.body);
    const prompt = buildLabPrompt(body.stage);

    const run = async (instructions: string) => {
      const startedAt = Date.now();
      const response = await runtime.askProvider({
        instructions,
        message: prompt.message,
        responseFormat: prompt.responseFormat
      });
      return {
        output: response.content,
        validation: validationFor(response.content, prompt.responseFormat),
        durationMs: Date.now() - startedAt,
        model: response.debug.model ?? null
      };
    };

    const shared = {
      source: {
        file: prompt.sourceFile,
        function: prompt.sourceFunction,
        gitRevision: process.env.GIT_COMMIT_SHA ?? "local-working-tree"
      },
      fixture: body.stage.startsWith("opening_")
        ? "eldermere-missing-cartographer"
        : "normal-turn-dockmaster-question",
      stage: body.stage
    };

    if (body.action === "baseline") {
      return {
        ...shared,
        action: "baseline" as const,
        request: {
          instructions: prompt.instructions,
          message: prompt.message,
          fullPrompt: fullRequest(prompt.instructions, prompt.message)
        },
        result: await run(prompt.instructions)
      };
    }

    if (!body.overrideInstructions?.trim() || !body.overrideMessage?.trim()) {
      throw error(400, "The full override request must include instructions and fixture context.");
    }

    return {
      ...shared,
      action: "override" as const,
      request: {
        instructions: body.overrideInstructions,
        message: body.overrideMessage,
        fullPrompt: fullRequest(body.overrideInstructions, body.overrideMessage)
      },
      result: await run(body.overrideInstructions)
    };
  });
}
