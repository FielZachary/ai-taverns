import { expect, test } from "@playwright/test";
import {
  createMultiplayerCampaignThroughBrowser,
  joinMultiplayerCampaignThroughBrowser
} from "./support/campaigns";
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

  test("play shows provider-free multiplayer pre-begin room state with two complete players", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Room Smoke Adventure",
      ownerClientId: "playwright-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-room-smoke-joiner",
      username: "Room Smoke Joiner",
      characterName: "Mira Emberquill",
      characterSheet:
        "Mira Emberquill is a level 1 bard with a steady voice, a travel lute, and a habit of asking careful questions."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: mira emberquill/i })
    ).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play shows owner-visible multiplayer room state after a second complete player joins", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Owner Room Smoke Adventure",
      ownerClientId: "playwright-owner-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-owner-room-smoke-joiner",
      username: "Owner Room Smoke Joiner",
      characterName: "Tarin Mosswake",
      characterSheet:
        "Tarin Mosswake is a level 1 ranger with a careful map, a weathered bow, and a calm eye for hidden paths."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: smoke host/i })
    ).toBeVisible();
    await expect(page.getByText("Owner Room Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(page.getByText("Game Code")).toBeVisible();
    await expect(page.getByText(campaign.joinCode!)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play preserves multiplayer pre-begin room state after page reload", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "refresh-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Refresh Room Smoke Adventure",
      ownerClientId: "playwright-refresh-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "refresh-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-refresh-room-smoke-joiner",
      username: "Refresh Room Smoke Joiner",
      characterName: "Lio Starfen",
      characterSheet:
        "Lio Starfen is a level 1 wizard with a lantern staff, ink-stained notes, and a patient curiosity for old doors."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: lio starfen/i })
    ).toBeVisible();
    await expect(page.getByText("Refresh Room Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play reconnects a complete multiplayer player in a fresh browser context", async ({
    browser,
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "reconnect-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Reconnect Room Smoke Adventure",
      ownerClientId: "playwright-reconnect-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "reconnect-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-reconnect-room-smoke-joiner",
      username: "Reconnect Room Smoke Joiner",
      characterName: "Nessa Brightvale",
      characterSheet:
        "Nessa Brightvale is a level 1 cleric with a brass sun pendant, a worn field journal, and a gentle instinct for frightened travelers."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();

    const reconnectedContext = await browser.newContext({
      storageState: await page.context().storageState()
    });

    try {
      const reconnectedPage = await reconnectedContext.newPage();
      await reconnectedPage.goto(`/play?campaignId=${campaign.id}`);

      await expect(reconnectedPage).toHaveURL(
        new RegExp(`/play\\?campaignId=${campaign.id}$`)
      );
      await expect(
        reconnectedPage.getByRole("region", {
          name: "AI Dungeons and Dragons table"
        })
      ).toBeVisible();
      await expect(
        reconnectedPage.getByRole("button", {
          name: /open chat: nessa brightvale/i
        })
      ).toBeVisible();
      await expect(
        reconnectedPage.getByText("Reconnect Room Smoke Adventure")
      ).toBeVisible();
      await expect(
        reconnectedPage.getByText(
          "The party is gathered. Let the DM open the campaign."
        )
      ).toBeVisible();
      await expect(
        reconnectedPage.getByRole("button", { name: /begin adventure/i })
      ).toBeEnabled();
    } finally {
      await reconnectedContext.close();
    }
  });
});
