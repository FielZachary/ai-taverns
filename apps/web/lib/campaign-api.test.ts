import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCampaign,
  joinCampaign,
  listCampaigns,
  previewCampaignJoin,
  readCampaign
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
