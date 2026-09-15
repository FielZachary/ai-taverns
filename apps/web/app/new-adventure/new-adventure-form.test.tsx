import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NewAdventureForm,
  finalAbilityScoresFor,
  quickBuildEquipmentSelectionsFor,
  quickBuildSpellSelectionFor,
  quickBuildStatAssignmentsFor,
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
  generateCharacterBackstoryMock,
  generateCharacterPortraitMock,
  joinCampaignMock,
  previewCampaignJoinMock,
  previewCharacterPortraitMock,
  uploadCharacterPortraitMock
} = vi.hoisted(() => ({
  createCampaignMock: vi.fn(),
  generateCharacterBackstoryMock: vi.fn(),
  generateCharacterPortraitMock: vi.fn(),
  joinCampaignMock: vi.fn(),
  previewCampaignJoinMock: vi.fn(),
  previewCharacterPortraitMock: vi.fn(),
  uploadCharacterPortraitMock: vi.fn()
}));

vi.mock("@/lib/campaign-api", () => ({
  createCampaign: createCampaignMock,
  generateCharacterBackstory: generateCharacterBackstoryMock,
  generateCharacterPortrait: generateCharacterPortraitMock,
  joinCampaign: joinCampaignMock,
  previewCampaignJoin: previewCampaignJoinMock,
  previewCharacterPortrait: previewCharacterPortraitMock,
  uploadCharacterPortrait: uploadCharacterPortraitMock
}));

