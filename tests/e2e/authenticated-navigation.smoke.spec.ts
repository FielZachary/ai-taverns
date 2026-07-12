import { expect, test } from "@playwright/test";
import { createMultiplayerCampaignThroughBrowser } from "./support/campaigns";
import { signInWithPasswordlessToken } from "./support/passwordless-auth";

test.describe("authenticated navigation smoke", () => {
  test("new adventure is reachable with a local authenticated session", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "smoke@example.com",
      nextPath: "/new-adventure"
    });

    await page.goto("/new-adventure");

    await expect(page).toHaveURL(/\/new-adventure$/);
    await expect(
      page.getByRole("main", { name: "Create a new adventure" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /singleplayer/i })).toBeVisible();
  });

  test("play is reachable with a seeded local campaign session", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "play-smoke@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Play Smoke Adventure",
      ownerClientId: "playwright-play-smoke"
    });

    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: smoke host/i })
    ).toBeVisible();
    await expect(page.getByText("Play Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("Gather at least two players to begin the adventure.")
    ).toBeVisible();
  });
});
