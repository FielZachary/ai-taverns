import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { CharacterSheetOverlay } from "./CharacterSheetOverlay";

const fullCharacterSheet = `
Character Name: Lyra
Class: Rogue
Level: 3
Background: Urchin
Player Name: Maya
Species: Elf
Alignment: Chaotic Good
Gender: Woman
Passive Perception: 14

Core Stats
Armor Class: 15
Initiative: +3
Speed: 30 ft
Current HP: 18
Max HP: 24
Hit Dice: 3d8
Proficiency Bonus: +2

Ability Scores
Strength: 8 (-1)
Dexterity: 16 (+3)
Constitution: 12 (+1)
Intelligence: 14 (+2)
Wisdom: 13 (+1)
Charisma: 10 (+0)

Saving Throws
Dexterity: +5
Intelligence: +4

Skills
Stealth: +7
Perception: +4
Cartography: +2

Proficiencies and Languages
Thieves' Tools
Common, Elvish

Attacks
Shortbow: range 80/320 ft, +5 to hit, 1d6+3 piercing
Dagger: thrown 20/60 ft, +5 to hit, 1d4+3 piercing

Spells
Cantrips: Mage Hand, Fire Bolt
Known / Prepared: Shield, Misty Step
Spell save DC: 13

Equipment
Leather armor
Shortbow

Inventory
Brass key

Currency
12 gp

Personality
Trait: Always maps the exits.

Features and Traits
Sneak Attack

DM Brief
Secret heir to the moon court.
`;

const backstoryCharacterSheet = `
Character Name: Calder
Class: Fighter
Level: 3

Backstory
You were born in the Ashfell Marches. The Oath Warden died without a clear heir. Ferrant Concord mercenaries broke your line. You heard rumors of Thornwake Vale black markets. Sallowholt may hold the answer.

Core Stats
Armor Class: 16
`;

function renderCharacterSheetOverlay(
  overrides: Partial<ComponentProps<typeof CharacterSheetOverlay>> = {}
) {
  const props = {
    characterSheet: fullCharacterSheet,
    onClose: vi.fn(),
    onNpcCardUpdate: vi.fn(async ({ markdown }) => ({
      id: "npc:marra-vell",
      title: "Marra Vell",
      markdown
    })),
    ...overrides
  } satisfies ComponentProps<typeof CharacterSheetOverlay>;

  render(<CharacterSheetOverlay {...props} />);

  return props;
}

