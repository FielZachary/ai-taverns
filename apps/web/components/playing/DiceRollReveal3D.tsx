"use client";

import { useEffect, useId, useMemo, useState } from "react";

type DiceBoxRollResult = {
  total?: number;
};

type DiceBoxInstance = {
  initialize: () => Promise<void>;
  roll: (notation: string) => Promise<DiceBoxRollResult>;
  clearDice?: () => void;
};

type DiceBoxConstructor = new (
  selector: string,
  config?: Record<string, unknown>
) => DiceBoxInstance;

type DiceRollReveal3DProps = {
  notation: string;
  expression: string;
  total: number;
  onComplete: () => void;
};

export function DiceRollReveal3D({
  notation,
  expression,
  total,
  onComplete
}: DiceRollReveal3DProps) {
  const [isFallbackReady, setIsFallbackReady] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const reactId = useId();
  const containerId = useMemo(
    () => `dice-roll-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId]
  );

  useEffect(() => {
    let isCancelled = false;
    let fallbackTimer: number | undefined;
    let diceBox: DiceBoxInstance | undefined;

    async function rollDice() {
      try {
        const module = (await import("@3d-dice/dice-box-threejs")) as {
          default: DiceBoxConstructor;
        };
        const DiceBox = module.default;
        diceBox = new DiceBox(`#${containerId}`, {
          assetPath: "/",
          shadows: false,
          sounds: false,
          theme_material: "none",
          theme_texture: "",
          theme_surface: "green-felt",
          strength: 1.2,
          gravity_multiplier: 360
        });

        await diceBox.initialize();

        if (isCancelled) {
          return;
        }

        await diceBox.roll(notation);

        if (!isCancelled) {
          setHasCompleted(true);
          window.setTimeout(onComplete, 450);
        }
      } catch (error) {
        console.error("3D dice roll failed.", error);
        setIsFallbackReady(true);
        fallbackTimer = window.setTimeout(() => {
          if (!isCancelled) {
            onComplete();
          }
        }, 1100);
      }
    }

    void rollDice();

    return () => {
      isCancelled = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      diceBox?.clearDice?.();
      document.getElementById(containerId)?.replaceChildren();
    };
  }, [containerId, notation, onComplete]);

  return (
    <div className="dice-reveal-backdrop" aria-live="polite" role="status">
      <div className="dice-reveal-panel">
        <div id={containerId} className="dice-reveal-canvas" />
        <div className="dice-reveal-summary">
          <span>{expression}</span>
          <strong>{hasCompleted || isFallbackReady ? total : "Rolling"}</strong>
        </div>
      </div>
    </div>
  );
}
