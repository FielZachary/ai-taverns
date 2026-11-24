import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeveloperChatOverlay } from "./DeveloperChatOverlay";

describe("DeveloperChatOverlay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the support invitation inside the chat modal", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] })
    }));

    render(<DeveloperChatOverlay campaignId="campaign-1" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /chat with developer/i })).toBeInTheDocument();
    expect(screen.getByText(/feel free to msg if you find any bugs/i)).toHaveClass("developer-chat-intro");
    expect(screen.getByText(/reply in 2–3 minutes :D/i)).toBeInTheDocument();
  });
});