describe("CharacterSheetOverlay", () => {
  it("renders parsed character fields, sections, tables, and closes from the header", () => {
    const props = renderCharacterSheetOverlay();
    const dialog = screen.getByRole("dialog", { name: /lyra/i });

    expect(within(dialog).getByRole("heading", { name: "Lyra" })).toBeInTheDocument();
    expect(within(dialog).getByText("Rogue / 3")).toBeInTheDocument();
    expect(within(dialog).getByText("Urchin")).toBeInTheDocument();
    expect(within(dialog).getByText("Maya")).toBeInTheDocument();
    expect(within(dialog).getByText("Elf")).toBeInTheDocument();
    expect(within(dialog).getByText("Chaotic Good")).toBeInTheDocument();
    expect(within(dialog).getByText("+2")).toBeInTheDocument();
    expect(within(dialog).getByText("18 / 24")).toBeInTheDocument();
    expect(within(dialog).getByText("Dexterity: +5")).toBeInTheDocument();
    expect(within(dialog).getByText("Stealth: +7")).toBeInTheDocument();
    expect(within(dialog).queryByText("Cartography: +2")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("Shortbow")).toHaveLength(2);
    expect(within(dialog).getByText("range 80/320 ft")).toBeInTheDocument();
    expect(within(dialog).getAllByText("+5 to hit")).toHaveLength(2);
    expect(within(dialog).getByText("1d6+3 piercing")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Cantrips" })).toBeInTheDocument();
    expect(within(dialog).getByText("Mage Hand")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Level 1" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Level 2" })).toBeInTheDocument();
    expect(within(dialog).getByText("Spell save DC: 13")).toBeInTheDocument();
    expect(within(dialog).getByText("Brass key")).toBeInTheDocument();
    expect(within(dialog).getByText("Always maps the exits.")).toBeInTheDocument();
    expect(within(dialog).getByText("Secret heir to the moon court.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /close player resources/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back for unnamed sparse sheets and displays empty spell content", () => {
    renderCharacterSheetOverlay({
      characterSheet: `
Name:
Race: Dwarf
Core Stats
Armor Class: 12
Spells
None
`
    });

    const dialog = screen.getByRole("dialog", { name: /unnamed adventurer/i });

    expect(
      within(dialog).getByRole("heading", { name: "Unnamed Adventurer" })
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Dwarf")).toBeInTheDocument();
    expect(within(dialog).getByText("12")).toBeInTheDocument();
    expect(within(dialog).getAllByText("-").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("None")).toBeInTheDocument();
    expect(within(dialog).getByText("Strength:")).toBeInTheDocument();
  });

  it("renders dedicated inventory and weapons tabs from character sheet sections", () => {
    renderCharacterSheetOverlay();

    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }));

    const inventoryPanel = screen.getByRole("region", { name: "Inventory" });

    expect(
      within(inventoryPanel).getByRole("heading", { name: "Equipment" })
    ).toBeInTheDocument();
    expect(within(inventoryPanel).getByText("Leather armor")).toBeInTheDocument();
    expect(within(inventoryPanel).getByText("Brass key")).toBeInTheDocument();
    expect(within(inventoryPanel).getByText("12 gp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Weapons & Spells" }));

    const weaponsPanel = screen.getByRole("region", {
      name: "Weapons & Spells"
    });

    expect(
      within(weaponsPanel).getByRole("heading", { name: "Attacks" })
    ).toBeInTheDocument();
    expect(within(weaponsPanel).getByText("Shortbow")).toBeInTheDocument();
    expect(within(weaponsPanel).getByText("range 80/320 ft")).toBeInTheDocument();
    expect(
      within(weaponsPanel).getByRole("heading", { name: "Spells" })
    ).toBeInTheDocument();
    expect(within(weaponsPanel).getByText("Mage Hand")).toBeInTheDocument();
    expect(within(weaponsPanel).getByText("Misty Step")).toBeInTheDocument();
  });

  it("renders NPC cards from context chunks and opens editable NPC fields", async () => {
    const props = renderCharacterSheetOverlay({
      npcCards: [
        {
          id: "npc:marra-vell",
          title: "Marra Vell",
          markdown: [
            "# Marra Vell",
            "",
            "## Name",
            "Marra Vell",
            "",
            "## Location",
            "Pier 6.",
            "",
            "## Appearance",
            "Fog-damp cloak and quick, watchful eyes.",
            "",
            "## Personality",
            "Guarded and restless.",
            "",
            "## Motivations",
            "Stay alive and keep the black key hidden.",
            "",
            "## Disposition Towards You",
            "Wary but interested.",
            "",
            "## Known History",
            "- First met near Pier 6.",
            "",
            "## Secrets",
            "Knows more than she admitted.",
            "",
            "## Open Threads",
            "- Could return with proof.",
            "",
            "## Last Seen",
            "Running into the fog."
          ].join("\n"),
          updatedAt: "2026-07-20T10:00:00.000Z"
        }
      ]
    });

    fireEvent.click(screen.getByRole("tab", { name: /npc cards/i }));

    const npcCardsPanel = screen.getByRole("region", { name: /npc cards/i });

    expect(within(npcCardsPanel).getByText("1 known")).toBeInTheDocument();
    expect(
      within(npcCardsPanel).getByRole("button", { name: /marra vell/i })
    ).toBeInTheDocument();
    expect(within(npcCardsPanel).getByText("Pier 6.")).toBeInTheDocument();
    expect(
      within(npcCardsPanel).getByText("Stay alive and keep the black key hidden.")
    ).toBeInTheDocument();

    fireEvent.click(within(npcCardsPanel).getByRole("button", { name: /marra vell/i }));

    const npcDialog = screen.getByRole("dialog", { name: /marra vell/i });

    expect(within(npcDialog).getByLabelText("Appearance")).toHaveValue(
      "Fog-damp cloak and quick, watchful eyes."
    );
    expect(within(npcDialog).getByLabelText("Location")).toHaveValue("Pier 6.");

    fireEvent.change(within(npcDialog).getByLabelText("Motivations"), {
      target: { value: "Trust the party enough to ask for help." }
    });

    expect(within(npcDialog).getByLabelText("Motivations")).toHaveValue(
      "Trust the party enough to ask for help."
    );

    fireEvent.click(within(npcDialog).getByRole("button", { name: /save npc card/i }));

    await waitFor(() => {
      expect(props.onNpcCardUpdate).toHaveBeenCalledWith({
        npcCardId: "npc:marra-vell",
        markdown: expect.stringContaining(
          "## Motivations\nTrust the party enough to ask for help."
        )
      });
    });
    expect(within(npcDialog).getByText("Saved.")).toBeInTheDocument();

    fireEvent.click(within(npcDialog).getByRole("button", { name: /close npc card/i }));

    expect(screen.queryByRole("dialog", { name: /marra vell/i })).not.toBeInTheDocument();
  });

  it("keeps the player backstory in Player Resources without adding a separate glossary", () => {
    renderCharacterSheetOverlay({
      characterSheet: backstoryCharacterSheet
    });

    fireEvent.click(screen.getByRole("tab", { name: "Backstory" }));

    const backstoryPanel = screen.getByRole("region", {
      name: "Your Backstory"
    });

    expect(
      within(backstoryPanel).getByText(/You were born in the Ashfell Marches/)
    ).toBeInTheDocument();
    expect(within(backstoryPanel).queryByText("World Terms")).not.toBeInTheDocument();
  });

  it("shows a player-safe Eldermere lore primer with gods and canonical regions", () => {
    renderCharacterSheetOverlay({
      initialTab: "eldermere_lore"
    });

    const lorePanel = screen.getByRole("region", { name: "Eldermere Lore" });

    expect(within(lorePanel).getByText(/fallen Second Dominion/)).toBeInTheDocument();
    expect(within(lorePanel).getByText(/the long divine silence called the Hush/)).toBeInTheDocument();
    expect(within(lorePanel).getByText("The Five Divine Forces")).toBeInTheDocument();
    expect(within(lorePanel).getByText("The Hearth-Warden")).toBeInTheDocument();
    expect(within(lorePanel).getByText("The Ashen Scholar")).toBeInTheDocument();
    expect(within(lorePanel).getByText("The Ferrant Concord")).toBeInTheDocument();
    expect(within(lorePanel).getByText("The Veiled Reach")).toBeInTheDocument();
    expect(within(lorePanel).queryByText("Cinderspine")).not.toBeInTheDocument();
  });
});
