import {
  forwardRef,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Dice5, ScrollText, Send, X } from "lucide-react";
import type { DiceRollRequest } from "@/lib/game-types";

export type DiceFace = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export type QueuedDice = Partial<Record<DiceFace, number>>;

type PlayerInputProps = {
  draft: string;
  isSending: boolean;
  isSubmitted: boolean;
  lockMessage?: string;
  requiredRoll?: DiceRollRequest | null;
  requiredRollExpression?: string;
  requiredQueuedDice?: QueuedDice | null;
  validationMessage?: string;
  validationPulse: number;
  characterSheet: string;
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
      requiredRollExpression,
      requiredQueuedDice,
      validationMessage,
      validationPulse,
      characterSheet,
      onDraftChange,
      onRollDice,
      onSubmit
    },
    ref
  ) {
    const [isCallingAttention, setIsCallingAttention] = useState(false);
    const [isDicePickerOpen, setIsDicePickerOpen] = useState(false);
    const [isCharacterSheetOpen, setIsCharacterSheetOpen] = useState(false);
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

    const overlayMessage = requiredRoll
      ? "Roll to continue"
      : lockMessage || (isSubmitted ? "Submitted." : "");
    const isLocked = Boolean(lockMessage) || isSubmitted;
    const isRollRequired = Boolean(requiredRoll);
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
        <div className="turn-form-tools">
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
              disabled={(isLocked && !isRollRequired) || isSending}
              onClick={() => setIsDicePickerOpen((isOpen) => !isOpen)}
            >
              <Dice5 size={17} />
              <span>
                {queuedCount > 0
                  ? `${queuedCount} dice`
                  : requiredRollExpression ?? requiredRoll?.dice ?? "Dice"}
              </span>
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
          <button
            className="character-sheet-button"
            type="button"
            aria-expanded={isCharacterSheetOpen}
            onClick={() => setIsCharacterSheetOpen((isOpen) => !isOpen)}
          >
            <ScrollText size={17} />
            View Character Sheet
          </button>
        </div>
        <div className="turn-form-input-wrap">
          <textarea
            ref={ref}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Speak, search, attack, bargain..."
            readOnly={isLocked}
            rows={2}
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
        {isCharacterSheetOpen ? (
          <section
            className="character-sheet-popover"
            aria-label="Character sheet"
          >
            <header>
              <h2>Character Sheet</h2>
              <button
                type="button"
                aria-label="Close character sheet"
                onClick={() => setIsCharacterSheetOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <pre>{characterSheet.trim() || "No character sheet yet."}</pre>
          </section>
        ) : null}
      </form>
    );
  }
);
