import { strict as assert } from "node:assert";
import test from "node:test";
import {
  responseFormatForDmLabStage,
  temperatureForDmLabStage
} from "./dm-lab.js";

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

test("DM Lab replays combat at the live combat temperature only", () => {
  assert.equal(temperatureForDmLabStage("combat"), 0.2);

  for (const stage of [
    "opening_brief_planner",
    "opening_planner",
    "opening_narrator",
    "router",
    "scene_director",
    "npc_dialogue",
    "clarification"
  ] as const) {
    assert.equal(temperatureForDmLabStage(stage), undefined);
  }
});
