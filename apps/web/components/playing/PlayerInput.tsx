import {
  forwardRef,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Map, RefreshCcw, Settings, Sparkles, Wand2 } from "lucide-react";
import type { AiModelId, DiceRollRequest } from "@/lib/game-types";
import { EldermereMapModal } from "./EldermereMapModal";

export type DiceFace = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";
export type QueuedDice = Partial<Record<DiceFace, number>>;
export type PlayerInputMode = "turn" | "ask_dm";

type PlayerInputProps = {
  draft: string;
  mode: PlayerInputMode;
  isSending: boolean;
  isSubmitted: boolean;
  canSelectAiModel?: boolean;
  lockMessage?: string;
  requiredRoll?: DiceRollRequest | null;
  requiredRollExpression?: string;
  requiredQueuedDice?: QueuedDice | null;
  validationMessage?: string;
  validationPulse: number;
  restartBackstory?: string;
  canRestartCampaign?: boolean;
  isRestartingCampaign?: boolean;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: PlayerInputMode) => void;
  onRollDice: (queuedDice: QueuedDice) => void;
  onRetryLastTurn?: () => void;
  onSkipTurn?: () => void;
  onGenerateRestartBackstory?: (
    mode: "generate" | "add_details",
    currentBackstory: string
  ) => Promise<string>;
  onRestartCampaign?: (backstory: string) => Promise<void> | void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const diceFaces: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];
const aiModelStorageKey = "ai-dnd.aiModel";
const aiModelOptions: { id: AiModelId; label: string }[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "qwen-3-7-flash", label: "Qwen 3.7 Flash" }
];

function queuedDiceTotal(queuedDice: QueuedDice) {
  return Object.values(queuedDice).reduce((sum, count) => sum + (count ?? 0), 0);
}

function isAiModelId(value: string): value is AiModelId {
  return aiModelOptions.some((option) => option.id === value);
}

