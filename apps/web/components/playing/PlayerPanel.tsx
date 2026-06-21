"use client";

import { useEffect, useState } from "react";
import { Save, ScrollText, UserRound, X } from "lucide-react";

export type PlayerProfile = {
  username: string;
  characterName: string;
  characterSheet: string;
};

const storageKeys = {
  username: "ai-dnd.username",
  characterName: "ai-dnd.characterName",
  characterSheet: "ai-dnd.characterSheet"
};

export const defaultCharacterSheet = [
  "Name:",
  "Class / Level:",
  "Ancestry:",
  "Armor Class:",
  "Hit Points:",
  "Key Abilities:",
  "",
  "Personality:",
  "Inventory:",
  "Notes:"
].join("\n");

export const emptyPlayerProfile: PlayerProfile = {
  username: "",
  characterName: "",
  characterSheet: defaultCharacterSheet
};

type PlayerPanelProps = {
  onProfileChange: (profile: PlayerProfile) => void;
  onProfileUpdate: (profile: PlayerProfile) => void;
};

export function PlayerPanel({
  onProfileChange,
  onProfileUpdate
}: PlayerPanelProps) {
  const [username, setUsername] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem(storageKeys.username) ?? "");
    setCharacterName(localStorage.getItem(storageKeys.characterName) ?? "");
    setCharacterSheet(
      localStorage.getItem(storageKeys.characterSheet) ?? defaultCharacterSheet
    );
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKeys.username, username);
  }, [username]);

  useEffect(() => {
    localStorage.setItem(storageKeys.characterName, characterName);
  }, [characterName]);

  useEffect(() => {
    localStorage.setItem(storageKeys.characterSheet, characterSheet);
  }, [characterSheet]);

  useEffect(() => {
    onProfileChange({
      username,
      characterName,
      characterSheet
    });
  }, [characterName, characterSheet, onProfileChange, username]);

  const portraitLabel = characterName || username || "Character";
  const currentProfile = {
    username,
    characterName,
    characterSheet
  };

  return (
    <aside className="session-panel player-panel" aria-label="Player details">
      <section className="player-card">
        <p className="eyebrow">Player</p>
        <div className="character-portrait" aria-label={`${portraitLabel} portrait`}>
          <UserRound size={46} />
        </div>
      </section>

      <section className="player-fields">
        <label>
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Your name"
          />
        </label>

        <label>
          <span>Character Name</span>
          <input
            type="text"
            value={characterName}
            onChange={(event) => setCharacterName(event.target.value)}
            placeholder="Character name"
          />
        </label>
      </section>

      <section>
        <button
          className="sheet-button"
          type="button"
          onClick={() => setIsSheetOpen(true)}
        >
          <ScrollText size={18} />
          View Character Sheet
        </button>
        <button
          className="profile-update-button"
          type="button"
          onClick={() => onProfileUpdate(currentProfile)}
        >
          <Save size={18} />
          Update Profile
        </button>
      </section>

      {isSheetOpen ? (
        <div className="sheet-modal-backdrop" role="presentation">
          <div
            aria-modal="true"
            className="sheet-modal"
            role="dialog"
            aria-label="Character sheet"
          >
            <div className="sheet-modal-header">
              <div>
                <p className="eyebrow">Character Sheet</p>
                <h2>{characterName || "Unnamed Character"}</h2>
              </div>
              <button
                type="button"
                aria-label="Close character sheet"
                onClick={() => setIsSheetOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <textarea
              value={characterSheet}
              onChange={(event) => setCharacterSheet(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
