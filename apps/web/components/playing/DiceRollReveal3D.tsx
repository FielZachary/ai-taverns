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

declare global {
  interface Window {
    "dice-box-threejs"?: DiceBoxConstructor;
  }
}

type DiceRollReveal3DProps = {
  notation: string;
  expression: string;
  total: number;
  onComplete: () => void;
};

let diceBoxScriptPromise: Promise<DiceBoxConstructor> | null = null;

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function loadDiceBoxConstructor(): Promise<DiceBoxConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Dice animation is browser-only."));
  }

  if (window["dice-box-threejs"]) {
    return Promise.resolve(window["dice-box-threejs"]);
  }

  if (!diceBoxScriptPromise) {
    diceBoxScriptPromise = new Promise<DiceBoxConstructor>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-dice-box-threejs="true"]'
      );

      if (existingScript) {
        if (existingScript.dataset.loaded === "true") {
          const DiceBox = window["dice-box-threejs"];

          if (DiceBox) {
            resolve(DiceBox);
            return;
          }

          existingScript.remove();
          diceBoxScriptPromise = null;
        } else {
          existingScript.addEventListener("load", () => {
            const DiceBox = window["dice-box-threejs"];
            DiceBox
              ? resolve(DiceBox)
              : reject(new Error("DiceBox did not load."));
          });
          existingScript.addEventListener("error", () => {
            diceBoxScriptPromise = null;
            reject(new Error("DiceBox script failed to load."));
          });
          return;
        }
      }

      const script = document.createElement("script");
      script.src = "/vendor/dice-box-threejs.umd.js";
      script.async = true;
      script.dataset.diceBoxThreejs = "true";
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        const DiceBox = window["dice-box-threejs"];
        DiceBox ? resolve(DiceBox) : reject(new Error("DiceBox did not load."));
      });
      script.addEventListener("error", () => {
        diceBoxScriptPromise = null;
        reject(new Error("DiceBox script failed to load."));
      });
      document.head.appendChild(script);
    }).catch((error) => {
      diceBoxScriptPromise = null;
      throw error;
    });
  }

  return diceBoxScriptPromise;
}

export function DiceRollReveal3D({
  notation,
  expression,
  total,
  onComplete
}: DiceRollReveal3DProps) {
  const [status, setStatus] = useState<"loading" | "rolling" | "fallback" | "complete">(
    "loading"
  );
  const reactId = useId();
  const containerId = useMemo(
    () => `dice-roll-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId]
  );

  useEffect(() => {
    let isCancelled = false;
    let hasFinished = false;
    let fallbackTimer: number | undefined;
    let safetyTimer: number | undefined;
    let diceBox: DiceBoxInstance | undefined;

    function finishWithFallback() {
      if (isCancelled || hasFinished) {
        return;
      }

      hasFinished = true;
      setStatus("fallback");
      fallbackTimer = window.setTimeout(() => {
        if (!isCancelled) {
          onComplete();
        }
      }, 900);
    }

    async function rollDice() {
      safetyTimer = window.setTimeout(finishWithFallback, 7000);

      try {
        const DiceBox = await loadDiceBoxConstructor();
        await nextFrame();
        await nextFrame();

        if (isCancelled) {
          return;
        }

        const container = document.getElementById(containerId);

        if (!container || !container.clientWidth || !container.clientHeight) {
          throw new Error("Dice reveal container is not ready.");
        }

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

        setStatus("rolling");
        await diceBox.roll(notation);

        if (!isCancelled && !hasFinished) {
          hasFinished = true;
          if (safetyTimer) {
            window.clearTimeout(safetyTimer);
          }
          setStatus("complete");
          window.setTimeout(onComplete, 450);
        }
      } catch (error) {
        console.error("3D dice roll failed.", error);
        if (safetyTimer) {
          window.clearTimeout(safetyTimer);
        }
        finishWithFallback();
      }
    }

    void rollDice();

    return () => {
      isCancelled = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      if (safetyTimer) {
        window.clearTimeout(safetyTimer);
      }
      diceBox?.clearDice?.();
      document.getElementById(containerId)?.replaceChildren();
    };
  }, [containerId, notation, onComplete]);

  const isFallbackVisible = status === "loading" || status === "fallback";

  return (
    <div className="dice-reveal-backdrop" aria-live="polite" role="status">
      <div className="dice-reveal-panel">
        <div id={containerId} className="dice-reveal-canvas" />
        {isFallbackVisible ? (
          <div className="dice-reveal-fallback">
            <span className="dice-reveal-fallback-die">
              {status === "fallback" ? total : ""}
            </span>
          </div>
        ) : null}
        <div className="dice-reveal-summary">
          <span>{expression}</span>
          <strong>{status === "complete" || status === "fallback" ? total : "Rolling"}</strong>
        </div>
      </div>
    </div>
  );
}
