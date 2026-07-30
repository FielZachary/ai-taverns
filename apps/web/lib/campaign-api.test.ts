import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCampaign,
  generateCharacterPortrait,
  generateCampaignRestartBackstory,
  joinCampaign,
  listCampaigns,
  previewCharacterPortrait,
  previewCampaignJoin,
  readCampaign,
  restartCampaign,
  uploadCharacterPortrait
} from "./campaign-api";

const campaign = {
  id: "11111111-1111-4111-8111-111111111111",
  sessionId: "provider-session",
  mode: "multiplayer",
  title: "Crystal Caves",
  preview: "A bright cavern waits.",
  joinCode: "ABCD12",
  messageCount: 3
};

function mockFetchJson(body: unknown, init?: ResponseInit) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(body, init));
}

describe("campaign API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists campaigns from the API response", async () => {
    const fetchMock = mockFetchJson({ campaigns: [campaign] });

    await expect(listCampaigns()).resolves.toEqual([campaign]);
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns");
  });

  it("creates a campaign with JSON headers and body", async () => {
    const fetchMock = mockFetchJson({ campaign });

    await expect(
      createCampaign({
        mode: "multiplayer",
        playerName: "Ada",
        campaignGenrePresetId: "eldermere"
      })
    ).resolves.toEqual(campaign);
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode: "multiplayer",
        playerName: "Ada",
        campaignGenrePresetId: "eldermere"
      })
    });
  });

  it("encodes campaign IDs when reading one campaign", async () => {
    const fetchMock = mockFetchJson({ campaign });

    await expect(readCampaign("campaign/with spaces")).resolves.toEqual(campaign);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/campaigns/campaign%2Fwith%20spaces"
    );
  });

  it("generates restart backstories and restarts campaigns", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          backstory: "Mira carries the old oath forward."
        })
      )
      .mockResolvedValueOnce(Response.json({ campaign }));

    await expect(
      generateCampaignRestartBackstory("campaign/with spaces", {
        mode: "add_details",
        currentBackstory: "Mira has an oath."
      })
    ).resolves.toEqual({
      backstory: "Mira carries the old oath forward."
    });
    await expect(
      restartCampaign("campaign/with spaces", {
        backstory: "Mira carries the old oath forward."
      })
    ).resolves.toEqual(campaign);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/campaigns/campaign%2Fwith%20spaces/restart/backstory",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "add_details",
          currentBackstory: "Mira has an oath."
        })
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/campaigns/campaign%2Fwith%20spaces/restart",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          backstory: "Mira carries the old oath forward."
        })
      }
    );
  });

  it("previews, generates, and uploads character portraits with JSON payloads", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          imageDataUrl: "data:image/png;base64,preview",
          contentType: "image/png"
        })
      )
      .mockResolvedValueOnce(Response.json({ campaign }))
      .mockResolvedValueOnce(Response.json({ campaign }));

    await expect(
      previewCharacterPortrait({
        characterName: "Mira",
        characterSheet: "Level 5 fighter",
        campaignGenre: "Eldermere",
        guidelines: "silver cloak",
        artStyle: "cinematic_concept_art",
        imageModel: "qwen"
      })
    ).resolves.toEqual({
      imageDataUrl: "data:image/png;base64,preview",
      contentType: "image/png"
    });
    await expect(
      generateCharacterPortrait("campaign/with spaces", {
        guidelines: "silver cloak",
        artStyle: "cinematic_concept_art",
        imageModel: "qwen"
      })
    ).resolves.toEqual(campaign);
    await expect(
      uploadCharacterPortrait("campaign/with spaces", {
        imageDataUrl: "data:image/png;base64,abc",
        fileName: "portrait.png",
        guidelines: "match the scar",
        artStyle: "ink_and_watercolor"
      })
    ).resolves.toEqual(campaign);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/campaigns/portrait/preview",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          characterName: "Mira",
          characterSheet: "Level 5 fighter",
          campaignGenre: "Eldermere",
          guidelines: "silver cloak",
          artStyle: "cinematic_concept_art",
          imageModel: "qwen"
        })
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/campaigns/campaign%2Fwith%20spaces/portrait/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          guidelines: "silver cloak",
          artStyle: "cinematic_concept_art",
          imageModel: "qwen"
        })
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/campaigns/campaign%2Fwith%20spaces/portrait/upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          imageDataUrl: "data:image/png;base64,abc",
          fileName: "portrait.png",
          guidelines: "match the scar",
          artStyle: "ink_and_watercolor"
        })
      }
    );
  });

  it("previews and joins multiplayer campaigns", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          code: "ABCD12",
          campaignTitle: "Crystal Caves",
          availableSlots: 2,
          hasBegun: false
        })
      )
      .mockResolvedValueOnce(Response.json({ campaign }));

    await expect(previewCampaignJoin({ gameCode: "ABCD12" })).resolves.toEqual({
      code: "ABCD12",
      campaignTitle: "Crystal Caves",
      availableSlots: 2,
      hasBegun: false
    });
    await expect(
      joinCampaign({
        gameCode: "ABCD12",
        username: "Ada",
        characterName: "Nyx"
      })
    ).resolves.toEqual(campaign);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/campaigns/join/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ gameCode: "ABCD12" })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/campaigns/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        gameCode: "ABCD12",
        username: "Ada",
        characterName: "Nyx"
      })
    });
  });

  it("uses API string and nested error messages before fallbacks", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ error: "Game code not found." }, { status: 404 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "Campaign is full." } },
          { status: 409 }
        )
      );

    await expect(previewCampaignJoin({ gameCode: "NOPE" })).rejects.toThrow(
      "Game code not found."
    );
    await expect(joinCampaign({ gameCode: "FULL" })).rejects.toThrow(
      "Campaign is full."
    );
  });

  it("uses fallback errors for malformed responses and rejects invalid success shapes", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not-json", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ campaigns: [{ title: "" }] }));

    await expect(listCampaigns()).rejects.toThrow(
      "Campaigns could not be loaded."
    );
    await expect(listCampaigns()).rejects.toThrow();
  });
});
