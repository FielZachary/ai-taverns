"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  ScrollText,
  Swords,
  Users
} from "lucide-react";
import {
  campaignGenrePresets,
  customCampaignGenre
} from "@/lib/campaign-genres";
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
const characterCreationSteps = [
  "Class",
  "Species",
  "Background",
  "Ability",
  "Personality",
  "Sheet"
];
const campaignGenres = [
  ...campaignGenrePresets,
  customCampaignGenre
];
const classOptions = [
  {
    id: "Barbarian",
    summary: "A fierce front-line survivor who turns danger into momentum.",
    skills: ["Athletics", "Intimidation", "Survival"],
    equipment: ["Greataxe", "Handaxes", "Explorer's pack"],
    spells: []
  },
  {
    id: "Bard",
    summary: "A charismatic spellcaster who wins with wit, music, and nerve.",
    skills: ["Performance", "Persuasion", "Deception"],
    equipment: ["Rapier", "Lute", "Entertainer's pack"],
    spells: ["Vicious Mockery", "Healing Word", "Charm Person"]
  },
  {
    id: "Cleric",
    summary: "A divine caster who protects allies and carries sacred purpose.",
    skills: ["Religion", "Insight", "Medicine"],
    equipment: ["Mace", "Shield", "Holy symbol"],
    spells: ["Guidance", "Cure Wounds", "Bless"]
  },
  {
    id: "Druid",
    summary: "A primal spellcaster tied to beasts, weather, and old places.",
    skills: ["Nature", "Animal Handling", "Survival"],
    equipment: ["Quarterstaff", "Druidic focus", "Explorer's pack"],
    spells: ["Produce Flame", "Entangle", "Speak with Animals"]
  },
  {
    id: "Fighter",
    summary: "A trained warrior who solves problems with discipline and steel.",
    skills: ["Athletics", "Perception", "Survival"],
    equipment: ["Longsword", "Shield", "Dungeoneer's pack"],
    spells: []
  },
  {
    id: "Monk",
    summary: "A focused martial artist who moves quickly and strikes precisely.",
    skills: ["Acrobatics", "Insight", "Stealth"],
    equipment: ["Shortsword", "Simple weapon", "Explorer's pack"],
    spells: []
  },
  {
    id: "Paladin",
    summary: "An oathbound champion with armor, conviction, and divine power.",
    skills: ["Athletics", "Persuasion", "Religion"],
    equipment: ["Longsword", "Shield", "Holy symbol"],
    spells: ["Lay on Hands", "Divine Smite", "Shield of Faith"]
  },
  {
    id: "Ranger",
    summary: "A wilderness scout who hunts threats before they reach the firelight.",
    skills: ["Survival", "Perception", "Stealth"],
    equipment: ["Longbow", "Shortswords", "Explorer's pack"],
    spells: ["Hunter's Mark", "Goodberry", "Animal Friendship"]
  },
  {
    id: "Rogue",
    summary: "A precise infiltrator who thrives on timing, secrets, and leverage.",
    skills: ["Stealth", "Sleight of Hand", "Investigation"],
    equipment: ["Rapier", "Shortbow", "Thieves' tools"],
    spells: []
  },
  {
    id: "Sorcerer",
    summary: "An innate spellcaster whose magic comes from blood, fate, or anomaly.",
    skills: ["Arcana", "Persuasion", "Deception"],
    equipment: ["Dagger", "Arcane focus", "Explorer's pack"],
    spells: ["Fire Bolt", "Mage Armor", "Magic Missile"]
  },
  {
    id: "Warlock",
    summary: "A pact-bound caster with strange power and stranger obligations.",
    skills: ["Arcana", "Deception", "Intimidation"],
    equipment: ["Dagger", "Arcane focus", "Scholar's pack"],
    spells: ["Eldritch Blast", "Hex", "Armor of Agathys"]
  },
  {
    id: "Wizard",
    summary: "A learned spellcaster who studies patterns the world tries to hide.",
    skills: ["Arcana", "History", "Investigation"],
    equipment: ["Quarterstaff", "Spellbook", "Scholar's pack"],
    spells: ["Prestidigitation", "Shield", "Detect Magic"]
  }
] as const;
const speciesOptions = [
  "Human",
  "Elf",
  "Dwarf",
  "Halfling",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Tiefling",
  "Dragonborn"
] as const;
const backgroundOptions = [
  "Acolyte",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Sailor",
  "Soldier",
  "Urchin"
] as const;
const abilityStyleOptions = [
  {
    id: "Quick Build",
    summary: "Recommended stats based on class, with no number crunching."
  },
  {
    id: "Classic Array",
    summary: "Assign a traditional heroic spread to the six abilities."
  },
  {
    id: "Roll for Stats",
    summary: "Old-school dice energy with a little more swing."
  },
  {
    id: "Custom",
    summary: "Fine tune the sheet later once the campaign begins."
  }
] as const;
const personalityPrompts = [
  "Charming troublemaker",
  "Grim oathkeeper",
  "Curious scholar",
  "Reluctant hero",
  "Secretive survivor",
  "Idealistic protector"
] as const;
type CharacterClass = (typeof classOptions)[number]["id"];
type CharacterSpecies = (typeof speciesOptions)[number];
type CharacterBackground = (typeof backgroundOptions)[number];
type AbilityStyle = (typeof abilityStyleOptions)[number]["id"];
type PersonalityPrompt = (typeof personalityPrompts)[number];

