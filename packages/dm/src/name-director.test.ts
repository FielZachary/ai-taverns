import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cultureForNameRequest,
  generateNamePool,
  nameCultures,
  normalizeName,
  validateCandidateName
} from "./name-director.js";

describe("name director", () => {
  it("selects Eldermere regional naming cultures", () => {
    assert.equal(
      cultureForNameRequest({
        world: "Eldermere",
        region: "The Salt Concordat"
      }).id,
      "eldermere-salt-concordat"
    );
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
    assert.deepEqual(
      validateCandidateName({
        candidate: "Elara Venn"
      }).ok,
      false
    );
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
    assert.deepEqual(
      validateCandidateName({
        candidate: "Brrxalth Qor"
      }).ok,
      false
    );
  });

  it("generates deterministic, unique candidate pools", () => {
    const first = generateNamePool({
      world: "Eldermere",
      region: "The Salt Concordat",
      role: "mentor",
      count: 10,
      seed: "mira-backstory"
    });
    const second = generateNamePool({
      world: "Eldermere",
      region: "The Salt Concordat",
      role: "mentor",
      count: 10,
      seed: "mira-backstory"
    });

    assert.deepEqual(
      first.names.map((candidate) => candidate.name),
      second.names.map((candidate) => candidate.name)
    );
    assert.equal(first.names.length, 10);
    assert.equal(
      new Set(first.names.map((candidate) => normalizeName(candidate.name))).size,
      10
    );
  });

  it("honors existing and avoided names", () => {
    const pool = generateNamePool({
      world: "Eldermere",
      region: "The Salt Concordat",
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

  it("mass-tests regional pools for uniqueness, pronounceability, and banned shapes", () => {
    const regions = nameCultures.flatMap((culture) => culture.regions).filter(Boolean);
    const failures: string[] = [];
    let generatedCount = 0;

    for (const region of regions) {
      for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
        const pool = generateNamePool({
          world: "Eldermere",
          region,
          role: seedIndex % 2 === 0 ? "patron" : "rival",
          count: 16,
          seed: `mass-${region}-${seedIndex}`,
          existingNames: ["Elara Venn", "Kaelos", "Marra Vell"]
        });
        const normalized = pool.names.map((candidate) => normalizeName(candidate.name));

        generatedCount += pool.names.length;

        if (pool.names.length < 16) {
          failures.push(`${region} seed ${seedIndex} returned ${pool.names.length} names`);
        }

        if (new Set(normalized).size !== normalized.length) {
          failures.push(`${region} seed ${seedIndex} returned duplicate names`);
        }

        for (const candidate of pool.names) {
          const validation = validateCandidateName({
            candidate: candidate.name,
            existingNames: ["Elara Venn", "Kaelos", "Marra Vell"]
          });

          if (!validation.ok) {
            failures.push(
              `${region} seed ${seedIndex} generated invalid ${candidate.name}: ${validation.reasons.join(", ")}`
            );
          }

          if (/Elara|Kaelos|Venn|Vell|Vael|Vale|Vey/i.test(candidate.name)) {
            failures.push(`${region} seed ${seedIndex} used a banned rut: ${candidate.name}`);
          }
        }
      }
    }

    assert.equal(failures.length, 0, failures.slice(0, 20).join("\n"));
    assert.ok(generatedCount >= 8000);
  });
});
