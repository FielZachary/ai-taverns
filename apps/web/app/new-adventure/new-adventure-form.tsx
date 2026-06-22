"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ScrollText, Swords, Users } from "lucide-react";
import { defaultCharacterSheet } from "@/components/playing/PlayerPanel";

type CampaignMode = "single_player" | "multiplayer";

type NewAdventureFormProps = {
  userEmail?: string;
};

type CreateCampaignResponse = {
  campaign?: {
    id: string;
  };
  error?: string;
};

const playerIdStorageKey = "ai-dnd.playerId";
const steps = ["Mode", "Campaign", "Character", "Review"];

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function NewAdventureForm({ userEmail }: NewAdventureFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<CampaignMode>("single_player");
  const [title, setTitle] = useState("Lanterns Below the Old Road");
  const [playerName, setPlayerName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const modeLabel = mode === "single_player" ? "Singleplayer" : "Multiplayer";
  const stepTitle = useMemo(() => {
    if (stepIndex === 0) {
      return "Choose your game mode";
    }

    if (stepIndex === 1) {
      return mode === "single_player" ? "Name the campaign" : "Name the table";
    }

    if (stepIndex === 2) {
      return mode === "single_player" ? "Shape your character" : "Set your seat";
    }

    return "Ready the first page";
  }, [mode, stepIndex]);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem(playerIdStorageKey);

    if (savedPlayerId) {
      setOwnerClientId(savedPlayerId);
      return;
    }

    const nextPlayerId = createClientId();
    localStorage.setItem(playerIdStorageKey, nextPlayerId);
    setOwnerClientId(nextPlayerId);
  }, []);

  function canAdvance() {
    if (stepIndex === 1) {
      return Boolean(title.trim());
    }

    if (stepIndex === 2) {
      return Boolean(
        playerName.trim() &&
          (mode === "multiplayer" || characterName.trim())
      );
    }

    return true;
  }

  function handleNext() {
    setError("");

    if (!canAdvance()) {
      setError(
        stepIndex === 1
          ? "Give the adventure a title before continuing."
          : mode === "single_player"
            ? "Add your player and character names before continuing."
            : "Add your owner name before continuing."
      );
      return;
    }

    setStepIndex((currentStepIndex) =>
      Math.min(currentStepIndex + 1, steps.length - 1)
    );
  }

  function handleBack() {
    setError("");
    setStepIndex((currentStepIndex) => Math.max(currentStepIndex - 1, 0));
  }

  async function createCampaign() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          title,
          ownerClientId,
          playerName,
          characterName,
          characterSheet
        })
      });
      const data = (await response.json()) as CreateCampaignResponse;

      if (!response.ok || !data.campaign?.id) {
        throw new Error(data.error || "The campaign could not be created.");
      }

      window.location.assign(
        `/play?campaignId=${encodeURIComponent(data.campaign.id)}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The campaign could not be created."
      );
      setIsCreating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLastStep) {
      void createCampaign();
      return;
    }

    handleNext();
  }

  return (
    <main className="new-adventure-page">
      <section className="new-adventure-shell" aria-label="Create a new adventure">
        <div className="new-adventure-heading">
          <p className="eyebrow">New Adventure</p>
          <h1>{stepTitle}</h1>
          {userEmail ? <p>{userEmail}</p> : null}
        </div>

        <form className="new-adventure-form" onSubmit={handleSubmit}>
          <ol className="creation-steps" aria-label="Creation progress">
            {steps.map((step, index) => (
              <li
                className={[
                  index === stepIndex ? "active" : "",
                  index < stepIndex ? "complete" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={step}
              >
                <span>{index < stepIndex ? <Check size={13} /> : index + 1}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>

          <div className="creation-stage">
            {stepIndex === 0 ? (
              <div className="mode-picker" role="radiogroup" aria-label="Campaign mode">
                <button
                  type="button"
                  className={mode === "single_player" ? "selected" : ""}
                  aria-pressed={mode === "single_player"}
                  onClick={() => setMode("single_player")}
                >
                  <span className="mode-medallion">
                    <Swords size={34} />
                  </span>
                  <span>
                    <strong>Singleplayer</strong>
                    <small>Private play with Hermes as your DM.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={mode === "multiplayer" ? "selected" : ""}
                  aria-pressed={mode === "multiplayer"}
                  onClick={() => setMode("multiplayer")}
                >
                  <span className="mode-medallion">
                    <Users size={34} />
                  </span>
                  <span>
                    <strong>Multiplayer</strong>
                    <small>Invite players and resolve party turns together.</small>
                  </span>
                </button>
              </div>
            ) : null}

            {stepIndex === 1 ? (
              <label>
                <span>
                  {mode === "single_player" ? "Campaign title" : "Table title"}
                </span>
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                />
              </label>
            ) : null}

            {stepIndex === 2 ? (
              <>
                <label>
                  <span>{mode === "single_player" ? "Player name" : "Owner name"}</span>
                  <input
                    required
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="What should Hermes call you?"
                    autoFocus
                  />
                </label>

                <label>
                  <span>
                    {mode === "single_player"
                      ? "Character name"
                      : "Owner character name"}
                  </span>
                  <input
                    required={mode === "single_player"}
                    value={characterName}
                    onChange={(event) => setCharacterName(event.target.value)}
                    placeholder={mode === "multiplayer" ? "Optional for now" : ""}
                  />
                </label>

                <label>
                  <span>
                    {mode === "single_player"
                      ? "Character sheet or quick template"
                      : "Owner character notes"}
                  </span>
                  <textarea
                    value={characterSheet}
                    onChange={(event) => setCharacterSheet(event.target.value)}
                    rows={8}
                  />
                </label>
              </>
            ) : null}

            {stepIndex === 3 ? (
              <div className="creation-review">
                <ScrollText size={28} />
                <dl>
                  <div>
                    <dt>Mode</dt>
                    <dd>{modeLabel}</dd>
                  </div>
                  <div>
                    <dt>{mode === "single_player" ? "Campaign" : "Table"}</dt>
                    <dd>{title}</dd>
                  </div>
                  <div>
                    <dt>{mode === "single_player" ? "Player" : "Owner"}</dt>
                    <dd>{playerName}</dd>
                  </div>
                  <div>
                    <dt>Character</dt>
                    <dd>{characterName || "Set later"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="new-adventure-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="creation-actions">
            <button
              type="button"
              className="creation-secondary"
              disabled={stepIndex === 0 || isCreating}
              onClick={handleBack}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button type="submit" disabled={isCreating}>
              {isCreating ? (
                "Creating..."
              ) : isLastStep ? (
                <>
                  Create Campaign
                  <Check size={16} />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
