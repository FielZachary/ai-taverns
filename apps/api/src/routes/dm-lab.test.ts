import { strict as assert } from "node:assert";
import test from "node:test";
import {
  responseFormatForDmLabStage,
  streamsForDmLabStage,
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

test("DM Lab streams the same narrator stages as normal play", () => {
  for (const stage of [
    "opening_narrator",
    "scene_director",
    "npc_dialogue",
    "combat",
    "clarification"
  ] as const) {
    assert.equal(streamsForDmLabStage(stage), true);
  }

  for (const stage of ["opening_brief_planner", "opening_planner", "router"] as const) {
    assert.equal(streamsForDmLabStage(stage), false);
  }
});

test("DM Lab keeps planning and routing stages in JSON mode", () => {
  for (const stage of [
    "opening_brief_planner",
    "opening_planner",
    "router",
    "mechanics_executor"
  ] as const) {
    assert.equal(responseFormatForDmLabStage(stage), "json");
  }
});

test("DM Lab uses the live temperature for combat and mechanics execution", () => {
  assert.equal(temperatureForDmLabStage("combat"), 0.2);
  assert.equal(temperatureForDmLabStage("mechanics_executor"), 0);

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