export const PlayerInput = forwardRef<HTMLTextAreaElement, PlayerInputProps>(
  function PlayerInput(
    {
      draft,
      mode,
      isSending,
      isSubmitted,
      canSelectAiModel = true,
      lockMessage,
      requiredRoll,
      requiredRollExpression,
      requiredQueuedDice,
      validationMessage,
      validationPulse,
      restartBackstory = "",
      canRestartCampaign = false,
      isRestartingCampaign = false,
      onDraftChange,
      onModeChange,
      onRollDice,
      onRetryLastTurn,
      onSkipTurn,
      onGenerateRestartBackstory,
      onRestartCampaign,
      onSubmit
    },
    ref
  ) {
    const [isCallingAttention, setIsCallingAttention] = useState(false);
    const [isDicePickerOpen, setIsDicePickerOpen] = useState(false);
    const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<"model" | "restart">("model");
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [selectedAiModel, setSelectedAiModel] =
      useState<AiModelId>("deepseek-v4-flash");
    const [queuedDice, setQueuedDice] = useState<QueuedDice>({});
    const [restartBackstoryDraft, setRestartBackstoryDraft] =
      useState(restartBackstory);
    const [restartStatus, setRestartStatus] = useState("");
    const [restartError, setRestartError] = useState("");
    const [isGeneratingRestartBackstory, setIsGeneratingRestartBackstory] =
      useState(false);
    const diceRollControlRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const savedAiModel = window.localStorage.getItem(aiModelStorageKey);

      if (savedAiModel && isAiModelId(savedAiModel)) {
        setSelectedAiModel(savedAiModel);
      }
    }, []);

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
    const canRetryLastTurn =
      !isAskMode && Boolean(onRetryLastTurn) && !isLocked && !isSending;
    const canSkipTurn =
      !isAskMode && Boolean(onSkipTurn) && !isLocked && !isRollRequired && !isSending;
    const queuedCount = useMemo(() => queuedDiceTotal(queuedDice), [queuedDice]);

    useEffect(() => {
      if (!isRollRequired) {
        return;
      }

      setQueuedDice(requiredQueuedDice ?? {});
    }, [isRollRequired, requiredRoll?.id, requiredRollExpression, requiredQueuedDice]);

    useEffect(() => {
      if (isModelPickerOpen) {
        setRestartBackstoryDraft(restartBackstory);
        setRestartStatus("");
        setRestartError("");
      }
    }, [isModelPickerOpen, restartBackstory]);

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

    function chooseAiModel(modelId: AiModelId) {
      if (!canSelectAiModel) {
        return;
      }

      setSelectedAiModel(modelId);
      window.localStorage.setItem(aiModelStorageKey, modelId);
      setIsModelPickerOpen(false);
    }

    async function generateRestartBackstory(mode: "generate" | "add_details") {
      if (!onGenerateRestartBackstory || isGeneratingRestartBackstory) {
        return;
      }

      setIsGeneratingRestartBackstory(true);
      setRestartStatus("");
      setRestartError("");

      try {
        const nextBackstory = await onGenerateRestartBackstory(
          mode,
          restartBackstoryDraft
        );

        setRestartBackstoryDraft(nextBackstory);
        setRestartStatus(
          mode === "generate" ? "Backstory generated." : "Details added."
        );
      } catch (error) {
        setRestartError(
          error instanceof Error ? error.message : "Backstory could not be created."
        );
      } finally {
        setIsGeneratingRestartBackstory(false);
      }
    }

    async function restartCampaignFromSettings() {
      if (!onRestartCampaign || isRestartingCampaign || !restartBackstoryDraft.trim()) {
        return;
      }

      setRestartStatus("");
      setRestartError("");

      try {
        await onRestartCampaign(restartBackstoryDraft);
        setIsModelPickerOpen(false);
      } catch (error) {
        setRestartError(
          error instanceof Error ? error.message : "The campaign could not be restarted."
        );
      }
    }

    const selectedAiModelLabel =
      aiModelOptions.find((option) => option.id === selectedAiModel)?.label ??
      aiModelOptions[0].label;

    return (
      <form
        className={`turn-form ${
          validationMessage ? "turn-form-warning" : ""
        } ${isCallingAttention ? "turn-form-attention" : ""} ${
          isLocked ? "turn-form-submitted" : ""
        } ${canRetryLastTurn ? "turn-form-has-retry" : ""}`}
        onSubmit={onSubmit}
      >
        <input type="hidden" name="aiModel" value={selectedAiModel} />
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
            <button
              className={`model-settings-button ${
                isModelPickerOpen ? "active" : ""
              }`}
              type="button"
              aria-label={`AI model: ${selectedAiModelLabel}`}
              aria-expanded={isModelPickerOpen}
              disabled={isSending || !canSelectAiModel}
              onClick={() => {
                if (canSelectAiModel) {
                  setSettingsTab("model");
                  setIsModelPickerOpen(true);
                }
              }}
            >
              <Settings size={17} />
            </button>
            <button
              className={`map-button ${isMapOpen ? "active" : ""}`}
              type="button"
              aria-label="Open Eldermere map"
              aria-expanded={isMapOpen}
              disabled={isSending}
              onClick={() => setIsMapOpen(true)}
            >
              <Map size={17} />
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
          {onSkipTurn ? (
            <div className="turn-form-actions">
              <button
                className="turn-form-skip"
                type="button"
                disabled={!canSkipTurn}
                onClick={onSkipTurn}
              >
                Skip
              </button>
            </div>
          ) : null}
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
          {canRetryLastTurn ? (
            <button
              className="turn-retry-button"
              type="button"
              aria-label="Retry last turn"
              title="Retry last turn"
              onClick={onRetryLastTurn}
            >
              <RefreshCcw size={17} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className="turn-submit-arrow"
            type="submit"
            aria-label={isAskMode ? "Ask" : "Send"}
            disabled={isRollRequired || isLocked || isSending || !draft.trim()}
          />
        </div>
        {isModelPickerOpen ? (
          <div className="model-settings-backdrop" role="presentation">
            <section
              className="model-settings-modal"
              aria-label="AI model settings"
              role="dialog"
            >
              <header className="model-settings-header">
                <h2>Settings</h2>
                <button
                  type="button"
                  onClick={() => setIsModelPickerOpen(false)}
                >
                  Close
                </button>
              </header>
              <div className="model-settings-tabs" role="tablist" aria-label="Settings">
                <button
                  type="button"
                  className={settingsTab === "model" ? "active" : ""}
                  role="tab"
                  aria-selected={settingsTab === "model"}
                  onClick={() => setSettingsTab("model")}
                >
                  AI Model
                </button>
                <button
                  type="button"
                  className={settingsTab === "restart" ? "active" : ""}
                  role="tab"
                  aria-selected={settingsTab === "restart"}
                  disabled={!canRestartCampaign}
                  onClick={() => setSettingsTab("restart")}
                >
                  Restart
                </button>
              </div>
              {settingsTab === "model" ? (
                <div className="model-settings-options" role="tabpanel">
                  {aiModelOptions.map((option) => (
                    <button
                      className={
                        option.id === selectedAiModel
                          ? "model-settings-option active"
                          : "model-settings-option"
                      }
                      key={option.id}
                      type="button"
                      aria-pressed={option.id === selectedAiModel}
                      onClick={() => chooseAiModel(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="restart-settings-panel" role="tabpanel">
                  <p>
                    Start this character over in a fresh campaign. Character art,
                    starting place, and character details are kept; this backstory
                    can be edited before the DM opens the new scene.
                  </p>
                  <label>
                    <span>Backstory</span>
                    <textarea
                      value={restartBackstoryDraft}
                      rows={8}
                      disabled={isGeneratingRestartBackstory || isRestartingCampaign}
                      onChange={(event) =>
                        setRestartBackstoryDraft(event.target.value)
                      }
                    />
                  </label>
                  <div className="restart-settings-actions">
                    <button
                      type="button"
                      disabled={
                        isGeneratingRestartBackstory || isRestartingCampaign
                      }
                      onClick={() => void generateRestartBackstory("generate")}
                    >
                      <Sparkles size={16} />
                      Generate Story
                    </button>
                    <button
                      type="button"
                      disabled={
                        isGeneratingRestartBackstory ||
                        isRestartingCampaign ||
                        !restartBackstoryDraft.trim()
                      }
                      onClick={() => void generateRestartBackstory("add_details")}
                    >
                      <Wand2 size={16} />
                      Add Details
                    </button>
                  </div>
                  {restartStatus ? (
                    <p className="restart-settings-status">{restartStatus}</p>
                  ) : null}
                  {restartError ? (
                    <p className="restart-settings-error" role="alert">
                      {restartError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="restart-settings-submit"
                    disabled={
                      isGeneratingRestartBackstory ||
                      isRestartingCampaign ||
                      !restartBackstoryDraft.trim()
                    }
                    onClick={() => void restartCampaignFromSettings()}
                  >
                    <RefreshCcw size={16} />
                    {isRestartingCampaign ? "Restarting..." : "Restart"}
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : null}
        {isMapOpen ? (
          <EldermereMapModal onClose={() => setIsMapOpen(false)} />
        ) : null}
      </form>
    );
  }
);
