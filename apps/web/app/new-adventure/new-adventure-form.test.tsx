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
});
