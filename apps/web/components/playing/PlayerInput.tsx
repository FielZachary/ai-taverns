import { forwardRef, type FormEvent, useEffect, useMemo, useState } from "react";
import { Dice5, Send } from "lucide-react";
import type { DiceRollRequest } from "@/lib/game-types";

export type DiceFace = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export type QueuedDice = Partial<Record<DiceFace, number>>;

type PlayerInputProps = {
  draft: string;
  isSending: boolean;
  isSubmitted: boolean;
  lockMessage?: string;
  requiredRoll?: DiceRollRequest | null;
  validationMessage?: string;
  validationPulse: number;
  onDraftChange: (value: string) => void;
  onRollDice: (queuedDice: QueuedDice) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const diceFaces: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

function queuedDiceTotal(queuedDice: QueuedDice) {
  return Object.values(queuedDice).reduce((sum, count) => sum + (count ?? 0), 0);
}

export const PlayerInput = forwardRef<HTMLTextAreaElement, PlayerInputProps>(
  function PlayerInput(
    {
      draft,
      isSending,
      isSubmitted,
      lockMessage,
      requiredRoll,
      validationMessage,
      validationPulse,
      onDraftChange,
      onRollDice,
      onSubmit
    },
    ref
  ) {
    const [isCallingAttention, setIsCallingAttention] = useState(false);
    const [isDicePickerOpen, setIsDicePickerOpen] = useState(false);
    const [queuedDice, setQueuedDice] = useState<QueuedDice>({});

    useEffect(() => {
      if (!validationMessage) {
        setIsCallingAttention(false);
        return;
      }

      setIsCallingAttention(true);
      const timeout = window.setTimeout(() => {
        setIsCallingAttention(false);
      }, 900);

      return () => window.clearTimeout(timeout);
    }, [validationMessage, validationPulse]);

    const overlayMessage = requiredRoll
      ? "Roll to continue"
      : lockMessage || (isSubmitted ? "Submitted." : "");
    const isLocked = Boolean(lockMessage) || isSubmitted;
    const isRollRequired = Boolean(requiredRoll);
    const queuedCount = useMemo(() => queuedDiceTotal(queuedDice), [queuedDice]);

    function incrementDie(face: DiceFace) {
      setQueuedDice((currentDice) => ({
        ...currentDice,
        [face]: (currentDice[face] ?? 0) + 1
      }));
    }

    function clearQueuedDice() {
      setQueuedDice({});
    }

    function rollQueuedDice() {
      if (queuedCount === 0) {
        return;
      }

      onRollDice(queuedDice);
      setQueuedDice({});
      setIsDicePickerOpen(false);
    }

    return (
      <form
        className={`turn-form ${
          validationMessage ? "turn-form-warning" : ""
        } ${isCallingAttention ? "turn-form-attention" : ""} ${
          isLocked ? "turn-form-submitted" : ""
        }`}
        onSubmit={onSubmit}
      >
        {validationMessage ? (
          <p className="turn-form-validation" key={validationPulse} role="alert">
            {validationMessage}
          </p>
        ) : null}
        <div className="dice-roll-control">
          <button
            className="dice-roll-button"
            type="button"
            aria-label={requiredRoll ? `Roll ${requiredRoll.dice}` : "Open dice roller"}
            aria-expanded={isDicePickerOpen}
            disabled={(isLocked && !isRollRequired) || isSending}
            onClick={() => setIsDicePickerOpen((isOpen) => !isOpen)}
          >
            <Dice5 size={22} />
            <span>{queuedCount > 0 ? `${queuedCount} dice` : requiredRoll?.dice ?? "dice"}</span>
          </button>
          {isDicePickerOpen ? (
            <div className="dice-picker-popover" role="dialog" aria-label="Dice roller">
              <div className="dice-picker-options">
                {diceFaces.map((face) => (
                  <button
                    key={face}
                    className="dice-picker-option"
                    type="button"
                    disabled={isSending}
                    onClick={() => incrementDie(face)}
                  >
                    <span>{face}</span>
                    {queuedDice[face] ? <strong>{queuedDice[face]}</strong> : null}
                  </button>
                ))}
              </div>
              <div className="dice-picker-actions">
                <button
                  className="dice-picker-clear"
                  type="button"
                  disabled={queuedCount === 0 || isSending}
                  onClick={clearQueuedDice}
                >
                  Clear
                </button>
                <button
                  className="dice-picker-roll"
                  type="button"
                  disabled={queuedCount === 0 || isSending}
                  onClick={rollQueuedDice}
                >
                  Roll
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="turn-form-input-wrap">
          <textarea
            ref={ref}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Speak, search, attack, bargain..."
            readOnly={isLocked}
            rows={3}
          />
          {overlayMessage ? (
            <div className="turn-form-submitted-label" aria-live="polite">
              {overlayMessage}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={isRollRequired || isLocked || isSending || !draft.trim()}
        >
          <Send size={18} />
          Send
        </button>
      </form>
    );
  }
);
