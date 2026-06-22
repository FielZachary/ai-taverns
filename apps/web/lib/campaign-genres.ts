export type CampaignGenrePreset = {
  id: string;
  label: string;
  uiDescription: string;
  promptBrief: string;
};

export const campaignGenrePresets: CampaignGenrePreset[] = [
  {
    id: "classic_fantasy",
    label: "Classic Fantasy",
    uiDescription: "Ancient ruins, strange magic, and mythic quests.",
    promptBrief:
      "Run this as a classic fantasy campaign with ancient ruins, strange magic, mythic quests, clear heroism, wondrous danger, and room for tavern-born adventure."
  },
  {
    id: "dark_fantasy",
    label: "Dark Fantasy",
    uiDescription: "Curses, hard choices, and candlelit danger.",
    promptBrief:
      "Run this as a dark fantasy campaign with curses, hard bargains, haunted places, moral pressure, ominous magic, and danger that feels intimate rather than gratuitous."
  },
  {
    id: "high_adventure",
    label: "High Adventure",
    uiDescription: "Bold heroes, wild travel, and sweeping stakes.",
    promptBrief:
      "Run this as a high adventure campaign with bold heroes, wild travel, ancient threats, kinetic action, colorful allies, and sweeping stakes that invite decisive choices."
  },
  {
    id: "mystery",
    label: "Mystery",
    uiDescription: "Secrets, suspects, and clues hidden in plain sight.",
    promptBrief:
      "Run this as a fantasy mystery campaign with secrets, suspects, layered clues, social tension, hidden motives, and discoveries that reward careful attention."
  }
];

export const customCampaignGenre = {
  id: "custom",
  label: "Custom World",
  uiDescription: "Describe the tone, setting, and premise yourself."
};

export function getCampaignGenrePreset(presetId: string | undefined) {
  return campaignGenrePresets.find((preset) => preset.id === presetId);
}
