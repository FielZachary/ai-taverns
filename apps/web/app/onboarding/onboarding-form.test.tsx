import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { newAdventureFormMock } = vi.hoisted(() => ({
  newAdventureFormMock: vi.fn(() => <div>Adventure setup</div>),
}));

vi.mock("../new-adventure/new-adventure-form", () => ({
  NewAdventureForm: newAdventureFormMock
}));

import { OnboardingForm } from "./onboarding-form";

describe("OnboardingForm", () => {
  it("starts the adventure form in onboarding mode", () => {
    render(<OnboardingForm userId="user-1" />);

    expect(newAdventureFormMock).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding: true, userId: "user-1" }),
      undefined
    );
  });
});
