import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultCharacterSheet,
  PlayerPanel,
  type PlayerProfile
} from "./PlayerPanel";

const storageKeys = {
  username: "ai-dnd.username",
  characterName: "ai-dnd.characterName",
  characterSheet: "ai-dnd.characterSheet"
};

function playerProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    username: "Maya",
    characterName: "Lyra",
    characterSheet: "Name: Lyra\nClass / Level: Rogue 3",
    ...overrides
  };
}

function renderPlayerPanel(
  overrides: Partial<ComponentProps<typeof PlayerPanel>> = {}
) {
  const props = {
    onProfileChange: vi.fn(),
    onProfileUpdate: vi.fn(),
    ...overrides
  } satisfies ComponentProps<typeof PlayerPanel>;

  render(<PlayerPanel {...props} />);

  return props;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("PlayerPanel", () => {
  it("loads the initial profile when no saved profile exists", async () => {
    const props = renderPlayerPanel({
      initialProfile: playerProfile()
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/lyra portrait/i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Maya")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lyra")).toBeInTheDocument();
    expect(props.onProfileChange).toHaveBeenLastCalledWith(playerProfile());
    expect(localStorage.getItem(storageKeys.username)).toBe("Maya");
    expect(localStorage.getItem(storageKeys.characterName)).toBe("Lyra");
  });

  it("prefers saved profile fields over the initial profile", async () => {
    localStorage.setItem(storageKeys.username, "Saved Player");
    localStorage.setItem(storageKeys.characterName, "Stored Hero");
    localStorage.setItem(storageKeys.characterSheet, "Name: Stored Hero");

    const props = renderPlayerPanel({
      initialProfile: playerProfile({
        username: "Initial Player",
        characterName: "Initial Hero",
        characterSheet: "Name: Initial Hero"
      })
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Saved Player")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Stored Hero")).toBeInTheDocument();
    expect(screen.getByLabelText(/stored hero portrait/i)).toBeInTheDocument();
    expect(props.onProfileChange).toHaveBeenLastCalledWith({
      username: "Saved Player",
      characterName: "Stored Hero",
      characterSheet: "Name: Stored Hero"
    });
  });

  it("updates profile fields, persists them, and sends update callbacks", async () => {
    const props = renderPlayerPanel({
      initialProfile: playerProfile()
    });

    const usernameInput = await screen.findByDisplayValue("Maya");
    const characterInput = screen.getByDisplayValue("Lyra");

    fireEvent.change(usernameInput, { target: { value: "Rowan" } });
    fireEvent.change(characterInput, { target: { value: "Thorn" } });

    await waitFor(() => {
      expect(localStorage.getItem(storageKeys.username)).toBe("Rowan");
      expect(localStorage.getItem(storageKeys.characterName)).toBe("Thorn");
    });

    fireEvent.click(screen.getByRole("button", { name: /update profile/i }));

    expect(props.onProfileChange).toHaveBeenLastCalledWith({
      username: "Rowan",
      characterName: "Thorn",
      characterSheet: playerProfile().characterSheet
    });
    expect(props.onProfileUpdate).toHaveBeenCalledWith({
      username: "Rowan",
      characterName: "Thorn",
      characterSheet: playerProfile().characterSheet
    });
  });

  it("opens, edits, persists, and closes the character sheet dialog", async () => {
    const props = renderPlayerPanel({
      initialProfile: playerProfile({
        username: "",
        characterName: "",
        characterSheet: ""
      })
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/character portrait/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /view character sheet/i }));

    const dialog = screen.getByRole("dialog", { name: /character sheet/i });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /unnamed character/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox")).toHaveValue(defaultCharacterSheet);

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Name: Thorn\nInventory: brass key" }
    });

    await waitFor(() => {
      expect(localStorage.getItem(storageKeys.characterSheet)).toBe(
        "Name: Thorn\nInventory: brass key"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /close character sheet/i }));

    expect(screen.queryByRole("dialog", { name: /character sheet/i })).not.toBeInTheDocument();
    expect(props.onProfileChange).toHaveBeenLastCalledWith({
      username: "",
      characterName: "",
      characterSheet: "Name: Thorn\nInventory: brass key"
    });
  });
});
