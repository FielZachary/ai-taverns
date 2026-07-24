import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ComponentProps,
  FormEvent
} from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import type { DiceRollRequest } from "@/lib/game-types";
import {
  PlayerInput,
  type PlayerInputMode,
  type QueuedDice
} from "./PlayerInput";

function requiredRoll(overrides: Partial<DiceRollRequest> = {}): DiceRollRequest {
  return {
    id: "roll-1",
    dice: "1d20",
    label: "Dexterity save",
    ...overrides
  };
}

function renderPlayerInput(
  overrides: Partial<ComponentProps<typeof PlayerInput>> = {}
) {
  const props = {
    draft: "I open the cellar door.",
    mode: "turn" as PlayerInputMode,
    isSending: false,
    isSubmitted: false,
    validationPulse: 0,
    onDraftChange: vi.fn(),
    onModeChange: vi.fn(),
    onRollDice: vi.fn(),
    onSubmit: vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    }),
    ...overrides
  };

  render(<PlayerInput {...props} />);

  return props;
}

describe("PlayerInput", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens model settings and persists the selected model", () => {
    renderPlayerInput();

    fireEvent.click(screen.getByRole("button", { name: /ai model: default/i }));

    expect(screen.getByRole("dialog", { name: /ai model/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "DeepSeek Reasoner" }));

    expect(localStorage.getItem("ai-dnd.aiModel")).toBe("deepseek-reasoner");
    expect(screen.queryByRole("dialog", { name: /ai model/i })).not.toBeInTheDocument();
  });

  it("shows validation messages and locks submitted turn input", () => {
    const props = renderPlayerInput({
      isSubmitted: true,
      lockMessage: "Waiting on another player",
      validationMessage: "The DM is waiting on another player.",
      validationPulse: 2,
      onSkipTurn: vi.fn()
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The DM is waiting on another player."
    );
    expect(screen.getByText("Waiting on another player")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /skip/i })).toBeDisabled();

    fireEvent.submit(screen.getByRole("button", { name: /send/i }).closest("form")!);

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("switches input modes and uses ask-DM copy in ask mode", () => {
    const turnProps = renderPlayerInput();

    fireEvent.click(screen.getByRole("button", { name: /ask dm/i }));

    expect(turnProps.onModeChange).toHaveBeenCalledWith("ask_dm");

    renderPlayerInput({
      mode: "ask_dm",
      draft: "What do I know about the sigil?"
    });

    expect(
      screen.getByPlaceholderText("Ask the DM a question without advancing time...")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask$/i })).toBeEnabled();
    expect(
      screen.getAllByRole("button", { name: /open dice roller/i })[1]
    ).toBeDisabled();
  });

  it("enables skip turns only when multiplayer turn input is actionable", () => {
    const onSkipTurn = vi.fn();
    renderPlayerInput({ onSkipTurn });

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(onSkipTurn).toHaveBeenCalledTimes(1);
  });

  it("queues freeform dice and rolls the selected dice", () => {
    const onRollDice = vi.fn();
    renderPlayerInput({ onRollDice });

    fireEvent.click(screen.getByRole("button", { name: /open dice roller/i }));

    expect(screen.getByRole("dialog", { name: /dice roller/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "d4" }));
    fireEvent.click(screen.getByRole("button", { name: "d41" }));
    fireEvent.click(screen.getByRole("button", { name: "d20" }));
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));

    expect(onRollDice).toHaveBeenCalledWith({
      d4: 2,
      d20: 1
    } satisfies QueuedDice);
    expect(screen.queryByRole("dialog", { name: /dice roller/i })).not.toBeInTheDocument();
  });

  it("prefills and submits required roll dice while locking text submission", async () => {
    const onRollDice = vi.fn();
    renderPlayerInput({
      requiredRoll: requiredRoll({ dice: "1d20" }),
      requiredRollExpression: "1d20 + 2d6",
      requiredQueuedDice: {
        d20: 1,
        d6: 2
      },
      onRollDice
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /roll 1d20 \+ 2d6/i }))
        .toHaveTextContent("Dice");
    });

    expect(screen.getByText("Roll to continue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /roll 1d20 \+ 2d6/i }));
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));

    expect(onRollDice).toHaveBeenCalledWith({
      d20: 1,
      d6: 2
    } satisfies QueuedDice);
  });
});
