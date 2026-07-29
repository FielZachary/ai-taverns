import { describe, expect, it } from "vitest";

import { extractPlayerBackstory } from "./backstory-intro";

describe("extractPlayerBackstory", () => {
  it("extracts a labelled backstory section from a character sheet", () => {
    expect(
      extractPlayerBackstory(
        [
          "Character Name: Mira Vale",
          "Backstory",
          "Mira grew up beside a lighthouse.",
          "",
          "She still owes a promise to the keeper.",
          "Core Stats",
          "Armor Class: 15"
        ].join("\n")
      )
    ).toBe(
      "Mira grew up beside a lighthouse.\n\nShe still owes a promise to the keeper."
    );
  });

  it("extracts inline backstory fields", () => {
    expect(
      extractPlayerBackstory(
        "Character Name: Pike\nBackstory: Pike follows the old glowing roads.\nClass: Ranger"
      )
    ).toBe("Pike follows the old glowing roads.");
  });

  it("returns an empty string when no backstory is present", () => {
    expect(
      extractPlayerBackstory("Name:\nClass / Level:\nInventory:")
    ).toBe("");
  });
});
