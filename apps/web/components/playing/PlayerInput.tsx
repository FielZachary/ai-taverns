import {
  forwardRef,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { DiceRollRequest } from "@/lib/game-types";

export type DiceFace = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export type QueuedDice = Partial<Record<DiceFace, number>>;
export type PlayerInputMode = "turn" | "ask_dm";

type PlayerInputProps = {
  draft: string;
  mode: PlayerInputMode;
  isSending: boolean;
  isSubmitted: boolean;
  lockMessage?: string;
  requiredRoll?: DiceRollRequest | null;
  requiredRollExpression?: string;
  requiredQueuedDice?: QueuedDice | null;
  validationMessage?: string;
  validationPulse: number;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: PlayerInputMode) => void;
  onRollDice: (queuedDice: QueuedDice) => void;
  onSkipTurn?: () => void;
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
      mode,
      isSending,
      isSubmitted,
      lockMessage,
      requiredRoll,
      requiredRollExpression,
      requiredQueuedDice,
      validationMessage,
      validationPulse,
      onDraftChange,
      onModeChange,
      onRollDice,
      onSkipTurn,
      onSubmit
    },
    ref
  ) {
    const [isCallingAttention, setIsCallingAttention] = useState(false);
    const [isDicePickerOpen, setIsDicePickerOpen] = useState(false);
    const [queuedDice, setQueuedDice] = useState<QueuedDice>({});
    const diceRollControlRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
      if (!isDicePickerOpen) {
        return;
      }

      function closeDicePickerOnOutsideClick(event: PointerEvent) {
        if (
          event.target instanceof Node &&
          diceRollControlRef.current?.contains(event.target)
        ) {
          return;
        }

        setIsDicePickerOpen(false);
      }

      document.addEventListener("pointerdown", closeDicePickerOnOutsideClick);

      return () => {
        document.removeEventListener("pointerdown", closeDicePickerOnOutsideClick);
      };
    }, [isDicePickerOpen]);

    const isAskMode = mode === "ask_dm";
    const overlayMessage = !isAskMode && requiredRoll
      ? "Roll to continue"
      : !isAskMode
        ? lockMessage || (isSubmitted ? "Submitted." : "")
        : "";
    const isLocked = !isAskMode && (Boolean(lockMessage) || isSubmitted);
    const isRollRequired = !isAskMode && Boolean(requiredRoll);
    const canSkipTurn =
      !isAskMode && Boolean(onSkipTurn) && !isLocked && !isRollRequired && !isSending;
    const queuedCount = useMemo(() => queuedDiceTotal(queuedDice), [queuedDice]);

    useEffect(() => {
      if (!isRollRequired) {
        return;
      }

      setQueuedDice(requiredQueuedDice ?? {});
    }, [isRollRequired, requiredRoll?.id, requiredRollExpression, requiredQueuedDice]);

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
        <div className="turn-action-bar">
          <div className="input-mode-toggle" role="group" aria-label="Input mode">
            <button
              className={mode === "turn" ? "input-mode-button active" : "input-mode-button"}
              type="button"
              aria-pressed={mode === "turn"}
              disabled={isSending}
              onClick={() => onModeChange("turn")}
            >
              Turn
            </button>
            <button
              className={
                mode === "ask_dm" ? "input-mode-button active" : "input-mode-button"
              }
              type="button"
              aria-pressed={mode === "ask_dm"}
              disabled={isSending}
              onClick={() => onModeChange("ask_dm")}
            >
              Ask DM
            </button>
          </div>
          <div className="dice-roll-control" ref={diceRollControlRef}>
            <button
              className="dice-roll-button"
              type="button"
              aria-label={
                requiredRoll
                  ? `Roll ${requiredRollExpression ?? requiredRoll.dice}`
                  : "Open dice roller"
              }
              aria-expanded={isDicePickerOpen}
              disabled={isAskMode || (isLocked && !isRollRequired) || isSending}
              onClick={() => setIsDicePickerOpen((isOpen) => !isOpen)}
            >
              Dice
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
          <div className="turn-form-actions">
            {onSkipTurn ? (
              <button
                className="turn-form-skip"
                type="button"
                disabled={!canSkipTurn}
                onClick={onSkipTurn}
              >
                Skip
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isRollRequired || isLocked || isSending || !draft.trim()}
            >
              {isAskMode ? "Ask" : "Send"}
            </button>
          </div>
        </div>
        <div className="turn-form-input-wrap">
          <textarea
            ref={ref}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={
              isAskMode
                ? "Ask the DM a question without advancing time..."
                : "Speak, search, attack, bargain..."
            }
            readOnly={isLocked}
            rows={3}
          />
          {overlayMessage ? (
            <div className="turn-form-submitted-label" aria-live="polite">
              {overlayMessage}
            </div>
          ) : null}
        </div>
      </form>
    );
  }
);
