import { describe, expect, it } from "vitest";

import {
  extractPlayerBackstory,
  formatBackstoryParagraphs,
  glossaryEntriesForBackstory
} from "./backstory-intro";

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

  it("formats single-blob generated backstories into readable paragraphs", () => {
    const paragraphs = formatBackstoryParagraphs(
      "You were born in the Ashfell Marches. Your clan backed a claimant. Calder fell at the Battle of the Broken Oath-Ring. You carried his body from the field. You heard rumors of Ferrant Concord steel moving through Thornwake Vale. Sallowholt may hold the answer."
    );

    expect(paragraphs).toEqual([
      "You were born in the Ashfell Marches. Your clan backed a claimant. Calder fell at the Battle of the Broken Oath-Ring.",
      "You carried his body from the field. You heard rumors of Ferrant Concord steel moving through Thornwake Vale. Sallowholt may hold the answer."
    ]);
  });

  it("returns glossary entries for Eldermere terms mentioned in backstory", () => {
    expect(
      glossaryEntriesForBackstory(
        "The Oath Warden died while Ferrant Concord arms reached Sallowholt."
      ).map((entry) => entry.term)
    ).toEqual(["Oath-Ring Warden", "Ferrant Concord", "Sallowholt"]);
  });
});
