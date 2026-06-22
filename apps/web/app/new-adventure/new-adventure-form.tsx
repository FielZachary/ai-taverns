"use client";

import { FormEvent, useEffect, useState } from "react";
import { Swords, Users } from "lucide-react";
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

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function NewAdventureForm({ userEmail }: NewAdventureFormProps) {
  const [mode, setMode] = useState<CampaignMode>("single_player");
  const [title, setTitle] = useState("Lanterns Below the Old Road");
  const [playerName, setPlayerName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreating) {
      return;
    }

    setError("");
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

  return (
    <main className="new-adventure-page">
      <section className="new-adventure-shell" aria-label="Create a new adventure">
        <div className="new-adventure-heading">
          <p className="eyebrow">New Adventure</p>
          <h1>Choose how the table begins</h1>
          {userEmail ? <p>{userEmail}</p> : null}
        </div>

        <form className="new-adventure-form" onSubmit={handleSubmit}>
          <div className="mode-picker" role="radiogroup" aria-label="Campaign mode">
            <button
              type="button"
              className={mode === "single_player" ? "selected" : ""}
              aria-pressed={mode === "single_player"}
              onClick={() => setMode("single_player")}
            >
              <Swords size={22} />
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
              <Users size={22} />
              <span>
                <strong>Multiplayer</strong>
                <small>Invite players and resolve party turns together.</small>
              </span>
            </button>
          </div>

          <label>
            <span>{mode === "single_player" ? "Campaign title" : "Table title"}</span>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label>
            <span>{mode === "single_player" ? "Player name" : "Owner name"}</span>
            <input
              required
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="What should Hermes call you?"
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

          {error ? (
            <p className="new-adventure-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Campaign"}
          </button>
        </form>
      </section>
    </main>
  );
}
