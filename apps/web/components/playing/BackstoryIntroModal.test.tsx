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
});
