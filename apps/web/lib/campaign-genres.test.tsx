import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCampaignGenrePreset } from "./campaign-genres";

function GenreLabel({ presetId }: { presetId: string }) {
  const preset = getCampaignGenrePreset(presetId);

  return <span>{preset?.label ?? "Unknown"}</span>;
}

describe("web test scaffold", () => {
  it("renders a real campaign genre through React Testing Library", () => {
    render(<GenreLabel presetId="eldermere" />);

    expect(screen.getByText("Eldermere")).toBeInTheDocument();
  });

  it("returns undefined for unknown campaign genre presets", () => {
    expect(getCampaignGenrePreset("spelljammer")).toBeUndefined();
  });
});
