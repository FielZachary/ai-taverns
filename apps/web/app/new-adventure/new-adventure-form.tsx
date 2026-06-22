"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ScrollText,
  Swords,
  Users
} from "lucide-react";
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
const campaignGenres = [
  {
    id: "classic_fantasy",
    label: "Classic Fantasy",
    description: "Ancient ruins, strange magic, and mythic quests."
  },
  {
    id: "dark_fantasy",
    label: "Dark Fantasy",
    description: "Curses, hard choices, and candlelit danger."
  },
  {
    id: "high_adventure",
    label: "High Adventure",
    description: "Bold heroes, wild travel, and sweeping stakes."
  },
  {
    id: "mystery",
    label: "Mystery",
    description: "Secrets, suspects, and clues hidden in plain sight."
  },
  {
    id: "custom",
    label: "Custom World",
    description: "Describe the tone, setting, and premise yourself."
  }
];

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
  const [campaignGenre, setCampaignGenre] = useState(campaignGenres[0].id);
  const [customWorldDescription, setCustomWorldDescription] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isLastStep = stepIndex === steps.length - 1;
  const modeLabel = mode === "single_player" ? "Singleplayer" : "Multiplayer";
  const selectedGenre =
    campaignGenres.find((genre) => genre.id === campaignGenre) ??
    campaignGenres[0];
  const isCustomGenre = campaignGenre === "custom";
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
      return Boolean(
        title.trim() &&
          campaignGenre &&
          (!isCustomGenre || customWorldDescription.trim())
      );
    }

    if (stepIndex === 2) {
      return mode === "multiplayer" || Boolean(characterName.trim());
    }

    return true;
  }

  function handleNext() {
    setError("");

    if (!canAdvance()) {
      setError(
        stepIndex === 1
          ? isCustomGenre
            ? "Give the adventure a title and describe the custom world before continuing."
            : "Give the adventure a title and genre before continuing."
          : mode === "single_player"
            ? "Add your character name before continuing."
            : "Add your character details or continue without them."
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
          campaignGenre: selectedGenre.label,
          campaignGenreKind: isCustomGenre ? "custom" : "preset",
          campaignGenrePresetId: isCustomGenre ? undefined : selectedGenre.id,
          customWorldDescription: isCustomGenre
            ? customWorldDescription.trim()
            : undefined,
          ownerClientId,
          playerName:
            mode === "single_player"
              ? characterName.trim() || "Solo Player"
              : "Table Owner",
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
              <>
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

                <fieldset className="genre-picker">
                  <legend>Campaign genre</legend>
                  <div>
                    {campaignGenres.map((genre) => (
                      <button
                        type="button"
                        className={campaignGenre === genre.id ? "selected" : ""}
                        aria-pressed={campaignGenre === genre.id}
                        key={genre.id}
                        onClick={() => setCampaignGenre(genre.id)}
                      >
                        <strong>{genre.label}</strong>
                        <small>{genre.description}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div
                  className={`custom-world-field ${
                    isCustomGenre ? "expanded" : ""
                  }`}
                  aria-hidden={!isCustomGenre}
                >
                  <label>
                    <span>World description</span>
                    <textarea
                      value={customWorldDescription}
                      onChange={(event) =>
                        setCustomWorldDescription(event.target.value)
                      }
                      placeholder="A sea of floating islands ruled by oathbound sky courts, where every spell costs a memory..."
                      rows={7}
                      tabIndex={isCustomGenre ? 0 : -1}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {stepIndex === 2 ? (
              <>
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
                    autoFocus
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
                    <dt>Genre</dt>
                    <dd>{selectedGenre.label}</dd>
                  </div>
                  {isCustomGenre ? (
                    <div>
                      <dt>World</dt>
                      <dd>{customWorldDescription}</dd>
                    </div>
                  ) : null}
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
