import { forwardRef, type FormEvent, useEffect, useState } from "react";
import { Dice5, Send } from "lucide-react";
import type { DiceRollRequest } from "@/lib/game-types";

type PlayerInputProps = {
  draft: string;
  isSending: boolean;
  isSubmitted: boolean;
  lockMessage?: string;
  requiredRoll?: DiceRollRequest | null;
  validationMessage?: string;
  validationPulse: number;
  onDraftChange: (value: string) => void;
  onRollD20: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

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
      onRollD20,
      onSubmit
    },
    ref
  ) {
    const [isCallingAttention, setIsCallingAttention] = useState(false);

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
      ? `Roll ${requiredRoll.dice}: ${requiredRoll.label}`
      : lockMessage || (isSubmitted ? "Submitted." : "");
    const isLocked = Boolean(lockMessage) || isSubmitted;
    const isRollRequired = Boolean(requiredRoll);

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
        <button
          className="dice-roll-button"
          type="button"
          aria-label={requiredRoll ? `Roll ${requiredRoll.dice}` : "Roll d20"}
          disabled={(isLocked && !isRollRequired) || isSending}
          onClick={onRollD20}
        >
          <Dice5 size={22} />
          <span>{requiredRoll?.dice ?? "d20"}</span>
        </button>
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
