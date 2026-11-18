import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomizePromptOverlay } from "./CustomizePromptOverlay";

const fetchMock = vi.fn();

describe("CustomizePromptOverlay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("shows the default Global Rules as muted read-only text and uses it when starting an override", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ overrides: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CustomizePromptOverlay
        roomId="room-1"
        sessionId="session-1"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Global Rules" }));

    const textarea = await screen.findByRole("textbox", {
      name: "Global Rules prompt",
    });
    expect((textarea as HTMLTextAreaElement).value).toContain("Global DM Runtime Rules:");
    expect((textarea as HTMLTextAreaElement).value).toContain("Highest-Priority Narration Voice:");
    expect((textarea as HTMLTextAreaElement).value).toContain("Inventory state:");
    expect((textarea as HTMLTextAreaElement).value).toContain("Semantic narration markup:");
    expect(textarea).toHaveAttribute("readonly");
    expect(textarea).toHaveClass("customize-prompt-readonly");

    fireEvent.click(screen.getByLabelText("Override Default Prompt"));

    await waitFor(() => expect(textarea).not.toHaveAttribute("readonly"));
    expect((textarea as HTMLTextAreaElement).value).toContain("Global DM Runtime Rules:");
    expect(
      screen.getByText(
        "These are the instructions shared by every narrator job in this campaign. Overriding this prompt replaces the default shared rules for NPC Dialogue, Combat, Scene Director, Clarification, and Out of Character.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the job editors limited to their job-specific prompt", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ overrides: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CustomizePromptOverlay
        roomId="room-1"
        sessionId="session-1"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Combat" }));

    const textarea = await screen.findByRole("textbox", {
      name: "Combat prompt",
    });
    const value = (textarea as HTMLTextAreaElement).value;

    expect(value).toContain("Combat Narrator");
    expect(value).not.toContain("Global DM Runtime Rules:");
    expect(value).not.toContain("Highest-Priority Narration Voice:");
    expect(value).not.toContain("Inventory state:");
    expect(value).not.toContain("Semantic narration markup:");
    expect(screen.getByText(/This override affects Combat only/)).toBeInTheDocument();
  });
});
