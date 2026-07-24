"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LogIn } from "lucide-react";
import type { LobbyInvitePreviewResponse } from "@ai-dnd/contracts";
import {
  joinLobbyInvite,
  previewLobbyInvite
} from "@/lib/campaign-api";

type InviteJoinFormProps = {
  token: string;
  userEmail: string;
};

type LoadState = "loading" | "ready" | "error";

const playerIdStorageKey = "ai-dnd.playerId";

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function initialPlayerName(userEmail: string) {
  return userEmail.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
}

export function InviteJoinForm({ token, userEmail }: InviteJoinFormProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [preview, setPreview] = useState<LobbyInvitePreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [playerName, setPlayerName] = useState(initialPlayerName(userEmail));
  const [characterName, setCharacterName] = useState("");
  const [characterSheet, setCharacterSheet] = useState("");
  const [clientId, setClientId] = useState("");
  const canJoin = useMemo(
    () =>
      playerName.trim() &&
      characterName.trim() &&
      characterSheet.trim() &&
      loadState === "ready" &&
      !isJoining,
    [characterName, characterSheet, isJoining, loadState, playerName]
  );

  useEffect(() => {
    const storedId = window.localStorage.getItem(playerIdStorageKey);
    const nextId = storedId || createClientId();

    window.localStorage.setItem(playerIdStorageKey, nextId);
    setClientId(nextId);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadPreview() {
      setLoadState("loading");
      setError("");

      try {
        const nextPreview = await previewLobbyInvite(token);

        if (!isCurrent) {
          return;
        }

        setPreview(nextPreview);
        setLoadState("ready");
      } catch (caught) {
        if (!isCurrent) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "That invite link could not be checked."
        );
        setLoadState("error");
      }
    }

    void loadPreview();

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canJoin || !clientId) {
      return;
    }

    setIsJoining(true);
    setError("");

    try {
      const campaign = await joinLobbyInvite(token, {
        clientId,
        username: playerName.trim(),
        characterName: characterName.trim(),
        characterSheet: characterSheet.trim()
      });

      window.location.assign(
        `/play?campaignId=${encodeURIComponent(campaign.id)}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The lobby could not be joined."
      );
      setIsJoining(false);
    }
  }

  return (
    <main className="invite-page">
      <section className="invite-panel" aria-labelledby="invite-title">
        <p className="eyebrow">Lobby Invite</p>
        <h1 id="invite-title">
          {preview?.campaignTitle ?? "Join the table"}
        </h1>

        {loadState === "loading" ? (
          <p className="invite-note">Checking your invite...</p>
        ) : null}

        {loadState === "ready" && preview ? (
          <>
            <div className="invite-preview">
              <span>
                {preview.availableSlots}{" "}
                {preview.availableSlots === 1 ? "seat" : "seats"} open
              </span>
              {preview.expiresAt ? (
                <span>
                  Expires {new Date(preview.expiresAt).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            <form className="invite-form" onSubmit={handleSubmit}>
              <label>
                <span>Player name</span>
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  autoComplete="nickname"
                />
              </label>
              <label>
                <span>Character name</span>
                <input
                  value={characterName}
                  onChange={(event) => setCharacterName(event.target.value)}
                />
              </label>
              <label>
                <span>Character sheet</span>
                <textarea
                  value={characterSheet}
                  onChange={(event) => setCharacterSheet(event.target.value)}
                  rows={7}
                />
              </label>
              <button type="submit" disabled={!canJoin || !clientId}>
                <LogIn size={17} />
                {isJoining ? "Joining..." : "Join Lobby"}
              </button>
            </form>
          </>
        ) : null}

        {error ? <p className="invite-error">{error}</p> : null}
      </section>
    </main>
  );
}
