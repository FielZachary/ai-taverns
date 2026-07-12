import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewAdventureForm } from "./new-adventure-form";

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
      screen.getByRole("heading", { name: /choose your class/i })
    ).toBeInTheDocument();
  });
});
