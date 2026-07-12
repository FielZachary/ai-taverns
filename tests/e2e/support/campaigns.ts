import { expect, type Page } from "@playwright/test";
import type { CampaignSummary } from "@ai-dnd/contracts";

export async function createMultiplayerCampaignThroughBrowser(
  page: Page,
  input: {
    title: string;
    ownerClientId: string;
  }
): Promise<CampaignSummary> {
  const campaign = await page.evaluate(async (payload) => {
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        mode: "multiplayer",
        title: payload.title,
        campaignGenreKind: "preset",
        campaignGenrePresetId: "classic_fantasy",
        ownerClientId: payload.ownerClientId,
        playerName: "Smoke Host"
      })
    });

    if (!response.ok) {
      throw new Error(`Campaign seed failed with ${response.status}`);
    }

    const body = (await response.json()) as {
      campaign: CampaignSummary;
    };

    return body.campaign;
  }, input);

  expect(campaign.id).toBeTruthy();
  expect(campaign.mode).toBe("multiplayer");
  expect(campaign.joinCode).toBeTruthy();

  return campaign;
}

export async function joinMultiplayerCampaignThroughBrowser(
  page: Page,
  input: {
    gameCode: string;
    clientId: string;
    username: string;
    characterName: string;
    characterSheet: string;
  }
): Promise<CampaignSummary> {
  const campaign = await page.evaluate(async (payload) => {
    const response = await fetch("/api/campaigns/join", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Campaign join seed failed with ${response.status}`);
    }

    const body = (await response.json()) as {
      campaign: CampaignSummary;
    };

    return body.campaign;
  }, input);

  expect(campaign.id).toBeTruthy();
  expect(campaign.mode).toBe("multiplayer");

  return campaign;
}