function formatList(items: readonly string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

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
  const [characterStepIndex, setCharacterStepIndex] = useState(0);
  const [mode, setMode] = useState<CampaignMode>("single_player");
  const [campaignGenre, setCampaignGenre] = useState(campaignGenres[0].id);
  const [customWorldName, setCustomWorldName] = useState("");
  const [customWorldDescription, setCustomWorldDescription] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterClass, setCharacterClass] =
    useState<CharacterClass>("Fighter");
  const [characterSpecies, setCharacterSpecies] =
    useState<CharacterSpecies>("Human");
  const [characterBackground, setCharacterBackground] =
    useState<CharacterBackground>("Folk Hero");
  const [abilityStyle, setAbilityStyle] =
    useState<AbilityStyle>("Quick Build");
  const [personality, setPersonality] =
    useState<PersonalityPrompt>("Charming troublemaker");
  const [backstoryHook, setBackstoryHook] = useState("");
  const [characterSheet, setCharacterSheet] = useState(defaultCharacterSheet);
  const [ownerClientId, setOwnerClientId] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isLastStep = stepIndex === steps.length - 1;
  const isCharacterStep = stepIndex === 2;
  const isLastCharacterStep =
    characterStepIndex === characterCreationSteps.length - 1;
  const modeLabel = mode === "single_player" ? "Singleplayer" : "Multiplayer";
  const selectedGenre =
    campaignGenres.find((genre) => genre.id === campaignGenre) ??
    campaignGenres[0];
  const isCustomGenre = campaignGenre === "custom";
  const campaignDisplayName = isCustomGenre
    ? customWorldName.trim() || "Custom World"
    : `${selectedGenre.label} Adventure`;
  const selectedClass =
    classOptions.find((option) => option.id === characterClass) ??
    classOptions[4];
  const selectedAbilityStyle =
    abilityStyleOptions.find((option) => option.id === abilityStyle) ??
    abilityStyleOptions[0];
  const characterSheetPreview = useMemo(
    () =>
      [
        `Name: ${characterName.trim() || "Unnamed adventurer"}`,
        "Level: 1",
        `Class: ${selectedClass.id}`,
        `Species: ${characterSpecies}`,
        `Background: ${characterBackground}`,
        `Ability style: ${selectedAbilityStyle.id} - ${selectedAbilityStyle.summary}`,
        `Core skills: ${formatList(selectedClass.skills)}`,
        `Starting equipment: ${formatList(selectedClass.equipment)}`,
        `Magic: ${formatList(selectedClass.spells)}`,
        "",
        `Personality: ${personality}`,
        `Backstory hook: ${
          backstoryHook.trim() ||
          "A fresh adventurer whose deeper story can emerge during play."
        }`,
        "",
        "DM notes:",
        `${characterName.trim() || "This character"} is a ${characterSpecies} ${selectedClass.id.toLowerCase()} with the ${characterBackground.toLowerCase()} background. Use the class, species, background, personality, and hook to tailor the opening scene.`
      ].join("\n"),
    [
      abilityStyle,
      backstoryHook,
      characterBackground,
      characterClass,
      characterName,
      characterSpecies,
      personality,
      selectedAbilityStyle.id,
      selectedAbilityStyle.summary,
      selectedClass
    ]
  );
  const stepTitle = useMemo(() => {
    if (stepIndex === 0) {
      return "Choose your game mode";
    }

    if (stepIndex === 1) {
      return "Choose the campaign genre";
    }

    if (stepIndex === 2) {
      if (characterStepIndex === 5) {
        return "Review your character";
      }

      if (characterStepIndex === 3) {
        return "Choose your ability style";
      }

      return `Choose your ${characterCreationSteps[
        characterStepIndex
      ].toLowerCase()}`;
    }

    return "Ready the first page";
  }, [characterStepIndex, stepIndex]);

  useEffect(() => {
    setCharacterSheet(characterSheetPreview);
  }, [characterSheetPreview]);

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
        campaignGenre &&
          (!isCustomGenre || customWorldName.trim()) &&
          (!isCustomGenre || customWorldDescription.trim())
      );
    }

    if (stepIndex === 2) {
      return (
        characterStepIndex !== 4 ||
        mode === "multiplayer" ||
        Boolean(characterName.trim())
      );
    }

    return true;
  }

  function handleNext() {
    setError("");

    if (!canAdvance()) {
      setError(
        stepIndex === 1
          ? isCustomGenre
            ? "Name the world and describe it before continuing."
            : "Choose a campaign genre before continuing."
          : mode === "single_player" && characterStepIndex === 4
            ? "Add your character name before continuing."
            : "Choose an option before continuing."
      );
      return;
    }

    if (isCharacterStep && !isLastCharacterStep) {
      setCharacterStepIndex((currentStepIndex) =>
        Math.min(currentStepIndex + 1, characterCreationSteps.length - 1)
      );
      return;
    }

    setStepIndex((currentStepIndex) =>
      Math.min(currentStepIndex + 1, steps.length - 1)
    );
  }

  function handleBack() {
    setError("");

    if (isCharacterStep && characterStepIndex > 0) {
      setCharacterStepIndex((currentStepIndex) =>
        Math.max(currentStepIndex - 1, 0)
      );
      return;
    }

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
          title: campaignDisplayName,
          campaignGenre: selectedGenre.label,
          campaignGenreKind: isCustomGenre ? "custom" : "preset",
          campaignGenrePresetId: isCustomGenre ? undefined : selectedGenre.id,
          customWorldName: isCustomGenre ? customWorldName.trim() : undefined,
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

          <div
            className={`creation-stage ${
              stepIndex === 0 || isCustomGenre ? "creation-stage-roomy" : ""
            }`}
          >
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
                        <small>{genre.uiDescription}</small>
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
                    <span>World name</span>
                    <input
                      value={customWorldName}
                      onChange={(event) => setCustomWorldName(event.target.value)}
                      placeholder="The Ashen Crownlands"
                      tabIndex={isCustomGenre ? 0 : -1}
                    />
                  </label>
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
              <div className="character-builder">
                <ol
                  className="character-creation-steps"
                  aria-label="Character creation progress"
                >
                  {characterCreationSteps.map((step, index) => (
                    <li
                      className={[
                        index === characterStepIndex ? "active" : "",
                        index < characterStepIndex ? "complete" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={step}
                    >
                      <span>
                        {index < characterStepIndex ? <Check size={11} /> : index + 1}
                      </span>
                      <strong>{step}</strong>
                    </li>
                  ))}
                </ol>

                {characterStepIndex === 0 ? (
                  <fieldset className="option-picker class-picker">
                    <legend>Class</legend>
                    <div>
                      {classOptions.map((option) => (
                        <button
                          type="button"
                          className={characterClass === option.id ? "selected" : ""}
                          aria-pressed={characterClass === option.id}
                          key={option.id}
                          onClick={() => setCharacterClass(option.id)}
                        >
                          <strong>{option.id}</strong>
                          <small>{option.summary}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {characterStepIndex === 1 ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Species</legend>
                    <div>
                      {speciesOptions.map((option) => (
                        <button
                          type="button"
                          className={characterSpecies === option ? "selected" : ""}
                          aria-pressed={characterSpecies === option}
                          key={option}
                          onClick={() => setCharacterSpecies(option)}
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {characterStepIndex === 2 ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Background</legend>
                    <div>
                      {backgroundOptions.map((option) => (
                        <button
                          type="button"
                          className={
                            characterBackground === option ? "selected" : ""
                          }
                          aria-pressed={characterBackground === option}
                          key={option}
                          onClick={() => setCharacterBackground(option)}
                        >
                          <strong>{option}</strong>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {characterStepIndex === 3 ? (
                  <fieldset className="option-picker compact-option-picker">
                    <legend>Ability style</legend>
                    <div>
                      {abilityStyleOptions.map((option) => (
                        <button
                          type="button"
                          className={abilityStyle === option.id ? "selected" : ""}
                          aria-pressed={abilityStyle === option.id}
                          key={option.id}
                          onClick={() => setAbilityStyle(option.id)}
                        >
                          <strong>{option.id}</strong>
                          <small>{option.summary}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {characterStepIndex === 4 ? (
                  <div className="personality-panel">
                    <div className="character-identity-fields">
                      <label>
                        <span>
                          {mode === "single_player"
                            ? "Name and personality"
                            : "Owner character name"}
                        </span>
                        <input
                          required={mode === "single_player"}
                          value={characterName}
                          onChange={(event) => setCharacterName(event.target.value)}
                          placeholder={
                            mode === "multiplayer"
                              ? "Optional for now"
                              : "Name your adventurer"
                          }
                          autoFocus
                        />
                      </label>

                      <label>
                        <span>Backstory hook</span>
                        <input
                          value={backstoryHook}
                          onChange={(event) => setBackstoryHook(event.target.value)}
                          placeholder="What trouble, promise, or mystery follows them?"
                        />
                      </label>
                    </div>

                    <fieldset className="option-picker compact-option-picker">
                      <legend>Personality</legend>
                      <div>
                        {personalityPrompts.map((option) => (
                          <button
                            type="button"
                            className={personality === option ? "selected" : ""}
                            aria-pressed={personality === option}
                            key={option}
                            onClick={() => setPersonality(option)}
                          >
                            <strong>{option}</strong>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : null}

                {characterStepIndex === 5 ? (
                  <>
                    <div className="character-summary-grid">
                      <div>
                        <span>Class</span>
                        <strong>{characterClass}</strong>
                      </div>
                      <div>
                        <span>Species</span>
                        <strong>{characterSpecies}</strong>
                      </div>
                      <div>
                        <span>Background</span>
                        <strong>{characterBackground}</strong>
                      </div>
                      <div>
                        <span>Personality</span>
                        <strong>{personality}</strong>
                      </div>
                    </div>

                    <section className="character-sheet-preview">
                      <div>
                        <Sparkles size={18} />
                        <strong>Generated character sheet</strong>
                      </div>
                      <pre>{characterSheet}</pre>
                    </section>
                  </>
                ) : null}

                {characterStepIndex < 5 ? (
                  <section className="character-current-pick">
                    <span>Current character</span>
                    <strong>
                      {characterName.trim() || "Unnamed adventurer"} the{" "}
                      {characterSpecies} {characterClass}
                    </strong>
                  </section>
                ) : null}
              </div>
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
                    <dd>{campaignDisplayName}</dd>
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
                    <dd>
                      {characterName || "Set later"}{" "}
                      {characterName ? `the ${characterSpecies} ${characterClass}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Background</dt>
                    <dd>{characterBackground}</dd>
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
                  {isCharacterStep ? "Next" : "Continue"}
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
