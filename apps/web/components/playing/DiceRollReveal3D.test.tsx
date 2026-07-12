import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiceRollReveal3D } from "./DiceRollReveal3D";

class MockAudio {
  currentTime = 0;
  volume = 1;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
}

function setupBrowserAnimationMocks() {
  const requestAnimationFrameSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      window.setTimeout(() => callback(performance.now()), 0);
      return 1;
    });

  return () => {
    requestAnimationFrameSpy.mockRestore();
  };
}

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("DiceRollReveal3D", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", MockAudio);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document
      .querySelectorAll('script[data-dice-box-threejs="true"]')
      .forEach((script) => script.remove());
    delete window["dice-box-threejs"];
  });

  it("shows a fallback result and completes when the dice script fails", async () => {
    const onComplete = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <DiceRollReveal3D
        notation="2d6"
        expression="2d6 + 3"
        total={11}
        onComplete={onComplete}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("2d6 + 3");
    expect(screen.getByRole("status")).toHaveTextContent("Rolling");

    const script = document.querySelector<HTMLScriptElement>(
      'script[data-dice-box-threejs="true"]'
    );

    expect(script).not.toBeNull();

    await act(async () => {
      script?.dispatchEvent(new Event("error"));
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("11");
    expect(onComplete).not.toHaveBeenCalled();

    await advanceTimers(899);

    expect(onComplete).not.toHaveBeenCalled();

    await advanceTimers(1);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("initializes the dice box, rolls the notation, and completes after a successful roll", async () => {
    const restoreBrowserMocks = setupBrowserAnimationMocks();
    const initialize = vi.fn().mockResolvedValue(undefined);
    let resolveRoll: (result: { total: number }) => void;
    const roll = vi.fn(
      () =>
        new Promise<{ total: number }>((resolve) => {
          resolveRoll = resolve;
        })
    );
    const clearDice = vi.fn();
    const DiceBox = vi.fn(function MockDiceBox() {
      return {
        initialize,
        roll,
        clearDice
      };
    });
    const onComplete = vi.fn();

    window["dice-box-threejs"] = DiceBox;

    const { unmount } = render(
      <DiceRollReveal3D
        notation="1d20@17"
        expression="Dexterity save"
        total={17}
        onComplete={onComplete}
      />
    );
    const canvas = document.querySelector<HTMLElement>(".dice-reveal-canvas");

    expect(canvas).not.toBeNull();
    Object.defineProperty(canvas, "clientWidth", {
      configurable: true,
      value: 640
    });
    Object.defineProperty(canvas, "clientHeight", {
      configurable: true,
      value: 320
    });

    await flushAsyncWork();
    await advanceTimers(0);
    await flushAsyncWork();
    await advanceTimers(0);
    await flushAsyncWork();

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(roll).toHaveBeenCalledWith("1d20@17");

    expect(DiceBox).toHaveBeenCalledWith(
      expect.stringMatching(/^#dice-roll-/),
      expect.objectContaining({
        assetPath: "/",
        sounds: false,
        theme_surface: "green-felt"
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Rolling");

    await act(async () => {
      resolveRoll({ total: 17 });
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("17");
    expect(onComplete).not.toHaveBeenCalled();

    await advanceTimers(449);

    expect(onComplete).not.toHaveBeenCalled();

    await advanceTimers(1);

    expect(onComplete).toHaveBeenCalledTimes(1);

    unmount();

    expect(clearDice).toHaveBeenCalledTimes(1);
    restoreBrowserMocks();
  });
});