vi.mock("@/components/playing/DiceRollReveal3D", () => ({
  DiceRollReveal3D: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Finish stat roll
    </button>
  )
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

function chooseCustomBuild() {
  fireEvent.click(screen.getByRole("button", { name: /custom build/i }));
}

async function nextCharacterStep() {
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await act(async () => {});
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
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: /^battleaxe/i
    })
  );
  fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
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
  chooseCustomBuild();
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
    generateCharacterBackstoryMock.mockResolvedValue({
      backstory: "Mira's life changed when the lighthouse bell rang at noon."
    });
    previewCharacterPortraitMock.mockResolvedValue({
      imageDataUrl: "data:image/png;base64,preview",
      contentType: "image/png"
    });
    generateCharacterPortraitMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "provider-session",
      mode: "single_player",
      title: "Eldermere Adventure"
    });
    createCampaignMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "provider-session",
      mode: "single_player",
      title: "Eldermere Adventure"
    });
    uploadCharacterPortraitMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "provider-session",
      mode: "single_player",
      title: "Eldermere Adventure",
      portraitUrl: "/media/campaigns/portrait.webp"
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("keeps multiplayer unavailable from the campaign mode picker", () => {
    render(<NewAdventureForm />);

    expect(screen.getByRole("button", { name: /multiplayer/i })).toBeDisabled();
  });

  it("keeps onboarding welcome and referral steps in the adventure flow", async () => {
    render(<NewAdventureForm onboarding />);

    expect(
      screen.getByRole("heading", { name: "Welcome, traveller." })
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5_480);
    });

    expect(
      screen.getByRole("heading", {
        name: "Where did you hear about AI Taverns?"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reddit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "X" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TikTok" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reddit" }));
    await finishFlowTransition();

    expect(
      screen.getByRole("heading", {
        name: "Describe your experience in D&D 5e"
      })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Experience level"), {
      target: { value: "I have played a few times" }
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await finishFlowTransition();

    expect(screen.getByRole("heading", { name: /choose your character build/i })).toBeInTheDocument();
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

    chooseCustomBuild();
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
    expect(screen.queryByText("+1 all stats")).not.toBeInTheDocument();
    expect(
      screen.queryByText("+2 Strength, +1 Constitution")
    ).not.toBeInTheDocument();

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

  it("lets each rolled stat score be rerolled once", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();

    const rollScores = screen.getByRole("button", { name: "Roll Scores" });

    fireEvent.click(rollScores);
    fireEvent.click(screen.getByRole("button", { name: "Finish stat roll" }));

    expect(screen.getByRole("button", { name: "Roll Scores" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reroll score 1/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /reroll score 2/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /reroll score 1/i }));
    fireEvent.click(screen.getByRole("button", { name: "Finish stat roll" }));

    expect(screen.getByRole("button", { name: /reroll score 1/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reroll score 2/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /reroll score 2/i }));
    fireEvent.click(screen.getByRole("button", { name: "Finish stat roll" }));

    expect(screen.getByRole("button", { name: /reroll score 2/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reroll score 3/i })).toBeEnabled();
  });

  it("renders class cards with class artwork backgrounds", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    await nextCharacterStep();

    const classPicker = screen.getByRole("group", { name: "Class" });
    const fighterButton = within(classPicker).getByRole("button", {
      name: /fighter/i
    });

    expect(fighterButton.style.getPropertyValue("--class-art-url")).toContain(
      "url("
    );
  });

  it("renders mode cards with banner artwork backgrounds", () => {
    render(<NewAdventureForm />);

    expect(
      screen
        .getByRole("button", { name: /singleplayer/i })
        .style.getPropertyValue("--mode-banner-art-url")
    ).toContain("/new-adventure/singleplayer-banner.webp");
    expect(
      screen
        .getByRole("button", { name: /multiplayer/i })
        .style.getPropertyValue("--mode-banner-art-url")
    ).toContain("/new-adventure/multiplayer-banner.webp");
    expect(screen.getByRole("button", { name: /multiplayer/i })).toBeDisabled();
  });

  it("defaults to Quick Build and renders both build-style cards with artwork", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();

    const buildPicker = screen.getByRole("group", { name: "Build style" });
    const quickBuild = within(buildPicker).getByRole("button", {
      name: /quick build/i
    });
    const customBuild = within(buildPicker).getByRole("button", {
      name: /custom build/i
    });

    expect(quickBuild).toHaveAttribute("aria-pressed", "true");
    expect(quickBuild.style.getPropertyValue("--build-mode-art-url")).toContain(
      "/new-adventure/build-styles/quick-build.webp"
    );
    expect(customBuild.style.getPropertyValue("--build-mode-art-url")).toContain(
      "/new-adventure/build-styles/custom-build.webp"
    );
    expect(buildPicker.querySelector(".build-mode-divider")).toHaveTextContent("OR");
  });

  it("uses offensive spells and complete equipment defaults for Quick Build", () => {
    const selectedSpells = quickBuildSpellSelectionFor(
      "Wizard",
      [
        { level: "Cantrip", base: ["Fire Bolt", "Mage Hand"] },
        { level: "1st level", base: ["Burning Hands", "Magic Missile"] },
        { level: "3rd level", base: ["Fireball", "Lightning Bolt"] }
      ],
      {
        cantrips: 1,
        leveledSpells: 2,
        availableLevels: ["Cantrip", "1st level", "3rd level"],
        spellSlotsText: "Test slots"
      }
    );

    expect(selectedSpells).toEqual(["Fire Bolt", "Burning Hands", "Fireball"]);
    expect(quickBuildEquipmentSelectionsFor("Fighter")).toMatchObject({
      armor: { optionId: "chain-mail" },
      "weapon-1": { optionId: "martial-and-shield", customItems: ["Longsword"] },
      "weapon-2": { optionId: "light-crossbow" },
      pack: { optionId: "dungeoneers-pack" }
    });
  });

  it("shows spell details while choosing a custom wizard build", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /wizard/i }));
    await nextCharacterStep();
    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: "Point Buy" }));
    await nextCharacterStep();
    await nextCharacterStep();

    expect(screen.getByRole("group", { name: "Spells" })).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Non PHB Spells" })[0]
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Fireball spell details" })
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Fireball" })).toBeInTheDocument();
    expect(within(dialog).getByText("Rolls Involved")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close spell details" })
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("assigns Quick Build rolls to each class's prioritized abilities", () => {
    expect(
      quickBuildStatAssignmentsFor("Fighter", [8, 18, 10, 13, 15, 12])
    ).toEqual({
      assignments: {
        str: 1,
        dex: 3,
        con: 4,
        int: 2,
        wis: 5,
        cha: 0
      },
      scores: {
        str: 18,
        dex: 13,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8
      }
    });
  });

  it("shows campaign worlds as banner choices with generated art", async () => {
    render(<NewAdventureForm />);

    await continueFlow();

    expect(
      screen.getByRole("heading", { name: /choose the campaign world/i })
    ).toBeInTheDocument();

    expect(
      screen
        .getByRole("button", { name: /eldermere/i })
        .style.getPropertyValue("--genre-banner-url")
    ).toContain("/new-adventure/eldermere-banner.webp");
    expect(
      screen
        .getByRole("button", { name: /custom world/i })
        .style.getPropertyValue("--genre-banner-url")
    ).toContain("/new-adventure/custom-world-banner.webp");
  });

  it("shows species stat bonuses as muted subtitles", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
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

  it("shows subclass art and descriptions on the dedicated class choices step", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await nextCharacterStep();
    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your class choices/i })
    ).toBeInTheDocument();
    const subclassPicker = screen.getByRole("group", {
      name: "Martial Archetype"
    });
    const champion = within(subclassPicker).getByRole("button", {
      name: /champion/i
    });

    expect(champion).toHaveClass("art-option-card");
    expect(champion.style.getPropertyValue("--option-art-url")).toContain(
      "/new-adventure/options/subclasses/champion.webp"
    );
    expect(champion).toHaveTextContent(
      "Wins through athletic excellence and relentless martial force."
    );
  });

  it("renders art-backed tools, backgrounds, skills, and weapon damage choices", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await choosePointBuyStats();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your proficiencies/i })
    ).toBeInTheDocument();
    const diceSet = screen.getByRole("button", { name: /dice set/i });

    expect(diceSet).toHaveClass("art-option-card");
    expect(diceSet.style.getPropertyValue("--option-art-url")).toContain(
      "/new-adventure/options/tools/dice-set.webp"
    );

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your background/i })
    ).toBeInTheDocument();
    const folkHero = screen.getByRole("button", { name: /folk hero/i });

    expect(folkHero).toHaveClass("art-option-card");
    expect(folkHero.style.getPropertyValue("--option-art-url")).toContain(
      "/new-adventure/options/backgrounds/folk-hero.webp"
    );

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your skills/i })
    ).toBeInTheDocument();
    const athletics = screen.getByRole("button", { name: /athletics/i });

    expect(athletics).toHaveClass("art-option-card");
    expect(athletics.style.getPropertyValue("--option-art-url")).toContain(
      "/new-adventure/options/skills/athletics.webp"
    );

    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /chain mail/i }));
    await nextCharacterStep();

    fireEvent.click(
      screen.getByRole("button", { name: /one martial weapon and a shield/i })
    );

    const battleaxe = within(screen.getByRole("dialog")).getByRole("button", {
      name: /^battleaxe/i
    });
    const weaponGrid = battleaxe.closest(".equipment-modal-options");
    const weaponModal = battleaxe.closest(".equipment-modal");

    expect(battleaxe.style.getPropertyValue("--option-art-url")).toContain(
      "/new-adventure/options/weapons/battleaxe.webp"
    );
    expect(battleaxe).toHaveClass("art-option-card");
    expect(weaponModal).toHaveClass("weapon-equipment-modal");
    expect(weaponGrid).toHaveClass("weapon-equipment-modal-options");
    expect(battleaxe).toHaveTextContent("1d8 slashing");
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    fireEvent.click(battleaxe);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
  });

  it("keeps equipment modals open for multi-weapon choices until confirmed", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await choosePointBuyStats();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /chain mail/i }));
    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /two martial weapons/i }));

    const confirmButton = screen.getByRole("button", { name: /confirm/i });

    expect(confirmButton).toBeDisabled();

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^battleaxe/i
      })
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^longsword/i
      })
    );

    expect(confirmButton).toBeEnabled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^battleaxe/i
      })
    ).toHaveClass("selected");
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^longsword/i
      })
    ).toHaveClass("selected");

    fireEvent.click(confirmButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /two martial weapons/i })
    ).toHaveTextContent("Battleaxe, Longsword");
  });

  it("limits class skill choices to two selections", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await choosePointBuyStats();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /choose your skills/i })
    ).toBeInTheDocument();

    const athletics = screen.getByRole("button", { name: /athletics/i });
    const perception = screen.getByRole("button", { name: /perception/i });
    const intimidation = screen.getByRole("button", { name: /intimidation/i });
    const survival = screen.getByRole("button", { name: /survival/i });

    expect(athletics).toHaveAttribute("aria-pressed", "true");
    expect(perception).toHaveAttribute("aria-pressed", "true");
    expect(intimidation).toBeDisabled();

    fireEvent.click(athletics);

    expect(intimidation).not.toBeDisabled();

    fireEvent.click(intimidation);

    expect(intimidation).toHaveAttribute("aria-pressed", "true");
    expect(survival).toBeDisabled();
  });

  it("shows pack contents in equipment subtitles", async () => {
    render(<NewAdventureForm />);

    await continueFlow();
    await continueFlow();
    chooseCustomBuild();
    await choosePointBuyStats();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();
    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /chain mail/i }));
    await nextCharacterStep();

    fireEvent.click(
      screen.getByRole("button", { name: /one martial weapon and a shield/i })
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^battleaxe/i
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await nextCharacterStep();

    fireEvent.click(
      screen.getByRole("button", { name: /light crossbow and 20 bolts/i })
    );
    await nextCharacterStep();

    const dungeoneersPack = screen.getByRole("button", {
      name: /dungeoneer's pack/i
    });

    expect(dungeoneersPack).toHaveTextContent("Crowbar");
    expect(dungeoneersPack).toHaveTextContent("10 days of rations");
    expect(
      dungeoneersPack.style.getPropertyValue("--option-art-url")
    ).toContain("/new-adventure/options/packs/dungeoneer-s-pack.webp");
  });

  it("validates identity and creates the campaign from Continue", async () => {
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
    expect(
      screen.getByText(
        "Its highly recommended you write your own backstory to be more immersed in your character, but if you're too lazy to do that, you can just skip it ;)"
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate story/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add details/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Optional: Write Backstory"), {
      target: { value: "Raised among lighthouse keepers beneath twin moons." }
    });
    expect(
      screen.queryByRole("checkbox", {
        name: /let ai taverns add unto my backstory/i
      })
    ).not.toBeInTheDocument();

    generateCharacterBackstoryMock.mockResolvedValueOnce({
      backstory:
        "Raised among lighthouse keepers beneath Selwick's tide bells, Mira learned that every warning light carried a debt."
    });

    await nextCharacterStep();

    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();
    expect(generateCharacterBackstoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "add_details",
        currentBackstory: "Raised among lighthouse keepers beneath twin moons."
      })
    );

    expect(screen.getByLabelText("Image model")).toHaveValue("openai");
    expect(screen.getByLabelText("Art style")).toHaveValue("ink_and_watercolor");
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await act(async () => {});

    expect(createCampaignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "single_player",
        playerName: "Mira Vale",
        characterName: "Mira Vale",
        characterSheet: expect.stringContaining(
          "Raised among lighthouse keepers beneath Selwick's tide bells"
        )
      })
    );
    const createdCharacterSheet =
      createCampaignMock.mock.calls[0]?.[0].characterSheet ?? "";
    expect(createdCharacterSheet).toContain(
      "Gear: Backpack, Crowbar, Hammer, 10 pitons, 10 torches, Tinderbox, Waterskin, 50 feet hempen rope"
    );
    expect(createdCharacterSheet).toContain("Consumables: 10 days of rations");
    expect(createdCharacterSheet).not.toContain("Dungeoneer's pack");
    expect(createdCharacterSheet).toContain(
      [
        "Ability Scores",
        "Strength: 11 (+0)",
        "Dexterity: 11 (+0)",
        "Constitution: 11 (+0)",
        "Intelligence: 11 (+0)",
        "Wisdom: 11 (+0)",
        "Charisma: 11 (+0)"
      ].join("\n")
    );
    expect(generateCharacterPortraitMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        artStyle: "ink_and_watercolor",
        imageModel: "openai",
        background: true
      })
    );
    expect(previewCharacterPortraitMock).not.toHaveBeenCalled();
    expect(uploadCharacterPortraitMock).not.toHaveBeenCalled();
  });

  it("generates a blank identity backstory before continuing", async () => {
    let resolveBackstory:
      | ((
          value:
            | { backstory: string }
            | PromiseLike<{ backstory: string }>
        ) => void)
      | undefined;
    generateCharacterBackstoryMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBackstory = resolve;
      })
    );

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(
      screen.getByRole("button", { name: "Generating backstory..." })
    ).toBeDisabled();
    expect(screen.queryByText("Writing your backstory")).not.toBeInTheDocument();
    expect(generateCharacterBackstoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "generate",
        characterSheet: expect.stringContaining("Character Name: Mira Vale")
      })
    );

    await act(async () => {
      resolveBackstory?.({
        backstory: "Mira follows a salt-stained promise toward Selwick."
      });
    });

    expect(screen.getByPlaceholderText("Optional: Write Backstory")).toHaveValue(
      "Mira follows a salt-stained promise toward Selwick."
    );
    await finishFlowTransition();

    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();
  });

  it("adds details to very short manual Eldermere backstories before continuing", async () => {
    let resolveBackstory:
      | ((
          value:
            | { backstory: string }
            | PromiseLike<{ backstory: string }>
        ) => void)
      | undefined;
    generateCharacterBackstoryMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBackstory = resolve;
      })
    );

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });
    fireEvent.change(screen.getByPlaceholderText("Optional: Write Backstory"), {
      target: { value: "Mira owes a debt." }
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByRole("button", { name: "Adding details..." })).toBeDisabled();
    expect(generateCharacterBackstoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "add_details",
        currentBackstory: "Mira owes a debt.",
        campaignGenrePresetId: "eldermere"
      })
    );

    await act(async () => {
      resolveBackstory?.({
        backstory:
          "Mira owes a debt in Selwick, where old promises travel faster than ships."
      });
    });
    await finishFlowTransition();

    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();
  });

  it("localizes long manual Eldermere backstories before continuing", async () => {
    let resolveBackstory:
      | ((
          value:
            | {
                backstory: string;
                eldermereStart?: {
                  regionName: string;
                  settlementName: string;
                  reason?: string;
                };
              }
            | PromiseLike<{
                backstory: string;
                eldermereStart?: {
                  regionName: string;
                  settlementName: string;
                  reason?: string;
                };
              }>
        ) => void)
      | undefined;
    const manualBackstory =
      "Mira left her harbor home after a dockside creditor tied her family's debt to an old coastal tax, and she still carries the receipt in her boot.";
    generateCharacterBackstoryMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBackstory = resolve;
      })
    );

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });
    fireEvent.change(screen.getByPlaceholderText("Optional: Write Backstory"), {
      target: { value: manualBackstory }
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(
      screen.getByRole("button", { name: "Localizing backstory..." })
    ).toBeDisabled();
    expect(generateCharacterBackstoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "localize",
        currentBackstory: manualBackstory,
        campaignGenrePresetId: "eldermere",
        characterSheet: expect.stringContaining(manualBackstory)
      })
    );

    await act(async () => {
      resolveBackstory?.({
        backstory:
          "Mira left her harbor home for Selwick after a dockside creditor tied her family's debt to an old Salt Concordat tithe.",
        eldermereStart: {
          regionName: "The Salt Concordat",
          settlementName: "Selwick"
        }
      });
    });
    await finishFlowTransition();

    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await finishFlowTransition();

    expect(
      screen.getByRole("heading", { name: /choose your identity/i })
    ).toBeInTheDocument();

    await nextCharacterStep();

    expect(generateCharacterBackstoryMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();
  });

  it("passes generated Eldermere start into campaign creation", async () => {
    generateCharacterBackstoryMock.mockResolvedValueOnce({
      backstory: "Mira owes a debt to a Selwick shipwright.",
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick",
        reason: "The generated backstory centers on Selwick maritime debt."
      }
    });

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });
    await nextCharacterStep();

    expect(generateCharacterBackstoryMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: /create your character art/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await act(async () => {});

    expect(createCampaignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eldermereStart: {
          regionName: "The Salt Concordat",
          settlementName: "Selwick",
          reason: "The generated backstory centers on Selwick maritime debt."
        },
        characterSheet: expect.stringContaining(
          "Mira owes a debt to a Selwick shipwright."
        )
      })
    );
  });

  it("uses the shared rune loader while campaign creation starts portrait generation", async () => {
    generateCharacterPortraitMock.mockReturnValue(
      new Promise(() => {})
    );

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });

    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("Preparing your campaign")).toHaveClass(
      "rune-loader"
    );
    expect(
      screen.getByText("0%")
    ).toHaveClass("campaign-prep-loader-note");

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText("Integrating your backstory")).toHaveClass(
      "rune-loader"
    );
  });

  it("recovers when background art start fails during campaign creation", async () => {
    generateCharacterPortraitMock.mockRejectedValue(
      new Error("The portrait easel cracked.")
    );

    render(<NewAdventureForm />);

    await advanceSingleplayerToIdentity();

    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Mira Vale" }
    });

    await nextCharacterStep();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await act(async () => {});

    expect(createCampaignMock).toHaveBeenCalledTimes(1);
    expect(generateCharacterPortraitMock).toHaveBeenCalledTimes(1);
    expect(uploadCharacterPortraitMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The portrait easel cracked."
    );
    expect(screen.getByRole("button", { name: /retry portrait/i })).toBeEnabled();
  });
});

