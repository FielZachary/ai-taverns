import { strict as assert } from "node:assert";
import test from "node:test";
import { responseFormatForDmLabStage } from "./dm-lab.js";

test("DM Lab matches the live prose narrator response format", () => {
  for (const stage of [
    "opening_narrator",
    "scene_director",
    "npc_dialogue",
    "combat",
    "clarification"
  ] as const) {
    assert.equal(responseFormatForDmLabStage(stage), "text");
  }
});

test("DM Lab keeps planning and routing stages in JSON mode", () => {
  for (const stage of [
    "opening_brief_planner",
    "opening_planner",
    "router"
  ] as const) {
    assert.equal(responseFormatForDmLabStage(stage), "json");
  }
});
