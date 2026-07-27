import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cultureForNameRequest,
  eldermereRegionStyles,
  generateNamePool,
  normalizeName,
  stylesForNameRequest,
  validateCandidateName,
  type NameTarget
} from "./name-director.js";

describe("name director", () => {
  it("maps Eldermere regions to composable fantasy styles", () => {
    assert.deepEqual(stylesForNameRequest({ region: "The Salt Concordat" }), [
      { id: "coastal", weight: 4 },
      { id: "seafaring", weight: 3 },
      { id: "mercantile", weight: 2 },
      { id: "urban", weight: 1 }
    ]);
    assert.equal(
      cultureForNameRequest({
        world: "Eldermere",
        region: "Thornwake Vale"
      }).id,
      "eldermere-thornwake-vale"
    );
  });

  it("normalizes names for exact uniqueness checks", () => {
    assert.equal(normalizeName("  Elara   Venn "), "elara venn");
    assert.equal(normalizeName("Elara, Venn!"), "elara venn");
  });

  it("rejects exact, near, shape, and banned-rut names", () => {
    assert.deepEqual(validateCandidateName({ candidate: "Elara Venn" }).ok, false);
    assert.deepEqual(
      validateCandidateName({
        candidate: "Alara Ven",
        existingNames: ["Elara Venn"]
      }).ok,
      false
    );
    assert.deepEqual(
      validateCandidateName({
        candidate: "Kaelos Dawnglass"
      }).ok,
      false
    );
    assert.deepEqual(validateCandidateName({ candidate: "Brrxalth Qor" }).ok, false);
  });

  it("generates deterministic mixed-style person pools", () => {
    const input = {
      styles: [
        { id: "coastal" as const, weight: 3 },
        { id: "mercantile" as const, weight: 2 },
        { id: "urban" as const, weight: 1 }
      ],
      target: "person" as const,
      role: "mentor" as const,
      count: 10,
      seed: "mira-backstory"
    };
    const first = generateNamePool(input);
    const second = generateNamePool(input);

    assert.deepEqual(
      first.names.map((candidate) => candidate.name),
      second.names.map((candidate) => candidate.name)
    );
    assert.equal(first.names.length, 10);
    assert.deepEqual(first.culture.styleIds, ["coastal", "mercantile", "urban"]);
    assert.equal(
      new Set(first.names.map((candidate) => normalizeName(candidate.name))).size,
      10
    );
  });

  it("generates target-specific names from the same styles", () => {
    const targets: NameTarget[] = [
      "settlement",
      "tavern",
      "ship",
      "faction",
      "artifact"
    ];

    for (const target of targets) {
      const pool = generateNamePool({
        styles: ["forest", "old_faith", "haunted"],
        target,
        count: 6,
        seed: `target-${target}`
      });

      assert.equal(pool.names.length, 6);
      assert.equal(pool.names.every((candidate) => candidate.target === target), true);
    }

    const taverns = generateNamePool({
      styles: ["coastal", "seafaring"],
      target: "tavern",
      count: 8,
      seed: "tavern-shape"
    }).names;

    assert.equal(taverns.length, 8);
    assert.ok(taverns.some((candidate) => !candidate.name.startsWith("The ")));
  });

  it("honors existing and avoided names", () => {
    const pool = generateNamePool({
      styles: ["coastal", "mercantile"],
      count: 12,
      seed: "avoid-known-names",
      existingNames: ["Nessa Saltmere", "Bria Keelmark"],
      avoidNames: ["Elara Venn", "Kaelos"]
    });
    const generatedNames = pool.names.map((candidate) => candidate.name);

    assert.equal(generatedNames.includes("Nessa Saltmere"), false);
    assert.equal(generatedNames.includes("Bria Keelmark"), false);
    assert.equal(generatedNames.some((name) => /Elara|Kaelos/i.test(name)), false);
  });

  it("keeps every Eldermere region mapping fillable", () => {
    const failures: string[] = [];

    for (const region of Object.keys(eldermereRegionStyles)) {
      const pool = generateNamePool({
        world: "Eldermere",
        region,
        count: 16,
        seed: `eldermere-region-${region}`,
        existingNames: ["Elara Venn", "Kaelos", "Marra Vell"]
      });

      if (pool.names.length !== 16) {
        failures.push(`${region} returned ${pool.names.length} names`);
      }
    }

    assert.deepEqual(failures, []);
  });
});
