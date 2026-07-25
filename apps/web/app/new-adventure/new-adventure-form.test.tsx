import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NewAdventureForm,
  spellArchetypeFor,
  spellArtPathFor,
  spellCastingTimeFor,
  spellDetailFor,
  spellDurationFor,
  spellEffectSummaryFor,
  spellRangeFor,
  spellRollsFor,
  spellSchoolFor
} from "./new-adventure-form";

const {
  createCampaignMock,
  joinCampaignMock,
  previewCampaignJoinMock
} = vi.hoisted(() => ({
  createCampaignMock: vi.fn(),
  joinCampaignMock: vi.fn(),
  previewCampaignJoinMock: vi.fn()
}));

vi.mock("@/lib/campaign-api", () => ({
  createCampaign: createCampaignMock,
  joinCampaign: joinCampaignMock,
  previewCampaignJoin: previewCampaignJoinMock
}));

async function finishFlowTransition() {
  await act(async () => {
    vi.advanceTimersByTime(480);
  });
}

async function continueFlow() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await finishFlowTransition();
}

async function nextCharacterStep() {
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await finishFlowTransition();
}

async function choosePointBuyStats() {
  await nextCharacterStep();
  await nextCharacterStep();
  await nextCharacterStep();

  fireEvent.click(screen.getByRole("button", { name: "Point Buy" }));
}

async function advanceThroughFighterEquipment() {
  fireEvent.click(screen.getByRole("button", { name: /chain mail/i }));
  await nextCharacterStep();

  fireEvent.click(
    screen.getByRole("button", { name: /one martial weapon and a shield/i })
  );
  fireEvent.click(screen.getByRole("button", { name: /battleaxe/i }));
  await nextCharacterStep();

  fireEvent.click(
    screen.getByRole("button", { name: /light crossbow and 20 bolts/i })
  );
  await nextCharacterStep();

  fireEvent.click(screen.getByRole("button", { name: /dungeoneer's pack/i }));
  await nextCharacterStep();
}

async function advanceSingleplayerToIdentity() {
  await continueFlow();
  await continueFlow();
  await choosePointBuyStats();
  await nextCharacterStep();
  await nextCharacterStep();
  await nextCharacterStep();
  await nextCharacterStep();
  await nextCharacterStep();
  await nextCharacterStep();
  await advanceThroughFighterEquipment();
  await nextCharacterStep();
}

function statCardFor(label: string) {
  const decreaseButton = screen.getByRole("button", {
    name: new RegExp(`decrease ${label}`, "i")
  });
  const card = decreaseButton.closest(".stat-roll-card");

  if (!card) {
    throw new Error(`Unable to find stat card for ${label}`);
  }

  return card;
}

function expectPointBuyRemaining(points: number) {
  const remainingCounter = document.querySelector(".point-buy-remaining");

  expect(remainingCounter).toHaveTextContent(`${points}points remaining`);
}

describe("NewAdventureForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    previewCampaignJoinMock.mockResolvedValue({
      code: "ABCD12",
      campaignTitle: "Crystal Caves",
      availableSlots: 2,
      hasBegun: false
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("validates, normalizes, and previews a multiplayer join code", async () => {
    render(<NewAdventureForm />);

    fireEvent.click(screen.getByRole("button", { name: /multiplayer/i }));
    await continueFlow();

    expect(
      screen.getByRole("heading", { name: /choose multiplayer setup/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /join game/i }));
    await continueFlow();

    expect(
      screen.getByRole("heading", { name: /enter the game code/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the six-character game code before continuing."
    );
    expect(previewCampaignJoinMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Game code"), {
      target: { value: "ab-cd-12!" }
    });

    expect(screen.getByLabelText("Game code")).toHaveValue("ABCD12");

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await act(async () => {});

    expect(previewCampaignJoinMock).toHaveBeenCalledWith({
      gameCode: "ABCD12"
    });
    expect(screen.getByText("Crystal Caves")).toBeInTheDocument();
    expect(screen.getByText("2 seats open")).toBeInTheDocument();

    await finishFlowTransition();

    expect(
      screen.getByRole("heading", { name: /choose your character build/i })
    ).toBeInTheDocument();
  });

  it("lets point-buy stats spend points and advance from valid stats", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();

    expect(
      screen.getByRole("heading", { name: /choose your character build/i })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("list", { name: /character creation progress/i })
    ).not.toBeInTheDocument();

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your class/i })
    ).toBeInTheDocument();

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your class choices/i })
    ).toBeInTheDocument();

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /roll your level 5 stats/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Point Buy" }));

    expectPointBuyRemaining(15);

    const strengthCard = statCardFor("Strength");
    const decreaseStrength = screen.getByRole("button", {
      name: /decrease strength/i
    });
    const increaseStrength = screen.getByRole("button", {
      name: /increase strength/i
    });

    fireEvent.click(decreaseStrength);

    expect(strengthCard).toHaveTextContent("9");
    expectPointBuyRemaining(16);

    fireEvent.click(decreaseStrength);

    expect(strengthCard).toHaveTextContent("8");
    expect(decreaseStrength).toBeDisabled();
    expectPointBuyRemaining(17);

    fireEvent.click(increaseStrength);

    expect(strengthCard).toHaveTextContent("9");
    expectPointBuyRemaining(16);

    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(increaseStrength);
    }

    expect(strengthCard).toHaveTextContent("15");
    expect(increaseStrength).toBeDisabled();
    expectPointBuyRemaining(8);

    const increaseDexterity = screen.getByRole("button", {
      name: /increase dexterity/i
    });

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(increaseDexterity);
    }

    expectPointBuyRemaining(1);
    expect(increaseDexterity).toBeDisabled();

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your species/i })
    ).toBeInTheDocument();
  });

  it("renders class cards with class artwork backgrounds", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    await nextCharacterStep();

    const fighterButton = screen.getByRole("button", {
      name: /fighter/i
    });

    expect(fighterButton.style.getPropertyValue("--class-art-url")).toContain(
      "url("
    );
  });

  it("shows species stat bonuses as muted subtitles", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    await choosePointBuyStats();
    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your species/i })
    ).toBeInTheDocument();
    expect(screen.getByText("+1 all stats")).toBeInTheDocument();
    expect(screen.getByText("+2 Strength, +1 Constitution")).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: /human/i })
        .style.getPropertyValue("--species-art-url")
    ).toContain("url(");
  });

  it("validates identity and recovers when campaign creation fails", async () => {
    createCampaignMock.mockRejectedValue(new Error("The tavern doors jammed."));

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    expect(
      screen.getByRole("heading", { name: /choose your identity/i })
    ).toBeInTheDocument();

    const form = document.querySelector("form");

    if (!form) {
      throw new Error("Unable to find new adventure form");
    }

    fireEvent.submit(form);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add your character name before continuing."
    );
    expect(createCampaignMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /review your character/i })
    ).toBeInTheDocument();

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /ready the first page/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create campaign/i }));

    await act(async () => {});

    expect(createCampaignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "single_player",
        playerName: "Mira Vale",
        characterName: "Mira Vale"
      })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The tavern doors jammed."
    );
    expect(
      screen.getByRole("button", { name: /create campaign/i })
    ).toBeEnabled();
  });
});

