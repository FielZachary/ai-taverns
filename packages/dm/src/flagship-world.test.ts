import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  eldermereRegions,
  formatEldermereOpeningPromptContext,
} from "./flagship-world.js";

describe("formatEldermereOpeningPromptContext", () => {
  it("includes the selected region local name bank", () => {
    const region = eldermereRegions.find(
      (candidate) => candidate.name === "Cael Ambrose",
    );

    assert.ok(region);
    const settlement = region.settlements[0];
    assert.ok(settlement);

    const context = formatEldermereOpeningPromptContext({
      region,
      settlement,
    });

    assert.match(context, /Selected opener region and settlement:/);
    assert.match(context, /Selected region local name bank:/);
    assert.match(context, /Hallowmere/);
    assert.match(context, /the Guest-Bread/);
    assert.match(context, /Regional NPC given-name seeds: Elian/);
    assert.match(context, /avoid reusing a local name once it has appeared/);
  });
});
