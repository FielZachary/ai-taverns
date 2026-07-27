import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cultureForNameRequest,
  eldermereRegionStyles,
  generateNamePool,
  nameStyleProfiles,
  normalizeName,
  stylesForNameRequest,
  validateCandidateName,
  type NameTarget
} from "./name-director.js";

function usesBannedRut(name: string) {
  return normalizeName(name)
    .split(/[\s'-]+/)
    .some((token) =>
      ["elara", "kaelos", "venn", "vell", "vael", "vale", "vey"].includes(token)
    );
}

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

  it("mass-tests style mixes for uniqueness, pronounceability, and banned shapes", () => {
    const styleIds = nameStyleProfiles.map((style) => style.id);
    const targets: NameTarget[] = ["person", "settlement", "tavern", "ship", "faction"];
    const failures: string[] = [];
    let generatedCount = 0;

    for (let styleIndex = 0; styleIndex < styleIds.length; styleIndex += 1) {
      const styles = [
        { id: styleIds[styleIndex]!, weight: 3 },
        { id: styleIds[(styleIndex + 7) % styleIds.length]!, weight: 2 },
        { id: styleIds[(styleIndex + 13) % styleIds.length]!, weight: 1 }
      ];

      for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
        const target = targets[seedIndex % targets.length]!;
        const pool = generateNamePool({
          styles,
          target,
          role: seedIndex % 2 === 0 ? "patron" : "rival",
          count: 12,
          seed: `mass-${styleIndex}-${seedIndex}`,
          existingNames: ["Elara Venn", "Kaelos", "Marra Vell"]
        });
        const normalized = pool.names.map((candidate) => normalizeName(candidate.name));

        generatedCount += pool.names.length;

        if (pool.names.length < 12) {
          failures.push(`style ${styleIndex} seed ${seedIndex} returned ${pool.names.length} names`);
        }

        if (new Set(normalized).size !== normalized.length) {
          failures.push(`style ${styleIndex} seed ${seedIndex} returned duplicate names`);
        }

        for (const candidate of pool.names) {
          const validation = validateCandidateName({
            candidate: candidate.name,
            existingNames: ["Elara Venn", "Kaelos", "Marra Vell"]
          });

          if (!validation.ok) {
            failures.push(
              `style ${styleIndex} seed ${seedIndex} generated invalid ${candidate.name}: ${validation.reasons.join(", ")}`
            );
          }

          if (usesBannedRut(candidate.name)) {
            failures.push(`style ${styleIndex} seed ${seedIndex} used a banned rut: ${candidate.name}`);
          }
        }
      }
    }

    assert.equal(failures.length, 0, failures.slice(0, 20).join("\n"));
    assert.ok(generatedCount >= 16000);
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