describe("spell art archetypes", () => {
  it.each([
    ["Burning Hands", "fire"],
    ["Rime's Binding Ice", "frost"],
    ["Call Lightning", "lightning"],
    ["Dissonant Whispers", "sound"],
    ["Melf's Acid Arrow", "acid"],
    ["Ray of Sickness", "poison"],
    ["Word of Radiance", "radiant"],
    ["Daylight", "light"],
    ["Toll the Dead", "necrotic"],
    ["Telekinetic Crush", "psychic"],
    ["Magic Missile", "force"],
    ["Cure Wounds", "healing"],
    ["Shield of Faith", "shield"],
    ["Arcane Lock", "ward"],
    ["Command", "charm"],
    ["Cause Fear", "fear"],
    ["Mirror Image", "illusion"],
    ["Hunger of Hadar", "darkness"],
    ["Detect Magic", "divination"],
    ["Sending", "communication"],
    ["Find Familiar", "summoning"],
    ["Misty Step", "teleport"],
    ["Longstrider", "movement"],
    ["Entangle", "nature"],
    ["Beast", "beast"],
    ["Shape Water", "water"],
    ["Gust of Wind", "wind"],
    ["Mold Earth", "earth"],
    ["Magnify Gravity", "gravity"],
    ["Bestow Curse", "curse"],
    ["Branding Smite", "weapon"],
    ["Sleep", "sleep"],
    ["Gift of Alacrity", "luck-time"],
    ["Mending", "creation"],
    ["Alter Self", "transformation"],
    ["Grease", "alchemy"],
    ["Unmatched Spell", "force"]
  ])("maps %s to the %s art archetype", (spell, archetype) => {
    expect(spellArchetypeFor(spell)).toBe(archetype);
    expect(spellArtPathFor(spell)).toBe(`/spell-archetypes/${archetype}.webp`);
  });
});