describe("finalAbilityScoresFor", () => {
  it("combines species and class bonuses into playable totals", () => {
    expect(
      finalAbilityScoresFor(
        {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10
        },
        "Half-Orc",
        "Barbarian",
        "+1 Strength and +1 Constitution"
      )
    ).toEqual({
      str: 13,
      dex: 10,
      con: 12,
      int: 10,
      wis: 10,
      cha: 10
    });
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
    ["Fire Bolt", "2d10 fire damage at Level 5"],
    ["Sacred Flame", "2d8 radiant damage at Level 5"],
    ["Cure Wounds", "1d8 + your spellcasting modifier"],
    ["Magic Missile", "3d4 + 3 force damage"],
    ["Fireball", "8d6 fire damage, +1d6 per slot level above 3rd"],
    ["Bless", "add 1d4 to attack rolls and saving throws"],
    ["Prestidigitation", "Resolve with your spell save DC"]
  ])("describes %s roll handling", (spell, rollText) => {
    expect(spellRollsFor(spell)).toContain(rollText);
  });

  it("builds a complete spell detail profile", () => {
    expect(spellDetailFor("Fireball", "3rd level")).toEqual(
      expect.objectContaining({
        levelLabel: "3rd level",
        school: "Evocation",
        duration: "Instantaneous",
        castingTime: "1 action",
        range: "150 feet",
        components: ["V", "S", "M"],
        material: "A tiny ball of bat guano and sulfur.",
        rolls: "8d6 fire damage at spell slot level 3 | DEX saving throw; success: half | 20-foot sphere"
      })
    );
    expect(spellDetailFor("Fireball", "3rd level").description.join(" ")).toContain(
      "A bright streak flashes from your pointing finger"
    );
    expect(spellDetailFor("Fireball", "3rd level").higherLevel.join(" ")).toContain(
      "When you cast this spell using a spell slot of 4th level or higher"
    );
  });
});
