import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackstoryIntroModal } from "./BackstoryIntroModal";

describe("BackstoryIntroModal", () => {
  it("shows the backstory and keeps Continue disabled during the countdown", () => {
    const onContinue = vi.fn();

    const { rerender } = render(
      <BackstoryIntroModal
        backstory="Mira grew up beside a lighthouse."
        countdown={9}
        onContinue={onContinue}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Your Backstory" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mira grew up beside a lighthouse.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue (9)" })).toBeDisabled();

    rerender(
      <BackstoryIntroModal
        backstory="Mira grew up beside a lighthouse."
        countdown={0}
        onContinue={onContinue}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("formats one-blob backstories and explains mentioned world terms", () => {
    render(
      <BackstoryIntroModal
        backstory="You were born in the Ashfell Marches. The Oath Warden died. Ferrant Concord steel reached Thornwake Vale. Sallowholt may hold the answer."
        countdown={0}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("World Terms")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ashfell Marches" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Oath-Ring Warden" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ferrant Concord" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thornwake Vale" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sallowholt" })).toBeInTheDocument();
  });
});