describe("spell metadata helpers", () => {
  it.each([
    ["Healing Hope", "Restores allies, removes harm, or keeps the party standing."],
    ["Flame Burst", "Deals fiery damage or shapes flames on the battlefield."],
    ["Rime Chill", "Deals cold damage or hinders movement with freezing magic."],
    ["Storm Pulse", "Unleashes elemental force to damage, push, or disrupt foes."],
    ["Hidden Image", "Uses deception, concealment, or false images to reshape a scene."],
    ["Charm Aura", "Pressures a creature's emotions, choices, or behavior."],
    ["Knowledge Sense", "Reveals hidden information, magic, creatures, or useful omens."],
    ["Summon Helper", "Calls or creates a helper, creature, or servant."],
    ["Binding Wall", "Controls space by restraining, blocking, or slowing enemies."],
    ["Psychic Push", "Uses mental force to damage, protect, move, or overwhelm."],
    ["Stride Leap", "Improves movement, positioning, or travel options."],
    ["Protection Ward", "Protects against attacks, damage, or dangerous effects."],
    ["Weapon Arrow", "Enhances attacks or turns a weapon hit into a stronger effect."],
    ["Odd Utility", "Adds a flexible magical option for combat, exploration, or problem-solving."]
  ])("summarizes %s", (spell, summary) => {
    expect(spellEffectSummaryFor(spell)).toBe(summary);
  });

  it.each([
    ["Shield", "Abjuration"],
    ["Misty Step", "Conjuration"],
    ["Detect Magic", "Divination"],
    ["Charm Person", "Enchantment"],
    ["Fireball", "Evocation"],
    ["Silent Image", "Illusion"],
    ["False Life", "Necromancy"],
    ["Alter Self", "Transmutation"],
    ["Prestidigitation", "Varies"]
  ])("infers %s school", (spell, school) => {
    expect(spellSchoolFor(spell)).toBe(school);
  });

  it.each([
    ["Mage Armor", null, "8 hours"],
    ["Darkvision", null, "8 hours"],
    ["Alarm", null, "Until dispelled"],
    ["Detect Magic", null, "Concentration, up to 10 minutes"],
    ["Bless", null, "Concentration, up to 1 minute"],
    ["Goodberry", null, "1 hour or longer"],
    ["Fire Bolt", "Cantrip", "Instantaneous"],
    ["Prestidigitation", null, "Varies by use"]
  ] as const)("infers %s duration", (spell, level, duration) => {
    expect(spellDurationFor(spell, level)).toBe(duration);
  });

  it.each([
    ["Counterspell", "1 reaction"],
    ["Misty Step", "1 bonus action"],
    ["Find Familiar", "1 minute or longer"],
    ["Fireball", "1 action"]
  ])("infers %s casting time", (spell, castingTime) => {
    expect(spellCastingTimeFor(spell)).toBe(castingTime);
  });

  it.each([
    ["Shield", "Self"],
    ["Burning Hands", "Self-area"],
    ["Cure Wounds", "Touch"],
    ["Fire Bolt", "120 feet"],
    ["Fireball", "120 feet or more"],
    ["Sacred Flame", "60 feet"],
    ["Prestidigitation", "Varies"]
  ])("infers %s range", (spell, range) => {
    expect(spellRangeFor(spell)).toBe(range);
  });

  it.each([
    ["Fire Bolt", "Make a spell attack roll"],
    ["Sacred Flame", "The target rolls a saving throw"],
    ["Cure Wounds", "Roll the listed healing"],
    ["Magic Missile", "No attack roll is needed"],
    ["Bless", "Usually no attack roll is made"],
    ["Prestidigitation", "Resolve with your spell save DC"]
  ])("describes %s roll handling", (spell, rollText) => {
    expect(spellRollsFor(spell)).toContain(rollText);
  });

  it("builds a complete spell detail profile", () => {
    expect(spellDetailFor("Fireball", "3rd level")).toEqual(
      expect.objectContaining({
        school: "Evocation",
        duration: "Instantaneous",
        castingTime: "1 action",
        range: "120 feet or more"
      })
    );
  });
});
