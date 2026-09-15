import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { newAdventureFormMock, trackAnalyticsMock } = vi.hoisted(() => ({
  newAdventureFormMock: vi.fn(() => <div>Adventure setup</div>),
  trackAnalyticsMock: vi.fn()
}));

vi.mock("../new-adventure/new-adventure-form", () => ({
  NewAdventureForm: newAdventureFormMock
}));

vi.mock("@/lib/analytics", () => ({
  trackAnalytics: trackAnalyticsMock
}));

import { OnboardingForm } from "./onboarding-form";

describe("OnboardingForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows a welcome before asking for the referral source", () => {
    render(<OnboardingForm />);

    expect(
      screen.getByRole("heading", { name: "Welcome, traveller." })
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));

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
  });

  it("records the selected source and starts the onboarding adventure flow", () => {
    render(<OnboardingForm userId="user-1" />);
    act(() => vi.advanceTimersByTime(2_000));

    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));

    expect(trackAnalyticsMock).toHaveBeenCalledWith({
      name: "Onboarding Referral Source Selected",
      properties: { referralSource: "Instagram" }
    });
    expect(newAdventureFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding: true, userId: "user-1" }),
      undefined
    );
  });
});
